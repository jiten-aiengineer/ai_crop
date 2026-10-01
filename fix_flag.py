with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

old_code = "<View style={s.countryCodeBox}><Text style={s.countryCodeText}>{countryCode}</Text></View>"
new_code = """<TouchableOpacity style={s.countryCodeBox} onPress={() => setShowCountryModal(true)}>
            <Text style={s.countryCodeText}>
              {COUNTRIES.find(c => c.code === countryCode)?.flag || '????'} {countryCode}
            </Text>
          </TouchableOpacity>"""

if old_code in c:
    c = c.replace(old_code, new_code)
    with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
        f.write(c)
    print("Fixed")
else:
    print("Not found")
