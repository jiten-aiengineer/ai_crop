import sys

with open('mobile/src/services/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix sendOtp type
old_send_otp = '''export async function sendOtp(payload: {
  mobile_number: string;
  first_name: string;
  last_name?: string;
  preferred_language: string;
  dealer_code?: string;
}) {'''

new_send_otp = '''export async function sendOtp(payload: {
  mobile_number: string;
  is_new?: boolean;
  dealer_code?: string;
}) {'''

content = content.replace(old_send_otp, new_send_otp)

# Add checkPhone
if "export async function checkPhone" not in content:
    check_phone_fn = '''
export async function checkPhone(mobile: string) {
  return request<{
    exists: boolean;
    role: 'farmer' | 'dealer' | 'sales_officer' | 'general_user' | null;
  }>(
    ${AUTH_API}/check-phone,
    'POST',
    { mobile_number: mobile },
  );
}
'''
    content += check_phone_fn

with open('mobile/src/services/api.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Fixed api.ts")
