"""Dealer-facing portal API routes.

All authenticated endpoints resolve the dealer identity from the public
session token (via verified_dealer_id on the farmers record). No dealer_id
is accepted as a raw URL parameter or request body field from the dealer
app — this prevents IDOR attacks.
"""

from __future__ import annotations

import io
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, Response
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
    period: str = Query(default="month", pattern="^(today|month|all)$"),
    authorization: str = Header(...),
):
    """Return paginated coupon redemptions for the authenticated dealer."""
    per_page = min(per_page, 50)
    offset = (page - 1) * per_page

    with connection() as conn:
        dealer = _resolve_dealer(conn, authorization)
        dealer_id = dealer["id"]

        period_sql = ""
        if period == "today":
            period_sql = " AND cr.redeemed_at >= date_trunc('day', now())"
        elif period == "month":
            period_sql = " AND cr.redeemed_at >= date_trunc('month', now())"
        rows = conn.execute(
            """SELECT cr.id, cr.redeemed_at, cr.amount_redeemed, cr.purchase_reference,
                      c.code AS coupon_code,
                      cp.name AS campaign_name, cp.discount_type, cp.discount_value,
                      cp.rules, cr.credit_note_id
               FROM coupon_redemptions cr
               JOIN coupons c ON c.id = cr.coupon_id
               JOIN campaigns cp ON cp.id = c.campaign_id
               WHERE cr.dealer_id = %s""" + period_sql + """
               ORDER BY cr.redeemed_at DESC
               LIMIT %s OFFSET %s""",
            (dealer_id, per_page, offset),
        ).fetchall()

        totals = conn.execute(
            "SELECT COUNT(*) AS c, COALESCE(SUM(amount_redeemed),0) AS amount FROM coupon_redemptions cr WHERE dealer_id = %s" + period_sql,
            (dealer_id,),
        ).fetchone()

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
            "rules": r["rules"] or {},
            "settled": bool(r["credit_note_id"]),
        }
        for r in rows
    ]

    return {
        "status": "success",
        "items": items,
        "total": int(totals["c"]),
        "total_amount": float(totals["amount"]),
        "page": page,
        "per_page": per_page,
    }


@router.get("/me/redemption-summary")
def dealer_redemption_summary(authorization: str = Header(...)):
    """Dealer-facing reconciliation totals, trends and settlement history."""
    with connection() as conn:
        dealer = _resolve_dealer(conn, authorization)
        dealer_id = dealer["id"]
        summary = conn.execute(
            """SELECT
                 COUNT(*) FILTER (WHERE cr.redeemed_at >= date_trunc('day', now())) today_count,
                 COALESCE(SUM(cr.amount_redeemed) FILTER (WHERE cr.redeemed_at >= date_trunc('day', now())),0) today_amount,
                 COUNT(*) FILTER (WHERE cr.redeemed_at >= date_trunc('month', now())) month_count,
                 COALESCE(SUM(cr.amount_redeemed) FILTER (WHERE cr.redeemed_at >= date_trunc('month', now())),0) month_amount,
                 COUNT(*) all_count, COALESCE(SUM(cr.amount_redeemed),0) all_amount,
                 COUNT(*) FILTER (WHERE cr.credit_note_id IS NULL) outstanding_count,
                 COALESCE(SUM(cr.amount_redeemed) FILTER (WHERE cr.credit_note_id IS NULL),0) outstanding_amount
               FROM coupon_redemptions cr WHERE cr.dealer_id=%s""", (dealer_id,)
        ).fetchone()
        daily = conn.execute(
            """SELECT redeemed_at::date day, COUNT(*) count, COALESCE(SUM(amount_redeemed),0) amount
               FROM coupon_redemptions WHERE dealer_id=%s AND redeemed_at >= current_date - interval '29 days'
               GROUP BY redeemed_at::date ORDER BY day""", (dealer_id,)
        ).fetchall()
        monthly = conn.execute(
            """SELECT to_char(date_trunc('month', redeemed_at),'YYYY-MM') month, COUNT(*) count,
                      COALESCE(SUM(amount_redeemed),0) amount
               FROM coupon_redemptions WHERE dealer_id=%s AND redeemed_at >= date_trunc('month',now()) - interval '11 months'
               GROUP BY date_trunc('month', redeemed_at) ORDER BY date_trunc('month', redeemed_at)""", (dealer_id,)
        ).fetchall()
        notes = conn.execute(
            """SELECT id,note_number,period_start,period_end,redemption_count,total_amount,status,
                      generated_at,settled_at,settlement_reference
               FROM dealer_credit_notes WHERE dealer_id=%s ORDER BY generated_at DESC LIMIT 24""", (dealer_id,)
        ).fetchall()
    def normal(row):
        return {k: (v.isoformat() if hasattr(v, "isoformat") else float(v) if isinstance(v, Decimal) else v) for k,v in dict(row).items()}
    return {"summary": normal(summary), "daily": [normal(x) for x in daily], "monthly": [normal(x) for x in monthly], "credit_notes": [normal(x) for x in notes]}


def _dealer_report_pdf(dealer: dict, rows: list[dict], period: str) -> bytes:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(A4), rightMargin=14*mm, leftMargin=14*mm, topMargin=13*mm, bottomMargin=13*mm)
    styles = getSampleStyleSheet(); story=[]
    story.append(Paragraph("<b>Crop Life Science Limited</b>", styles["Title"]))
    story.append(Paragraph("Dealer Coupon Redemption Statement", styles["Heading2"]))
    story.append(Paragraph(f"Dealer: <b>{dealer['name']}</b> &nbsp; Code: {dealer['dealer_code']} &nbsp; Period: {period.title()}", styles["BodyText"]))
    story.append(Spacer(1, 7*mm))
    data=[["Date & time","Coupon","Campaign","Product / packing","Reference","Amount (INR)","Settlement"]]
    total=0.0
    for row in rows:
        amount=float(row["amount_redeemed"] or 0); total+=amount; rules=row["rules"] or {}
        scope=", ".join((rules.get("products") or []) + (rules.get("packings") or [])) or "All eligible products"
        data.append([row["redeemed_at"].strftime("%d %b %Y %H:%M"),row["coupon_code"],row["campaign_name"],scope,row["purchase_reference"] or "—",f"{amount:,.2f}","Included" if row["credit_note_id"] else "Outstanding"])
    data.append(["","","","","TOTAL",f"{total:,.2f}",""])
    table=Table(data,colWidths=[34*mm,29*mm,48*mm,61*mm,35*mm,28*mm,28*mm],repeatRows=1)
    table.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),colors.HexColor("#064878")),("TEXTCOLOR",(0,0),(-1,0),colors.white),("FONTNAME",(0,0),(-1,0),"Helvetica-Bold"),("GRID",(0,0),(-1,-2),.35,colors.HexColor("#b9c9d4")),("BACKGROUND",(0,1),(-1,-2),colors.HexColor("#f5f9fc")),("FONTNAME",(-2,-1),(-1,-1),"Helvetica-Bold"),("ALIGN",(-2,1),(-1,-1),"RIGHT"),("FONTSIZE",(0,0),(-1,-1),8),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6)]))
    story.append(table); story.append(Spacer(1,5*mm)); story.append(Paragraph("System-generated reconciliation statement. Final payment status is recorded in the CLSL admin portal.",styles["BodyText"]))
    doc.build(story); return output.getvalue()


@router.get("/me/redemptions/report.pdf")
def dealer_redemptions_report(period: str = Query(default="month", pattern="^(today|month|all)$"), authorization: str = Header(...)):
    with connection() as conn:
        dealer=_resolve_dealer(conn, authorization); where=""
        if period=="today": where=" AND cr.redeemed_at >= date_trunc('day',now())"
        elif period=="month": where=" AND cr.redeemed_at >= date_trunc('month',now())"
        rows=conn.execute("""SELECT cr.redeemed_at,cr.amount_redeemed,cr.purchase_reference,cr.credit_note_id,c.code coupon_code,cp.name campaign_name,cp.rules
          FROM coupon_redemptions cr JOIN coupons c ON c.id=cr.coupon_id JOIN campaigns cp ON cp.id=c.campaign_id
          WHERE cr.dealer_id=%s"""+where+" ORDER BY cr.redeemed_at DESC",(dealer["id"],)).fetchall()
    pdf=_dealer_report_pdf(dealer,rows,period)
    return Response(pdf,media_type="application/pdf",headers={"Content-Disposition":f'attachment; filename="CLSL-{dealer["dealer_code"]}-{period}-redemptions.pdf"'})


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

        token = existing["referral_token"] if existing else ""
        if len(token) != 7 or not token.isalnum():
            token = _new_short_referral_code()
        if existing:
            conn.execute("UPDATE dealer_referrals SET referral_token=%s WHERE dealer_id=%s", (token, dealer_id))
            conn.commit()
        else:
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
