with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

old_code = "const checkRes = await checkPhone(fullMobile);"
new_code = "const checkRes = await checkPhone(fullMobile).catch(() => ({ exists: false, role: 'farmer' as const }));"

if old_code in c:
    c = c.replace(old_code, new_code)
    with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print("Fixed fallback")
else:
    print("Not found")
