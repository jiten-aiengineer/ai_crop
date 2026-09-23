"""Coupon redemption routes.

The dealer-app flow uses a bearer session token to identify the dealer —
no dealer_id is accepted in the request body from the dealer app.
The legacy explicit dealer_id path is retained for admin tool use.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .db import connection

router = APIRouter(prefix="/api/v1/coupons", tags=["coupons"])


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
    """Fetch coupon by code, validate it is available and not expired."""
    coupon = conn.execute(
        """SELECT c.id, c.status, c.expires_at,
                  cp.discount_value, cp.discount_type, cp.name AS campaign_name
           FROM coupons c
           JOIN campaigns cp ON c.campaign_id = cp.id
           WHERE c.code = %s""",
        (coupon_code.strip().upper(),),
    ).fetchone()

    if not coupon:
        raise HTTPException(404, "Coupon code not found. Please check and try again.")
    if coupon["status"] not in {"available", "issued"}:
        raise HTTPException(
            400,
            f"This coupon has already been used or is not available. Status: {coupon['status']}",
        )
    if coupon["expires_at"]:
        valid = conn.execute(
            "SELECT (expires_at > now()) AS is_valid FROM coupons WHERE id = %s",
            (coupon["id"],),
        ).fetchone()
        if not valid["is_valid"]:
            raise HTTPException(400, "This coupon has expired.")
    return coupon


def _do_redeem(conn, coupon_id, dealer_id: str, purchase_reference: Optional[str], amount_redeemed: Optional[float]):
    """Mark coupon as redeemed and insert redemption record."""
    conn.execute("UPDATE coupons SET status='redeemed' WHERE id = %s", (coupon_id,))
    conn.execute(
        """INSERT INTO coupon_redemptions (coupon_id, dealer_id, purchase_reference, amount_redeemed)
           VALUES (%s, %s, %s, %s)""",
        (coupon_id, dealer_id, purchase_reference, amount_redeemed),
    )
    conn.commit()


# ---------------------------------------------------------------------------
# Dealer-app redeem (session token based — primary flow)
# ---------------------------------------------------------------------------


class RedeemCouponPayload(BaseModel):
    coupon_code: str
    purchase_reference: Optional[str] = None


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
        amount = float(coupon["discount_value"]) if coupon["discount_value"] else None
        _do_redeem(conn, coupon["id"], dealer_id, payload.purchase_reference, amount)

    return {
        "status": "success",
        "message": "Coupon redeemed successfully.",
        "coupon_code": payload.coupon_code.strip().upper(),
        "campaign_name": coupon["campaign_name"],
        "discount_value": float(coupon["discount_value"]) if coupon["discount_value"] else 0,
        "discount_type": coupon["discount_type"],
    }


# ---------------------------------------------------------------------------
# Admin / tool redeem (explicit dealer_id — for CLSL internal use only)
# ---------------------------------------------------------------------------


class AdminRedeemCouponPayload(BaseModel):
    coupon_code: str
    dealer_id: str
    purchase_reference: Optional[str] = None
    amount_redeemed: Optional[float] = None


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
        _do_redeem(
            conn, coupon["id"], payload.dealer_id,
            payload.purchase_reference, payload.amount_redeemed,
        )

    return {
        "status": "success",
        "message": "Coupon redeemed successfully (admin).",
        "discount_value": float(coupon["discount_value"]),
        "discount_type": coupon["discount_type"],
    }
