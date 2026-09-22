"""Provider-neutral public onboarding for CLSL AI.

The test phase accepts the configured shared OTP (123456 by default). Airtel
DLT will later replace only the OTP transport, without changing profile data.
"""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from .config import PUBLIC_AUTH_MODE, PUBLIC_AUTH_TOKEN_PEPPER, PUBLIC_SESSION_DAYS, PUBLIC_TEST_OTP
from .db import connection

router = APIRouter(prefix="/api/v1/public/auth", tags=["public_auth"])
PublicRole = Literal["general_user", "farmer", "dealer", "other"]


class SendOtpPayload(BaseModel):
    mobile_number: str = Field(pattern=r"^\+?[1-9]\d{9,14}$")
    # A dealer code is only supplied by the private dealer onboarding path.  It
    # lets us fail early when a mobile is already bound to a different dealer,
    # before we consume the one-time code and create a short-lived session.
    dealer_code: Optional[str] = Field(default=None, max_length=64)


class VerifyOtpPayload(BaseModel):
    mobile_number: str = Field(pattern=r"^\+?[1-9]\d{9,14}$")
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class DealerLookupPayload(BaseModel):
    dealer_code: str = Field(min_length=2, max_length=64)


class ReferralLookupPayload(BaseModel):
    referral_code: str = Field(min_length=2, max_length=128)


class ProfilePayload(BaseModel):
    role: PublicRole
    first_name: str = Field(min_length=2, max_length=180)
    preferred_language: str = Field(default="en", pattern=r"^(en|hi|gu|mr|bn|bho)$")
    email: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=120)
    district: Optional[str] = Field(default=None, max_length=120)
    village: Optional[str] = Field(default=None, max_length=120)
    state: Optional[str] = Field(default=None, max_length=120)
    social_media_used: list[str] = Field(default_factory=list, max_length=12)
    acquisition_source: Optional[str] = Field(default=None, max_length=120)
    referral_code: Optional[str] = Field(default=None, max_length=128)
    dealer_code: Optional[str] = Field(default=None, max_length=64)
    location_latitude: Optional[float] = Field(default=None, ge=-90, le=90)
    location_longitude: Optional[float] = Field(default=None, ge=-180, le=180)
    location_consent: bool = False
    location_label: str = Field(min_length=3, max_length=300)
    location_postcode: Optional[str] = Field(default=None, max_length=24)
    location_country: Optional[str] = Field(default="India", max_length=100)
    location_accuracy_meters: Optional[float] = Field(default=None, ge=0, le=100000)
    location_metadata: dict = Field(default_factory=dict)

    @field_validator("email")
    @classmethod
    def valid_optional_email(cls, value: Optional[str]) -> Optional[str]:
        cleaned = (value or "").strip().lower()
        if not cleaned:
            return None
        if "@" not in cleaned or cleaned.startswith("@") or cleaned.endswith("@"):
            raise ValueError("Enter a valid email address.")
        return cleaned

    @field_validator("social_media_used")
    @classmethod
    def clean_social_media(cls, values: list[str]) -> list[str]:
        cleaned: list[str] = []
        for value in values:
            item = value.strip()[:40]
            if item and item not in cleaned:
                cleaned.append(item)
        return cleaned


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    return forwarded or (request.client.host if request.client else "127.0.0.1")


def _otp_hash(mobile_number: str, otp: str) -> str:
    value = f"{mobile_number}:{otp}:{PUBLIC_AUTH_TOKEN_PEPPER}".encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def _token(authorization: str) -> str:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in again to continue.")
    return authorization[7:].strip()


def _session_user(conn, authorization: str):
    row = conn.execute(
        """SELECT f.* FROM public_sessions ps JOIN farmers f ON f.id=ps.farmer_id
           WHERE ps.session_token=%s AND ps.expires_at>now() AND ps.revoked_at IS NULL""",
        (_token(authorization),),
    ).fetchone()
    if not row:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    return row


def _public_user(row) -> dict:
    return {
        "id": str(row["id"]), "mobile_number": row["mobile_number"],
        "first_name": row.get("name") or "", "role": row.get("role"),
        "preferred_language": row.get("preferred_language") or "en",
        "email": row.get("email"), "city": row.get("city"),
        "district": row.get("district"), "village": row.get("village"),
        "state": row.get("state"), "social_media_used": row.get("social_media_used") or [],
        "acquisition_source": row.get("acquisition_source"),
        "location_label": row.get("location_label"),
        "location_postcode": row.get("location_postcode"),
        "location_country": row.get("location_country"),
        "location_latitude": float(row["location_latitude"]) if row.get("location_latitude") is not None else None,
        "location_longitude": float(row["location_longitude"]) if row.get("location_longitude") is not None else None,
        "requires_onboarding": not bool(row.get("role") and row.get("name") and row.get("location_consent_at")),
    }


@router.post("/dealer-lookup")
def dealer_lookup(payload: DealerLookupPayload):
    with connection() as conn:
        row = conn.execute(
            """SELECT dealer_code,name,location,sales_area,sales_region,sales_territory,state,status,
                      (portal_mobile_number IS NOT NULL) AS already_bound
               FROM dealers WHERE lower(dealer_code)=lower(%s) LIMIT 1""",
            (payload.dealer_code.strip(),),
        ).fetchone()
    if not row or row["status"] != "active":
        raise HTTPException(404, "Active dealer code not found. Check the code with CLSL.")
    return {"status": "success", "dealer": row}


@router.post("/referral-lookup")
def referral_lookup(payload: ReferralLookupPayload):
    with connection() as conn:
        row = conn.execute(
            """SELECT d.name,d.state,d.sales_territory FROM dealer_referrals dr
               JOIN dealers d ON d.id=dr.dealer_id
               WHERE lower(dr.referral_token)=lower(%s)
                 AND (dr.expires_at IS NULL OR dr.expires_at>now())
                 AND d.status='active' LIMIT 1""",
            (payload.referral_code.strip(),),
        ).fetchone()
    if not row:
        raise HTTPException(404, "Referral code not found or expired.")
    return {"status": "success", "dealer": row}


@router.post("/send-otp")
def send_otp(payload: SendOtpPayload, request: Request):
    if PUBLIC_AUTH_MODE != "test":
        raise HTTPException(503, "Airtel DLT is not configured yet. Use test mode during development.")
    ip = _client_ip(request)
    with connection() as conn:
        if payload.dealer_code:
            dealer = conn.execute(
                """SELECT id, portal_mobile_number, contact_number, status
                   FROM dealers WHERE lower(dealer_code)=lower(%s) LIMIT 1""",
                (payload.dealer_code.strip(),),
            ).fetchone()
            if not dealer or dealer["status"] != "active":
                raise HTTPException(400, "Active dealer code not found. Check the code with CLSL.")
            if dealer["portal_mobile_number"] and dealer["portal_mobile_number"] != payload.mobile_number:
                raise HTTPException(409, "This dealer code is already linked to another verified mobile number.")
            registered_mobile = "".join(character for character in (dealer["contact_number"] or "") if character.isdigit())[-10:]
            submitted_mobile = "".join(character for character in payload.mobile_number if character.isdigit())[-10:]
            if registered_mobile and registered_mobile != submitted_mobile:
                raise HTTPException(403, "Use the mobile number registered for this dealer code.")
            another_dealer = conn.execute(
                "SELECT 1 FROM dealers WHERE portal_mobile_number=%s AND id<>%s LIMIT 1",
                (payload.mobile_number, dealer["id"]),
            ).fetchone()
            if another_dealer:
                raise HTTPException(409, "This mobile is already linked to a different dealership. Use its registered mobile number or ask CLSL administration to reset the old test binding.")
        ip_count = conn.execute("SELECT COUNT(*) AS c FROM auth_rate_limits WHERE identifier=%s AND action='otp_request_ip' AND expires_at>now()", (ip,)).fetchone()["c"]
        mobile_count = conn.execute("SELECT COUNT(*) AS c FROM auth_rate_limits WHERE identifier=%s AND action='otp_request_mobile' AND expires_at>now()", (payload.mobile_number,)).fetchone()["c"]
        if ip_count >= 30:
            raise HTTPException(429, "Too many OTP requests from this connection today.")
        if mobile_count >= 8:
            raise HTTPException(429, "Too many OTP requests for this mobile number. Try later.")
        conn.execute("INSERT INTO auth_rate_limits(identifier,action,expires_at) VALUES(%s,'otp_request_ip',now()+interval '1 day')", (ip,))
        conn.execute("INSERT INTO auth_rate_limits(identifier,action,expires_at) VALUES(%s,'otp_request_mobile',now()+interval '1 hour')", (payload.mobile_number,))
        conn.execute("DELETE FROM farmer_otps WHERE mobile_number=%s", (payload.mobile_number,))
        conn.execute("INSERT INTO farmer_otps(mobile_number,otp_hash,expires_at) VALUES(%s,%s,now()+interval '10 minutes')", (payload.mobile_number, _otp_hash(payload.mobile_number, PUBLIC_TEST_OTP)))
        conn.commit()
    return {"status": "success", "message": "Test OTP is ready.", "auth_mode": "test", "test_otp": PUBLIC_TEST_OTP}


@router.post("/verify-otp")
def verify_otp(payload: VerifyOtpPayload, request: Request):
    with connection() as conn:
        row = conn.execute("SELECT id,otp_hash,attempts FROM farmer_otps WHERE mobile_number=%s AND expires_at>now() ORDER BY created_at DESC LIMIT 1", (payload.mobile_number,)).fetchone()
        if not row:
            raise HTTPException(400, "OTP not found or expired. Request a new OTP.")
        if row["attempts"] >= 5:
            raise HTTPException(429, "Maximum OTP attempts exceeded. Request a new OTP.")
        if not secrets.compare_digest(row["otp_hash"], _otp_hash(payload.mobile_number, payload.otp)):
            conn.execute("UPDATE farmer_otps SET attempts=attempts+1 WHERE id=%s", (row["id"],))
            conn.commit()
            raise HTTPException(400, "Invalid OTP. For testing, enter 123456.")
        user = conn.execute("SELECT * FROM farmers WHERE mobile_number=%s", (payload.mobile_number,)).fetchone()
        if not user:
            user = conn.execute("INSERT INTO farmers(mobile_number,is_verified,last_login_at) VALUES(%s,true,now()) RETURNING *", (payload.mobile_number,)).fetchone()
        else:
            user = conn.execute("UPDATE farmers SET is_verified=true,last_login_at=now(),updated_at=now() WHERE id=%s RETURNING *", (user["id"],)).fetchone()
        conn.execute("DELETE FROM farmer_otps WHERE mobile_number=%s", (payload.mobile_number,))
        conn.execute("UPDATE public_sessions SET revoked_at=now() WHERE farmer_id=%s AND revoked_at IS NULL", (user["id"],))
        session_token = secrets.token_urlsafe(48)
        conn.execute(
            f"INSERT INTO public_sessions(farmer_id,session_token,ip_address,user_agent,expires_at) VALUES(%s,%s,%s,%s,now()+interval '{PUBLIC_SESSION_DAYS} days')",
            (user["id"], session_token, _client_ip(request), request.headers.get("user-agent", "")[:500]),
        )
        conn.commit()
    return {"status": "success", "session_token": session_token, "user": _public_user(user)}


@router.post("/profile")
def save_profile(payload: ProfilePayload, authorization: str = Header(...)):
    if not payload.location_consent or payload.location_latitude is None or payload.location_longitude is None:
        raise HTTPException(400, "Current device location is required to continue.")
    if not payload.district or not payload.state or not payload.location_label:
        raise HTTPException(400, "District and state could not be verified from the current location.")
    if payload.dealer_code and payload.referral_code:
        raise HTTPException(400, "Use either your own dealer code or a dealer referral code, not both.")
    if payload.role == "dealer" and not payload.dealer_code:
        raise HTTPException(400, "Dealer code is required.")
    with connection() as conn:
        user = _session_user(conn, authorization)
        referral_dealer_id = None
        verified_dealer_id = None
        if payload.referral_code:
            referral = conn.execute(
                """SELECT dr.dealer_id FROM dealer_referrals dr JOIN dealers d ON d.id=dr.dealer_id
                   WHERE lower(dr.referral_token)=lower(%s) AND (dr.expires_at IS NULL OR dr.expires_at>now())
                     AND d.status='active' LIMIT 1""", (payload.referral_code.strip(),),
            ).fetchone()
            if not referral:
                raise HTTPException(400, "Referral code not found or expired.")
            referral_dealer_id = referral["dealer_id"]
        if payload.role == "dealer":
            dealer = conn.execute("SELECT id,portal_mobile_number,contact_number,status FROM dealers WHERE lower(dealer_code)=lower(%s) LIMIT 1", (payload.dealer_code.strip(),)).fetchone()
            if not dealer or dealer["status"] != "active":
                raise HTTPException(400, "Active dealer code not found.")
            if dealer["portal_mobile_number"] and dealer["portal_mobile_number"] != user["mobile_number"]:
                raise HTTPException(409, "This dealer code is already linked to another verified mobile number.")
            registered_mobile = "".join(character for character in (dealer["contact_number"] or "") if character.isdigit())[-10:]
            user_mobile = "".join(character for character in user["mobile_number"] if character.isdigit())[-10:]
            if registered_mobile and registered_mobile != user_mobile:
                raise HTTPException(403, "Use the mobile number registered for this dealer code.")
            another_dealer = conn.execute(
                "SELECT 1 FROM dealers WHERE portal_mobile_number=%s AND id<>%s LIMIT 1",
                (user["mobile_number"], dealer["id"]),
            ).fetchone()
            if another_dealer:
                raise HTTPException(409, "This mobile is already linked to a different dealership. Use its registered mobile number or ask CLSL administration to reset the old test binding.")
            conn.execute("UPDATE dealers SET portal_mobile_number=%s,updated_at=now() WHERE id=%s", (user["mobile_number"], dealer["id"]))
            verified_dealer_id = dealer["id"]
        metadata = {"dealer_code": payload.dealer_code, "referral_code": payload.referral_code, "profile_completed_at": datetime.now(timezone.utc).isoformat()}
        updated = conn.execute(
            """UPDATE farmers SET role=%s,name=%s,preferred_language=%s,email=%s,city=%s,district=%s,
                 village=%s,state=%s,social_media_used=%s::jsonb,acquisition_source=%s,
                 location_latitude=%s,location_longitude=%s,location_label=%s,
                 location_postcode=%s,location_country=%s,location_accuracy_meters=%s,location_metadata=%s::jsonb,
                 location_consent_at=CASE WHEN %s THEN COALESCE(location_consent_at,now()) ELSE location_consent_at END,
                 acquisition_dealer_id=COALESCE(acquisition_dealer_id,%s),preferred_dealer_id=COALESCE(%s,preferred_dealer_id),
                 verified_dealer_id=%s,profile_metadata=profile_metadata || %s::jsonb,updated_at=now()
               WHERE id=%s RETURNING *""",
            (payload.role,payload.first_name.strip(),payload.preferred_language,payload.email,payload.city,payload.district,
             payload.village,payload.state,json.dumps(payload.social_media_used),payload.acquisition_source,
             payload.location_latitude,payload.location_longitude,payload.location_label,
             payload.location_postcode,payload.location_country,payload.location_accuracy_meters,
             json.dumps(payload.location_metadata),payload.location_consent,
             referral_dealer_id,referral_dealer_id,verified_dealer_id,json.dumps(metadata),user["id"]),
        ).fetchone()
        conn.commit()
    return {"status": "success", "user": _public_user(updated)}


@router.post("/dealer-referral")
def dealer_referral(authorization: str = Header(...)):
    with connection() as conn:
        user = _session_user(conn, authorization)
        if user.get("role") != "dealer" or not user.get("verified_dealer_id"):
            raise HTTPException(403, "A verified dealer login is required.")
        dealer = conn.execute(
            "SELECT id,name,status FROM dealers WHERE id=%s",
            (user["verified_dealer_id"],),
        ).fetchone()
        if not dealer or dealer["status"] != "active":
            raise HTTPException(403, "This dealership is not active.")
        existing = conn.execute(
            """SELECT referral_token FROM dealer_referrals
               WHERE dealer_id=%s AND (expires_at IS NULL OR expires_at>now())
               ORDER BY created_at DESC LIMIT 1""",
            (dealer["id"],),
        ).fetchone()
        token = existing["referral_token"] if existing else "REF-" + secrets.token_hex(12).upper()
        if not existing:
            conn.execute(
                "INSERT INTO dealer_referrals(dealer_id,referral_token) VALUES(%s,%s)",
                (dealer["id"], token),
            )
            conn.commit()
    return {"status": "success", "dealer_name": dealer["name"], "token": token,
            "download_url": f"https://ai.croplifescience.com/?ref={token}"}


@router.post("/me")
def current_user(authorization: str = Header(...)):
    with connection() as conn:
        user = _session_user(conn, authorization)
    return {"status": "success", "user": _public_user(user)}


@router.post("/logout")
def logout(authorization: str = Header(...)):
    token = _token(authorization)
    with connection() as conn:
        conn.execute("UPDATE public_sessions SET revoked_at=now() WHERE session_token=%s", (token,))
        conn.commit()
    return {"status": "success"}
