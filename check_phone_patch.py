import sys

with open('backend/app/farmer_auth.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Models
models_str = '''
class SendOtpPayload(BaseModel):
'''
new_models = '''
class CheckPhonePayload(BaseModel):
    mobile_number: str = Field(..., max_length=24)

class CheckPhoneResponse(BaseModel):
    exists: bool
    role: Optional[str] = None
    name: Optional[str] = None
    dealer_code: Optional[str] = None

class SendOtpPayload(BaseModel):
'''
content = content.replace(models_str, new_models)

# Route
route_str = '''
@router.post("/send-otp")
'''
new_route = '''
@router.post("/check-phone", response_model=CheckPhoneResponse)
def check_phone(payload: CheckPhonePayload):
    mobile = payload.mobile_number.strip()
    # Always format to standard +91 length if 10 digits
    if len(mobile) == 10 and mobile.isdigit():
        mobile = "+91" + mobile
        
    with connection() as conn:
        # Check farmers first (auth table for all active users)
        f = conn.execute("SELECT id, name, role, verified_dealer_id FROM farmers WHERE mobile_number=%s LIMIT 1", (mobile,)).fetchone()
        if f:
            if f["role"] == "dealer":
                # Find the dealer code
                d = conn.execute("SELECT dealer_code FROM dealers WHERE id=%s", (f["verified_dealer_id"],)).fetchone()
                return CheckPhoneResponse(exists=True, role="dealer", name=f["name"], dealer_code=d["dealer_code"] if d else None)
            return CheckPhoneResponse(exists=True, role=f["role"], name=f["name"])
            
        # If not in farmers, check if it's a dealer pre-registered in dealers table
        # Since they might be in dealers table but haven't logged in yet
        # Let's match based on contact_number (last 10 digits)
        mobile_10 = "".join(filter(str.isdigit, mobile))[-10:]
        if len(mobile_10) == 10:
            d = conn.execute("SELECT id, name, dealer_code FROM dealers WHERE status='active' AND RIGHT(regexp_replace(contact_number, '[^\d]', '', 'g'), 10) = %s LIMIT 1", (mobile_10,)).fetchone()
            if d:
                return CheckPhoneResponse(exists=True, role="dealer", name=d["name"], dealer_code=d["dealer_code"])
            
            # Also check if it's a sales officer pre-registered in employees/users?
            # They don't sign up, they just get added by admin.
            # No, if admin adds sales officer, they get added directly to armers table with role='sales_officer'.
            # Wait, import_sales_officers.py creates them in armers table.
            
    return CheckPhoneResponse(exists=False, role=None, name=None)

@router.post("/send-otp")
'''
content = content.replace(route_str, new_route)

with open('backend/app/farmer_auth.py', 'w', encoding='utf-8') as f:
    f.write(content)
print("Added check-phone to farmer_auth.py")
