import sys

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

idx_start = content.find("const continueFromAccount = async () => {")
idx_end = content.find("};", idx_start) + 2

new_continue = '''const continueFromAccount = async () => {
    if (firstName.trim().length < 2) return setError('Enter your first name.');
    if (lastName.trim().length < 1) return setError('Enter your last name.');
    setError('');
    setStep('details');
  };'''

content = content[:idx_start] + new_continue + content[idx_end:]

with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Patched continueFromAccount")
