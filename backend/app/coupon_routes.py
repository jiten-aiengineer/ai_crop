"""Coupon redemption routes.

The dealer-app flow uses a bearer session token to identify the dealer —
no dealer_id is accepted in the request body from the dealer app.
The legacy explicit dealer_id path is retained for admin tool use.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from .db import connection

router = APIRouter(prefix="/api/v1/coupons", tags=["coupons"])

_COUPON_CODE_PATTERN = re.compile(r"^[A-HJ-NP-Z2-9]{7}$")


def _normalise_coupon_code(raw_value: str) -> str:
    """Extract the canonical seven-character CLSL coupon code.

    Current app QRs contain the plain code.  URL and JSON payload support is
    intentionally accepted as well so older/newer app builds interoperate.
    Dealer-referral URLs (``?ref=``) are not treated as coupons.
    """
    value = (raw_value or "").strip()
    if not value:
        raise HTTPException(400, "Coupon code is required.")

    candidates: list[str] = [value]
    try:
        decoded = json.loads(value)
        if isinstance(decoded, dict):
            candidates.extend(
                str(decoded.get(key) or "")
                for key in ("coupon_code", "coupon", "code")
            )
    except (TypeError, ValueError, json.JSONDecodeError):
        pass

    try:
        parsed = urlparse(value)
        if parsed.scheme and parsed.netloc:
            query = parse_qs(parsed.query)
            for key in ("coupon_code", "coupon", "code"):
                candidates.extend(query.get(key, []))
            if parsed.path:
                candidates.append(parsed.path.rstrip("/").split("/")[-1])
    except ValueError:
        pass

    for candidate in candidates:
        normalised = candidate.strip().upper()
        if _COUPON_CODE_PATTERN.fullmatch(normalised):
            return normalised

    raise HTTPException(
        400,
        "This QR is not a valid CLSL coupon. Scan the coupon shown in the farmer's Rewards screen.",
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_dealer_id_from_session(conn, token: str) -> str:
    """Return verified_dealer_id for an active dealer session token."""
    row = conn.execute(
        """SELECT f.verified_dealer_id, f.role
           FROM public_sessions ps
           JOIN farmers f ON f.id = ps.farmer_id
           WHERE ps.session_token = %s
             AND ps.expires_at > now()
             AND ps.revoked_at IS NULL""",
        (token,),
    ).fetchone()
    if not row:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    if row["role"] != "dealer" or not row["verified_dealer_id"]:
        raise HTTPException(403, "A verified dealer login is required to redeem coupons.")

    # Confirm dealer is still active
    dealer = conn.execute(
        "SELECT id, status FROM dealers WHERE id = %s",
        (row["verified_dealer_id"],),
    ).fetchone()
    if not dealer or dealer["status"] != "active":
        raise HTTPException(403, "This dealership is not active.")
    return str(row["verified_dealer_id"])


def _fetch_and_validate_coupon(conn, coupon_code: str) -> dict:
    """Fetch a farmer coupon and validate campaign and coupon eligibility."""
    normalised_code = _normalise_coupon_code(coupon_code)
    coupon = conn.execute(
        """SELECT c.id, c.code, c.status, c.expires_at, c.farmer_id,
                  cp.discount_value, cp.discount_type, cp.name AS campaign_name,
                  cp.status AS campaign_status, cp.start_date, cp.end_date, cp.rules
           FROM coupons c
           JOIN campaigns cp ON c.campaign_id = cp.id
           WHERE c.code = %s""",
        (normalised_code,),
    ).fetchone()

    if not coupon:
        raise HTTPException(404, "Coupon code not found. Please check and try again.")
    if not coupon["farmer_id"]:
        raise HTTPException(400, "This coupon has not been issued to a farmer yet.")
    if coupon["campaign_status"] != "active":
        raise HTTPException(400, "This coupon campaign is currently paused or closed.")
    now = datetime.now(timezone.utc)
    if coupon["start_date"] > now:
        raise HTTPException(400, "This coupon campaign has not started yet.")
    if coupon["end_date"] and coupon["end_date"] < now:
        raise HTTPException(400, "This coupon campaign has ended.")
    if coupon["status"] not in {"available", "issued"}:
        raise HTTPException(
            400,
            f"This coupon has already been used or is not available. Status: {coupon['status']}",
        )
    if coupon["expires_at"] and coupon["expires_at"] <= now:
        raise HTTPException(400, "This coupon has expired.")
    return coupon


def _validate_purchase_scope(rules: dict, product_name: Optional[str], packing: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    allowed_products = [str(item).strip() for item in (rules.get("products") or []) if str(item).strip()]
    allowed_packings = [str(item).strip() for item in (rules.get("packings") or []) if str(item).strip()]

    chosen_product = (product_name or "").strip()
    chosen_packing = (packing or "").strip()
    if allowed_products:
        if not chosen_product:
            raise HTTPException(400, "Select the purchased CLSL product before redeeming this coupon.")
        if chosen_product.casefold() not in {item.casefold() for item in allowed_products}:
            raise HTTPException(400, "This coupon is not valid for the selected product.")
    if allowed_packings:
        if not chosen_packing:
            raise HTTPException(400, "Select the purchased pack size before redeeming this coupon.")
        if chosen_packing.casefold() not in {item.casefold() for item in allowed_packings}:
            raise HTTPException(400, "This coupon is not valid for the selected pack size.")
    return chosen_product or None, chosen_packing or None


def _redemption_amount(coupon: dict, purchase_amount: Optional[float]) -> float:
    discount_value = float(coupon["discount_value"] or 0)
    if coupon["discount_type"] == "percentage":
        if purchase_amount is None or purchase_amount <= 0:
            raise HTTPException(400, "Enter the bill amount to redeem a percentage coupon.")
        amount = purchase_amount * discount_value / 100
        maximum = float((coupon.get("rules") or {}).get("max_discount") or 0)
        if maximum:
            amount = min(amount, maximum)
        return round(min(amount, purchase_amount), 2)
    if purchase_amount is not None and purchase_amount > 0:
        return round(min(discount_value, purchase_amount), 2)
    return round(discount_value, 2)


def _do_redeem(
    conn,
    coupon_id,
    dealer_id: str,
    purchase_reference: Optional[str],
    amount_redeemed: float,
    product_name: Optional[str],
    packing: Optional[str],
):
    """Atomically redeem a coupon and insert exactly one ledger record."""
    updated = conn.execute(
        """UPDATE coupons SET status='redeemed'
           WHERE id=%s AND status IN ('available','issued')
           RETURNING id""",
        (coupon_id,),
    ).fetchone()
    if not updated:
        raise HTTPException(409, "This coupon was already redeemed. Refresh the statement to see the entry.")
    reference_parts = []
    if purchase_reference:
        reference_parts.append(purchase_reference.strip())
    if product_name:
        reference_parts.append(f"Product: {product_name}")
    if packing:
        reference_parts.append(f"Pack: {packing}")
    ledger_reference = " | ".join(reference_parts)[:120] or None
    conn.execute(
        """INSERT INTO coupon_redemptions (coupon_id, dealer_id, purchase_reference, amount_redeemed)
           VALUES (%s, %s, %s, %s)""",
        (coupon_id, dealer_id, ledger_reference, amount_redeemed),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Dealer-app redeem (session token based — primary flow)
# ---------------------------------------------------------------------------


@router.get("/validate/{coupon_code}")
def validate_coupon(
    coupon_code: str,
    authorization: str = Header(default=""),
):
    """Validate a coupon code and return its details without redeeming it."""
    with connection() as conn:
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Authentication required. Please sign in as a dealer.")

        token = authorization[7:].strip()
        _resolve_dealer_id_from_session(conn, token)
        
        # Validates that it's available and not expired
        coupon = _fetch_and_validate_coupon(conn, coupon_code)
        
        rules_dict = coupon.get("rules") or {}
        
        details = []
        if rules_dict.get("products"):
            details.append(f"Valid on: {', '.join(rules_dict['products'])}")
        if rules_dict.get("packings"):
            details.append(f"Pack size: {', '.join(rules_dict['packings'])}")
            
        if details:
            criteria = " | ".join(details)
        else:
            criteria = rules_dict.get("description") or "No specific criteria"

    return {
        "status": "success",
        "coupon_code": coupon["code"],
        "campaign_name": coupon["campaign_name"],
        "discount_value": float(coupon["discount_value"]) if coupon["discount_value"] else 0,
        "discount_type": coupon["discount_type"],
        "criteria": criteria,
        "products": rules_dict.get("products") or [],
        "packings": rules_dict.get("packings") or [],
        "requires_purchase_amount": coupon["discount_type"] == "percentage",
    }


class RedeemCouponPayload(BaseModel):
    coupon_code: str = Field(min_length=1, max_length=2048)
    purchase_reference: Optional[str] = Field(default=None, max_length=120)
    purchase_amount: Optional[float] = Field(default=None, gt=0)
    product_name: Optional[str] = Field(default=None, max_length=180)
    packing: Optional[str] = Field(default=None, max_length=120)


@router.post("/redeem")
def redeem_coupon(
    payload: RedeemCouponPayload,
    authorization: str = Header(default=""),
):
    """Redeem a coupon.

    Preferred path: dealer sends their session Bearer token and we resolve
    their dealer identity securely from it.
    """
    with connection() as conn:
        if not authorization.startswith("Bearer "):
            raise HTTPException(401, "Authentication required. Please sign in as a dealer.")

        token = authorization[7:].strip()
        dealer_id = _resolve_dealer_id_from_session(conn, token)
        coupon = _fetch_and_validate_coupon(conn, payload.coupon_code)
        product_name, packing = _validate_purchase_scope(
            coupon.get("rules") or {}, payload.product_name, payload.packing
        )
        amount = _redemption_amount(coupon, payload.purchase_amount)
        _do_redeem(
            conn, coupon["id"], dealer_id, payload.purchase_reference,
            amount, product_name, packing,
        )

    return {
        "status": "success",
        "message": "Coupon redeemed successfully.",
        "coupon_code": coupon["code"],
        "campaign_name": coupon["campaign_name"],
        "discount_value": float(coupon["discount_value"]) if coupon["discount_value"] else 0,
        "discount_type": coupon["discount_type"],
        "amount_redeemed": amount,
    }


# ---------------------------------------------------------------------------
# Admin / tool redeem (explicit dealer_id — for CLSL internal use only)
# ---------------------------------------------------------------------------


class AdminRedeemCouponPayload(BaseModel):
    coupon_code: str
    dealer_id: str
    purchase_reference: Optional[str] = None
    amount_redeemed: Optional[float] = None
    product_name: Optional[str] = None
    packing: Optional[str] = None


@router.post("/admin/redeem")
def admin_redeem_coupon(
    payload: AdminRedeemCouponPayload,
    x_internal_token: str = Header(default=""),
):
    """Admin-only coupon redemption with explicit dealer_id.
    Requires the INTERNAL_SERVICE_TOKEN header.
    """
    from .config import INTERNAL_SERVICE_TOKEN  # avoid circular at module level

    if not x_internal_token or x_internal_token != INTERNAL_SERVICE_TOKEN:
        raise HTTPException(403, "Admin access required.")

    with connection() as conn:
        dealer = conn.execute(
            "SELECT id FROM dealers WHERE id = %s AND status = 'active'",
            (payload.dealer_id,),
        ).fetchone()
        if not dealer:
            raise HTTPException(404, "Active dealer not found.")

        coupon = _fetch_and_validate_coupon(conn, payload.coupon_code)
        product_name, packing = _validate_purchase_scope(
            coupon.get("rules") or {}, payload.product_name, payload.packing
        )
        amount = payload.amount_redeemed
        if amount is None:
            amount = _redemption_amount(coupon, None)
        _do_redeem(
            conn, coupon["id"], payload.dealer_id,
            payload.purchase_reference, amount, product_name, packing,
        )

    return {
        "status": "success",
        "message": "Coupon redeemed successfully (admin).",
        "discount_value": float(coupon["discount_value"]),
        "discount_type": coupon["discount_type"],
    }
