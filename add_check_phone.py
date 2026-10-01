import sys

with open('mobile/src/services/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

new_fn = '''export const checkPhone = async (mobile: string) => {
  const payload = { mobile_number: mobile };
  const res = await fetch(${API_BASE}/public/auth/check-phone, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || 'Failed to check phone number');
  }
  return await res.json();
};

export const sendOtp ='''

content = content.replace("export const sendOtp =", new_fn)

with open('mobile/src/services/api.ts', 'w', encoding='utf-8') as f:
    f.write(content)
