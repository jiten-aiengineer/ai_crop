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
            
    link = f"https://ai.croplifescience.com/farmer/join?ref={ref_token}"
    from typing import Optional
    qr_data_url: Optional[str] = None
    try:
        import base64
        import io
        import qrcode  # type: ignore[import]
        from qrcode.image.pure import PyPNGImage  # type: ignore[import]
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=10, border=4)
        qr.add_data(link)
        qr.make(fit=True)
        img = qr.make_image(image_factory=PyPNGImage)
        buf = io.BytesIO()
        img.save(buf)
        qr_data_url = "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        qr_data_url = None
        
    return {"status": "success", "referral_token": ref_token, "qr_data_url": qr_data_url}

from fastapi import Query
from fastapi.responses import Response

@router.get("/me/referral/poster.pdf")
def sales_officer_referral_poster(authorization: str = Header(default=None), token: str = Query(default=None), lang: str = Query(default="en")):
    with connection() as conn:
        auth_val = authorization or f"Bearer {token}" if token else None
        emp = _resolve_sales_officer(conn, auth_val)
        
        existing = conn.execute("SELECT referral_token FROM employee_referrals WHERE employee_id = %s", (emp["employee_id"],)).fetchone()
        if not existing:
            ref_token = secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") + "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(5))
            conn.execute("INSERT INTO employee_referrals(employee_id, referral_token) VALUES (%s, %s)", (emp["employee_id"], ref_token))
            conn.commit()
        else:
            ref_token = existing["referral_token"]
            
        link = f"https://ai.croplifescience.com/farmer/join?ref={ref_token}"
        
        import io
        import qrcode # type: ignore
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=15, border=2)
        qr.add_data(link)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#1a5928", back_color="white")
        qr_io = io.BytesIO()
        img.save(qr_io, format="PNG")
        qr_io.seek(0)
        
        from reportlab.lib.pagesizes import A4, portrait
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, ListFlowable, ListItem
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        
        output = io.BytesIO()
        doc = SimpleDocTemplate(output, pagesize=portrait(A4), topMargin=20*mm, bottomMargin=20*mm)
        elements = []
        
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'Title', parent=styles['Heading1'], fontSize=28, spaceAfter=8, textColor=colors.HexColor("#1a5928"), alignment=1
        )
        subtitle_style = ParagraphStyle(
            'Subtitle', parent=styles['Normal'], fontSize=18, spaceAfter=15*mm, textColor=colors.HexColor("#5e6c62"), alignment=1
        )
        dealer_style = ParagraphStyle(
            'Dealer', parent=styles['Heading2'], fontSize=26, spaceAfter=5*mm, textColor=colors.HexColor("#1c221e"), alignment=1
        )
        code_style = ParagraphStyle(
            'Code', parent=styles['Heading1'], fontSize=42, spaceBefore=5*mm, spaceAfter=5*mm, textColor=colors.HexColor("#d97706"), alignment=1
        )
        scan_style = ParagraphStyle(
            'Scan', parent=styles['Normal'], fontSize=16, spaceAfter=5*mm, textColor=colors.HexColor("#11401b"), alignment=1
        )
        step_style = ParagraphStyle(
            'Step', parent=styles['Normal'], fontSize=14, spaceAfter=3*mm, textColor=colors.HexColor("#1c221e"), alignment=0, leading=20
        )
        
        elements.append(Paragraph("<b>CROP LIFE SCIENCE LTD.</b>", title_style))
        elements.append(Paragraph("Farmer Reward Network", subtitle_style))
        
        elements.append(Paragraph(f"Sales Officer: <b>{emp['full_name']}</b>", dealer_style))
        
        invitation = "Invites you to join the Crop Life AI platform"
        step1 = '1. Download the <b>"CLSL AI"</b> application from Playstore or App Store'
        step2 = '2. Sign up with your mobile number'
        step3 = '3. Scan this QR code or use the referral code below to get discounts!'
        
        if lang == 'hi':
            step1 = '1. Playstore ya App Store se <b>"CLSL AI"</b> app download karein'
            step2 = '2. Apne mobile number se sign up karein'
            step3 = '3. Discount paane ke liye yeh QR code scan karein ya niche diya code use karein!'
        elif lang == 'gu':
            step1 = '1. Playstore ke App Store thi <b>"CLSL AI"</b> app download karo'
            step2 = '2. Tamara mobile number thi sign up karo'
            step3 = '3. Discount medavva mate aa QR code scan karo athva niche no code vapro!'
            
        elements.append(Paragraph(invitation, scan_style))
        elements.append(Spacer(1, 5*mm))
        
        steps_list = ListFlowable(
            [
                ListItem(Paragraph(step1, step_style), leftIndent=35),
                ListItem(Paragraph(step2, step_style), leftIndent=35),
                ListItem(Paragraph(step3, step_style), leftIndent=35),
            ],
            bulletType='bullet',
            start='circle'
        )
        elements.append(steps_list)
        
        elements.append(Spacer(1, 5*mm))
        
        # QR Code
        qr_img = RLImage(qr_io, width=100*mm, height=100*mm)
        elements.append(qr_img)
        
        elements.append(Paragraph("<b>FARMER REFERRAL CODE</b>", scan_style))
        
        elements.append(Paragraph(f"<b>{ref_token}</b>", code_style))
        
        doc.build(elements)
        output.seek(0)
        
        return Response(content=output.read(), media_type="application/pdf", headers={
            "Content-Disposition": f'attachment; filename="CLSL-SO-{emp["employee_code"]}-Poster.pdf"'
        })

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
            "mobile_number": mob,
            "location": f"{r['city'] or r['district'] or ''}, {r['state'] or ''}".strip(", "),
            "joined_at": r["created_at"].isoformat()
        })
        
    return {"status": "success", "farmers": farmers}
