"""Dealer-facing portal API routes.

All authenticated endpoints resolve the dealer identity from the public
session token (via verified_dealer_id on the farmers record). No dealer_id
is accepted as a raw URL parameter or request body field from the dealer
app — this prevents IDOR attacks.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from .db import connection

router = APIRouter(prefix="/api/v1/dealers", tags=["dealers"])
_REFERRAL_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _new_short_referral_code() -> str:
    return "".join(secrets.choice(_REFERRAL_ALPHABET) for _ in range(7))


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _resolve_dealer(conn, authorization: str) -> dict:
    """Resolve and validate the dealer behind a public session token."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in again to continue.")
    token = authorization[7:].strip()

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
        raise HTTPException(403, "A verified dealer login is required.")

    dealer = conn.execute(
        """SELECT id, name, dealer_code, location, state,
                  sales_territory, sales_area, sales_region,
                  status, portal_mobile_number,
                  referral_target, referral_target_label,
                  referral_target_2, referral_target_label_2
           FROM dealers WHERE id = %s""",
        (row["verified_dealer_id"],),
    ).fetchone()

    if not dealer or dealer["status"] != "active":
        raise HTTPException(403, "This dealership is not active.")
    return dealer


def _month_bounds():
    """Return (start, end) ISO timestamps for the current calendar month (UTC)."""
    now = datetime.now(timezone.utc)
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if now.month == 12:
        end = start.replace(year=now.year + 1, month=1)
    else:
        end = start.replace(month=now.month + 1)
    return start.isoformat(), end.isoformat()


# ---------------------------------------------------------------------------
# Dealer dashboard
# ---------------------------------------------------------------------------


@router.get("/me/dashboard")
def dealer_dashboard(authorization: str = Header(...)):
    """Return target progress and monthly coupon redemption summary."""
    with connection() as conn:
        dealer = _resolve_dealer(conn, authorization)
        dealer_id = dealer["id"]

        month_start, month_end = _month_bounds()

        # Farmers registered through this dealer in the current calendar month
        monthly_referrals = conn.execute(
            """SELECT COUNT(*) AS c FROM farmers
               WHERE verified_dealer_id = %s
                 AND location_consent_at >= %s
                 AND location_consent_at < %s""",
            (dealer_id, month_start, month_end),
        ).fetchone()["c"]

        # All-time farmers registered through this dealer
        total_referrals = conn.execute(
            "SELECT COUNT(*) AS c FROM farmers WHERE verified_dealer_id = %s",
            (dealer_id,),
        ).fetchone()["c"]

        # Monthly coupon redemption count and total value
        monthly_redemptions = conn.execute(
            """SELECT COUNT(*) AS cnt,
                      COALESCE(SUM(cr.amount_redeemed), 0) AS total_amount
               FROM coupon_redemptions cr
               WHERE cr.dealer_id = %s
                 AND cr.redeemed_at >= %s
                 AND cr.redeemed_at < %s""",
            (dealer_id, month_start, month_end),
        ).fetchone()

        # All-time coupon totals
        alltime_redemptions = conn.execute(
            """SELECT COUNT(*) AS cnt,
                      COALESCE(SUM(cr.amount_redeemed), 0) AS total_amount
               FROM coupon_redemptions cr
               WHERE cr.dealer_id = %s""",
            (dealer_id,),
        ).fetchone()

    target = dealer["referral_target"] or 10
    target2 = dealer["referral_target_2"] or 25
    tier = (
        2 if monthly_referrals >= target2
        else 1 if monthly_referrals >= target
        else 0
    )

    return {
        "status": "success",
        "dealer": {
            "id": str(dealer_id),
            "name": dealer["name"],
            "dealer_code": dealer["dealer_code"],
            "location": dealer["location"],
            "state": dealer["state"],
            "sales_territory": dealer["sales_territory"],
        },
        "targets": {
            "tier1_target": target,
            "tier1_label": dealer["referral_target_label"] or "CLSL Gift Hamper — Tier 1",
            "tier2_target": target2,
            "tier2_label": dealer["referral_target_label_2"] or "CLSL Gift Hamper — Tier 2",
            "monthly_referrals": int(monthly_referrals),
            "total_referrals": int(total_referrals),
            "eligible_tier": tier,
        },
        "redemptions": {
            "monthly_count": int(monthly_redemptions["cnt"]),
            "monthly_amount": float(monthly_redemptions["total_amount"]),
            "alltime_count": int(alltime_redemptions["cnt"]),
            "alltime_amount": float(alltime_redemptions["total_amount"]),
            "month_label": datetime.now(timezone.utc).strftime("%B %Y"),
        },
    }


# ---------------------------------------------------------------------------
# Coupon redemption list
# ---------------------------------------------------------------------------


@router.get("/me/redemptions")
def dealer_redemptions(
    page: int = 1,
    per_page: int = 20,
    authorization: str = Header(...),
):
    """Return paginated coupon redemptions for the authenticated dealer."""
    per_page = min(per_page, 50)
    offset = (page - 1) * per_page

    with connection() as conn:
        dealer = _resolve_dealer(conn, authorization)
        dealer_id = dealer["id"]

        rows = conn.execute(
            """SELECT cr.id, cr.redeemed_at, cr.amount_redeemed, cr.purchase_reference,
                      c.code AS coupon_code,
                      cp.name AS campaign_name, cp.discount_type, cp.discount_value
               FROM coupon_redemptions cr
               JOIN coupons c ON c.id = cr.coupon_id
               JOIN campaigns cp ON cp.id = c.campaign_id
               WHERE cr.dealer_id = %s
               ORDER BY cr.redeemed_at DESC
               LIMIT %s OFFSET %s""",
            (dealer_id, per_page, offset),
        ).fetchall()

        total = conn.execute(
            "SELECT COUNT(*) AS c FROM coupon_redemptions WHERE dealer_id = %s",
            (dealer_id,),
        ).fetchone()["c"]

    items = [
        {
            "id": str(r["id"]),
            "redeemed_at": r["redeemed_at"].isoformat() if r["redeemed_at"] else None,
            "coupon_code": r["coupon_code"],
            "campaign_name": r["campaign_name"],
            "discount_type": r["discount_type"],
            "discount_value": float(r["discount_value"]) if r["discount_value"] else 0,
            "amount_redeemed": float(r["amount_redeemed"]) if r["amount_redeemed"] else 0,
            "purchase_reference": r["purchase_reference"],
        }
        for r in rows
    ]

    return {
        "status": "success",
        "items": items,
        "total": int(total),
        "page": page,
        "per_page": per_page,
    }


# ---------------------------------------------------------------------------
# Referral token + QR code
# ---------------------------------------------------------------------------


@router.get("/me/referral")
def dealer_referral(authorization: str = Header(...)):
    """Return or create a referral token and QR code data-URL for the dealer."""
    with connection() as conn:
        dealer = _resolve_dealer(conn, authorization)
        dealer_id = dealer["id"]

        existing = conn.execute(
            """SELECT referral_token FROM dealer_referrals
               WHERE dealer_id = %s
                 AND (expires_at IS NULL OR expires_at > now())
               ORDER BY created_at DESC LIMIT 1""",
            (dealer_id,),
        ).fetchone()

        if existing:
            token = existing["referral_token"]
        else:
            token = _new_short_referral_code()
            conn.execute(
                "INSERT INTO dealer_referrals(dealer_id, referral_token) VALUES (%s, %s)",
                (dealer_id, token),
            )
            conn.commit()

    link = f"https://ai.croplifescience.com/?ref={token}"

    # Generate QR code as a base64 PNG data-URL (uses the 'qrcode' package)
    qr_data_url: Optional[str] = None
    try:
        import base64
        import io
        import qrcode  # type: ignore[import]
        from qrcode.image.pure import PyPNGImage  # type: ignore[import]

        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=3)
        qr.add_data(link)
        qr.make(fit=True)
        img = qr.make_image(image_factory=PyPNGImage)
        buf = io.BytesIO()
        img.save(buf)
        qr_data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        # qrcode package may not be installed; frontend will show the plain link
        qr_data_url = None

    return {
        "status": "success",
        "dealer_name": dealer["name"],
        "token": token,
        "referral_url": link,
        "qr_data_url": qr_data_url,
    }


# ---------------------------------------------------------------------------
# Legacy endpoint — kept for admin tooling, not used by dealer app
# ---------------------------------------------------------------------------


class LegacyDealerLoginPayload(BaseModel):
    dealer_code: str
    contact_number: str


@router.post("/auth")
def dealer_auth_legacy(payload: LegacyDealerLoginPayload):
    """Legacy auth endpoint retained for admin/testing tools only.
    The dealer-facing app now uses the public OTP session flow.
    """
    with connection() as conn:
        row = conn.execute(
            "SELECT id, name, status FROM dealers WHERE dealer_code=%s AND contact_number=%s",
            (payload.dealer_code, payload.contact_number),
        ).fetchone()
        if not row:
            raise HTTPException(401, "Invalid dealer credentials.")
        if row["status"] != "active":
            raise HTTPException(403, "Dealer account is not active.")

    return {"status": "success", "dealer_id": str(row["id"]), "name": row["name"]}
