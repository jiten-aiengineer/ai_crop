import secrets
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .db import connection

router = APIRouter(prefix="/api/v1/dealers", tags=["dealers"])

class DealerLoginPayload(BaseModel):
    dealer_code: str
    contact_number: str

@router.post("/auth")
def dealer_auth(payload: DealerLoginPayload):
    with connection() as conn:
        row = conn.execute(
            "SELECT id, name, status FROM dealers WHERE dealer_code=%s AND contact_number=%s",
            (payload.dealer_code, payload.contact_number)
        ).fetchone()
        if not row:
            raise HTTPException(401, "Invalid dealer credentials.")
        if row["status"] != "active":
            raise HTTPException(403, "Dealer account is not active.")
        
    return {"status": "success", "dealer_id": str(row["id"]), "name": row["name"]}

@router.get("/{dealer_id}/referral-qr")
def get_referral_qr(dealer_id: str):
    with connection() as conn:
        # Check if dealer exists
        dealer = conn.execute("SELECT id FROM dealers WHERE id=%s", (dealer_id,)).fetchone()
        if not dealer:
            raise HTTPException(404, "Dealer not found.")
            
        # Check existing valid token
        existing = conn.execute(
            "SELECT referral_token FROM dealer_referrals WHERE dealer_id=%s AND (expires_at IS NULL OR expires_at > now()) LIMIT 1",
            (dealer_id,)
        ).fetchone()
        
        if existing:
            token = existing["referral_token"]
        else:
            token = secrets.token_urlsafe(16)
            conn.execute(
                "INSERT INTO dealer_referrals (dealer_id, referral_token) VALUES (%s, %s)",
                (dealer_id, token)
            )
            conn.commit()
            
    return {"status": "success", "referral_token": token, "qr_link": f"https://ai.croplifescience.com/join/{token}"}
