from fastapi import APIRouter, Header, HTTPException
from app.db import connection
from app.farmer_auth import _session_user
import secrets

router = APIRouter(prefix="/api/v1/sales_officers/me", tags=["sales_officer_operations"])

def _resolve_sales_officer(conn, authorization: str) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Sign in again to continue.")
    token = authorization[7:].strip()
    row = conn.execute(
        """SELECT ps.farmer_id, f.role, f.mobile_number 
           FROM public_sessions ps
           JOIN farmers f ON f.id = ps.farmer_id
           WHERE ps.session_token = %s
             AND ps.expires_at > now()
             AND ps.revoked_at IS NULL""",
        (token,),
    ).fetchone()
    if not row:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    if row["role"] != "sales_officer":
        raise HTTPException(403, "A verified sales officer login is required.")
        
    # Find employee matching mobile
    digits = "".join(character for character in row["mobile_number"] if character.isdigit())[-10:]
    emp = conn.execute(
        """SELECT e.id, e.employee_code, e.full_name FROM employees e
           WHERE e.status='active' AND (
             right(regexp_replace(COALESCE(e.office_mobile, ''), '[^0-9]', '', 'g'), 10)=%s OR
             right(regexp_replace(COALESCE(e.personal_mobile, ''), '[^0-9]', '', 'g'), 10)=%s
           ) LIMIT 1""",
        (digits, digits)
    ).fetchone()
    if not emp:
        raise HTTPException(403, "Your mobile number is no longer linked to an active sales officer profile.")
    
    return {"farmer_id": row["farmer_id"], "employee_id": emp["id"], "employee_code": emp["employee_code"], "full_name": emp["full_name"]}

@router.get("/referral")
def get_sales_officer_referral(authorization: str = Header(...)):
    with connection() as conn:
        emp = _resolve_sales_officer(conn, authorization)
        ref = conn.execute("SELECT referral_token FROM employee_referrals WHERE employee_id=%s", (emp["employee_id"],)).fetchone()
        if not ref:
            token = secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5))
            conn.execute("INSERT INTO employee_referrals(employee_id, referral_token) VALUES(%s, %s)", (emp["employee_id"], token))
            conn.commit()
            ref_token = token
        else:
            ref_token = ref["referral_token"]
            
        link = f"https://ai.croplifescience.com/?ref={ref_token}"
        qr_data_url: Optional[str] = None
        try:
            import base64
            import io
            import qrcode  # type: ignore[import]
            qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=6, border=3)
            qr.add_data(link)
            qr.make(fit=True)
            img = qr.make_image(fill_color="black", back_color="white")
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            qr_data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
        except Exception:
            pass
            
        return {
            "status": "success",
            "referral_token": ref_token,
            "qr_data_url": qr_data_url
        }
@router.get("/farmers")
def list_sales_officer_farmers(authorization: str = Header(...)):
    with connection() as conn:
        emp = _resolve_sales_officer(conn, authorization)
        rows = conn.execute(
            """SELECT f.name, f.last_name, f.mobile_number, f.city, f.district, f.state, f.created_at, f.profile_metadata
               FROM farmers f
               WHERE f.acquisition_employee_id = %s
               ORDER BY f.created_at DESC""",
            (emp["employee_id"],)
        ).fetchall()
        
    # Obscure mobile number
    farmers = []
    for r in rows:
        mob = r["mobile_number"]
        if mob and len(mob) > 6:
            mob = mob[:-6] + "xxxx" + mob[-2:]
        farmers.append({
            "name": f"{r['name'] or ''} {r['last_name'] or ''}".strip() or "Unnamed Farmer",
            "phone": mob,
            "location": f"{r['city'] or r['district'] or ''}, {r['state'] or ''}".strip(", "),
            "joined_at": r["created_at"].isoformat()
        })
        
    return {"status": "success", "farmers": farmers}
