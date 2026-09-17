from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import connection

router = APIRouter(prefix="/api/v1/coupons", tags=["coupons"])

class RedeemCouponPayload(BaseModel):
    coupon_code: str
    dealer_id: str
    purchase_reference: str | None = None
    amount_redeemed: float | None = None

@router.post("/redeem")
def redeem_coupon(payload: RedeemCouponPayload):
    with connection() as conn:
        # Check dealer
        dealer = conn.execute("SELECT id FROM dealers WHERE id=%s AND status='active'", (payload.dealer_id,)).fetchone()
        if not dealer:
            raise HTTPException(404, "Active dealer not found.")
            
        # Get coupon
        coupon = conn.execute(
            """
            SELECT c.id, c.status, c.expires_at, cp.discount_value, cp.discount_type 
            FROM coupons c
            JOIN campaigns cp ON c.campaign_id = cp.id
            WHERE c.code=%s
            """,
            (payload.coupon_code,)
        ).fetchone()
        
        if not coupon:
            raise HTTPException(404, "Coupon not found.")
            
        if coupon["status"] != "available":
            raise HTTPException(400, f"Coupon is not available for redemption. Current status: {coupon['status']}")
            
        if coupon["expires_at"]:
            valid = conn.execute("SELECT (expires_at > now()) as is_valid FROM coupons WHERE id=%s", (coupon["id"],)).fetchone()
            if not valid["is_valid"]:
                 raise HTTPException(400, "Coupon has expired.")
                 
        # Redeem
        conn.execute(
            """
            UPDATE coupons SET status='redeemed' WHERE id=%s
            """,
            (coupon["id"],)
        )
        conn.execute(
            """
            INSERT INTO coupon_redemptions (coupon_id, dealer_id, purchase_reference, amount_redeemed)
            VALUES (%s, %s, %s, %s)
            """,
            (coupon["id"], payload.dealer_id, payload.purchase_reference, payload.amount_redeemed)
        )
        conn.commit()
        
    return {"status": "success", "message": "Coupon redeemed successfully.", "discount_value": float(coupon["discount_value"]), "discount_type": coupon["discount_type"]}
