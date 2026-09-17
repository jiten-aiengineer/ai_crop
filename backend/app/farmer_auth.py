import secrets
import json
import urllib.request
import urllib.parse
from fastapi import APIRouter, HTTPException, Request, Header
from pydantic import BaseModel, Field
from typing import Optional

from .db import connection
from .config import TWOFACTOR_API_KEY

router = APIRouter(prefix="/api/v1/public/auth", tags=["public_auth"])

class SendOtpPayload(BaseModel):
    mobile_number: str = Field(pattern=r"^\+?[1-9]\d{1,14}$")

class VerifyOtpPayload(BaseModel):
    mobile_number: str = Field(pattern=r"^\+?[1-9]\d{1,14}$")
    otp: str = Field(min_length=4, max_length=10)
    referral_token: Optional[str] = None

class RolePayload(BaseModel):
    role: str = Field(max_length=64)
    name: Optional[str] = Field(None, max_length=180)
    crop: Optional[str] = Field(None, max_length=160)
    location: Optional[str] = Field(None, max_length=240)

def _get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "127.0.0.1"

@router.post("/send-otp")
def send_otp(payload: SendOtpPayload, request: Request):
    ip = _get_client_ip(request)
    
    with connection() as conn:
        # Check IP rate limit (max 20 per day)
        row = conn.execute("SELECT COUNT(*) as c FROM auth_rate_limits WHERE identifier=%s AND action='otp_request_ip' AND expires_at > now()", (ip,)).fetchone()
        if row and row["c"] >= 20:
            raise HTTPException(429, "Too many requests from this IP.")
            
        # Check mobile rate limit (max 5 per hour)
        row = conn.execute("SELECT COUNT(*) as c FROM auth_rate_limits WHERE identifier=%s AND action='otp_request_mobile' AND expires_at > now()", (payload.mobile_number,)).fetchone()
        if row and row["c"] >= 5:
            raise HTTPException(429, "Too many requests for this mobile number.")

        # Log attempts
        conn.execute("INSERT INTO auth_rate_limits (identifier, action, expires_at) VALUES (%s, 'otp_request_ip', now() + interval '1 day')", (ip,))
        conn.execute("INSERT INTO auth_rate_limits (identifier, action, expires_at) VALUES (%s, 'otp_request_mobile', now() + interval '1 hour')", (payload.mobile_number,))
        conn.commit()

    if not TWOFACTOR_API_KEY:
        # Local development fallback
        print("MOCK 2FACTOR: Sending OTP to", payload.mobile_number)
        session_id = "mock-session-" + secrets.token_hex(8)
    else:
        url = f"https://2factor.in/API/V1/{TWOFACTOR_API_KEY}/SMS/{urllib.parse.quote(payload.mobile_number)}/AUTOGEN"
        req = urllib.request.Request(url, method="GET")
        try:
            with urllib.request.urlopen(req) as response:
                data = json.loads(response.read().decode())
                if data.get("Status") != "Success":
                    raise HTTPException(500, "Failed to send OTP.")
                session_id = data.get("Details")
        except Exception as e:
            print("2Factor API Error:", e)
            raise HTTPException(500, "Failed to communicate with SMS provider.")

    with connection() as conn:
        conn.execute(
            """
            INSERT INTO farmer_otps (mobile_number, session_id, expires_at)
            VALUES (%s, %s, now() + interval '10 minutes')
            """,
            (payload.mobile_number, session_id)
        )
        conn.commit()

    return {"status": "success", "message": "OTP sent successfully."}

@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpPayload):
    with connection() as conn:
        row = conn.execute(
            """
            SELECT id, session_id, attempts 
            FROM farmer_otps 
            WHERE mobile_number=%s AND expires_at > now()
            ORDER BY created_at DESC LIMIT 1
            """,
            (payload.mobile_number,)
        ).fetchone()
        
        if not row:
            raise HTTPException(400, "OTP not found or expired.")
            
        if row["attempts"] >= 5:
            raise HTTPException(400, "Maximum OTP attempts exceeded. Request a new OTP.")

        session_id = row["session_id"]
        
        # Verify with 2Factor
        if session_id.startswith("mock-session-"):
            if payload.otp != "123456":
                conn.execute("UPDATE farmer_otps SET attempts = attempts + 1 WHERE id=%s", (row["id"],))
                conn.commit()
                raise HTTPException(400, "Invalid OTP.")
        else:
            url = f"https://2factor.in/API/V1/{TWOFACTOR_API_KEY}/SMS/VERIFY/{session_id}/{payload.otp}"
            req = urllib.request.Request(url, method="GET")
            try:
                with urllib.request.urlopen(req) as response:
                    data = json.loads(response.read().decode())
                    if data.get("Status") != "Success":
                        conn.execute("UPDATE farmer_otps SET attempts = attempts + 1 WHERE id=%s", (row["id"],))
                        conn.commit()
                        raise HTTPException(400, "Invalid OTP.")
            except Exception as e:
                conn.execute("UPDATE farmer_otps SET attempts = attempts + 1 WHERE id=%s", (row["id"],))
                conn.commit()
                raise HTTPException(400, "Invalid OTP.")

        # Valid OTP. Get or create farmer
        dealer_id = None
        if payload.referral_token:
            dealer_row = conn.execute(
                "SELECT dealer_id FROM dealer_referrals WHERE referral_token=%s AND (expires_at IS NULL OR expires_at > now()) LIMIT 1",
                (payload.referral_token,)
            ).fetchone()
            if dealer_row:
                dealer_id = dealer_row["dealer_id"]

        farmer = conn.execute("SELECT id, role, name FROM farmers WHERE mobile_number=%s", (payload.mobile_number,)).fetchone()
        if not farmer:
            farmer = conn.execute(
                "INSERT INTO farmers (mobile_number, acquisition_dealer_id, is_verified) VALUES (%s, %s, true) RETURNING id, role, name",
                (payload.mobile_number, dealer_id)
            ).fetchone()
        else:
            conn.execute("UPDATE farmers SET is_verified = true WHERE id=%s", (farmer["id"],))
            if dealer_id:
                conn.execute("UPDATE farmers SET preferred_dealer_id=%s WHERE id=%s", (dealer_id, farmer["id"]))

        conn.execute("DELETE FROM farmer_otps WHERE mobile_number=%s", (payload.mobile_number,))
        
        # Create persistent session
        session_token = secrets.token_hex(64)
        conn.execute(
            "INSERT INTO public_sessions (farmer_id, session_token, expires_at) VALUES (%s, %s, now() + interval '30 days')",
            (farmer["id"], session_token)
        )
        conn.commit()
        
    return {
        "status": "success", 
        "session_token": session_token,
        "requires_onboarding": farmer["role"] is None
    }

@router.post("/role")
def set_role(payload: RolePayload, authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Invalid token")
    token = authorization[7:]
    
    with connection() as conn:
        session = conn.execute("SELECT farmer_id FROM public_sessions WHERE session_token=%s AND expires_at > now() AND revoked_at IS NULL", (token,)).fetchone()
        if not session:
            raise HTTPException(401, "Session expired")
            
        farmer_id = session["farmer_id"]
        
        # Build update query
        updates = ["role = %s"]
        params = [payload.role]
        
        if payload.name:
            updates.append("name = %s")
            params.append(payload.name)
            
        if payload.location:
            updates.append("village = %s")
            params.append(payload.location)
            
        if payload.crop:
            updates.append("crops_grown = %s")
            import json as json_lib
            params.append(json_lib.dumps([payload.crop]))
            
        params.append(farmer_id)
        
        query = "UPDATE farmers SET " + ", ".join(updates) + " WHERE id = %s"
        conn.execute(query, tuple(params))
        
        # Check welcome reward
        if payload.role.lower() == "farmer":
            campaign = conn.execute("SELECT id FROM campaigns WHERE status='active' AND name ILIKE '%%Welcome%%' AND start_date <= now() AND (end_date IS NULL OR end_date > now()) LIMIT 1").fetchone()
            if campaign:
                # Check if already issued
                existing = conn.execute("SELECT id FROM coupons WHERE farmer_id=%s AND campaign_id=%s", (farmer_id, campaign["id"])).fetchone()
                if not existing:
                    import uuid
                    coupon_code = "WLC-" + secrets.token_hex(4).upper()
                    conn.execute(
                        "INSERT INTO coupons (code, campaign_id, farmer_id, status, issued_at) VALUES (%s, %s, %s, 'issued', now())",
                        (coupon_code, campaign["id"], farmer_id)
                    )
        
        conn.commit()
        
    return {"status": "success"}
