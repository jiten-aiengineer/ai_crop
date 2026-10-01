import sys

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

def safe_replace(c, old, new):
    if c.count(old) != 1:
        print(f"Error: expected 1 occurrence of {old[:30]}..., found {c.count(old)}")
        sys.exit(1)
    return c.replace(old, new)

# 1. Update Step type
old_step = "type Step = 'language' | 'account' | 'details' | 'otp';"
new_step = "type Step = 'language' | 'phone' | 'dealer_code' | 'account' | 'details' | 'otp';"
c = safe_replace(c, old_step, new_step)

old_step_order = "const STEP_ORDER: Step[] = ['language', 'account', 'details', 'otp'];"
new_step_order = "const STEP_ORDER: Step[] = ['language', 'phone', 'dealer_code', 'account', 'details', 'otp'];"
c = safe_replace(c, old_step_order, new_step_order)

# 2. Add imports
old_api = "import { sendOtp, verifyOtp, dealerMobileStatus, updateProfile, referralLookup, dealerLookup } from '../../services/api';"
new_api = "import { sendOtp, verifyOtp, dealerMobileStatus, updateProfile, referralLookup, dealerLookup, checkPhone } from '../../services/api';"
c = safe_replace(c, old_api, new_api)

# 3. Add states
old_states = "const [step, setStep] = useState<Step>('language');"
new_states = '''const [step, setStep] = useState<Step>('language');
  const [role, setRole] = useState<'farmer' | 'dealer' | 'sales_officer'>('farmer');
  const [isNewUser, setIsNewUser] = useState(false);
  const [dealerCode, setDealerCode] = useState('');'''
c = safe_replace(c, old_states, new_states)

# 4. Auth flow methods
old_continue_acc = '''const continueFromAccount = async () => {
    if (firstName.trim().length < 2) return setError('Enter your first name.');
    if (lastName.trim().length < 1) return setError('Enter your last name.');
    if (mobile.replace(/\D/g, '').length !== 10) return setError('Mobile number must be exactly 10 digits.');
    setLoading(true); setError('');
    try {
      const status = await dealerMobileStatus(countryCode + mobile.replace(/\D/g, ''));
      setIsDealerUI(status.is_registered_dealer);
      setIsSalesOfficer(status.is_sales_officer);
      setIsFarmer(false);
      setReferral(''); setReferralName('');
      setStep('details');
    } catch (e: any) { setError(e.message || t.error_network || 'Network error.'); }
    finally { setLoading(false); }
  };'''

new_continue_acc = '''const continueFromAccount = async () => {
    if (firstName.trim().length < 2) return setError('Enter your first name.');
    if (lastName.trim().length < 1) return setError('Enter your last name.');
    setError('');
    setStep('details');
  };'''
c = safe_replace(c, old_continue_acc, new_continue_acc)

old_start_otp = '''const startOtp = async () => {
    if (!place) {
      setError('Please allow location to continue.');
      return;
    }
    setLoading(true); setError('');
    try {
      const fullMobile = countryCode + mobile.replace(/\D/g, '');
      await sendOtp({
        mobile_number: fullMobile,
        first_name: firstName,
        last_name: lastName,
        preferred_language: language,
        dealer_code: isDealerUI ? dealerCode : undefined
      });
      setStep('otp');
    } catch (e: any) {
      setError(e.message || t.error_otp || 'Error sending OTP');
    }
    finally { setLoading(false); }
  };'''

new_auth_methods = '''const continueFromPhone = async () => {
    if (!mobile || mobile.replace(/\D/g, '').length < 10) {
      setError(t.error_mobile || 'Enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile.replace(/\D/g, '');
      const checkRes = await checkPhone(fullMobile);
      if (checkRes.exists) {
        setRole(checkRes.role || 'farmer');
        setIsNewUser(false);
        setIsFarmer(checkRes.role === 'farmer');
        setIsDealerUI(checkRes.role === 'dealer');
        setIsSalesOfficer(checkRes.role === 'sales_officer');
        if (checkRes.role === 'dealer') {
          setStep('dealer_code');
        } else {
          await sendOtp({ mobile_number: fullMobile });
          setStep('otp');
        }
      } else {
        setRole('farmer');
        setIsNewUser(true);
        setIsFarmer(true);
        setIsDealerUI(false);
        setIsSalesOfficer(false);
        setStep('account'); 
      }
    } catch (e: any) {
      setError(e.message || 'Error checking phone number');
    }
    finally { setLoading(false); }
  };

  const verifyDealerCode = async () => {
    if (!dealerCode) return setError('Please enter your dealer code');
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile.replace(/\D/g, '');
      await sendOtp({ mobile_number: fullMobile, dealer_code: dealerCode });
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Invalid dealer code');
    }
    finally { setLoading(false); }
  };

  const startOtpForNewUser = async () => {
    if (!place) return setError('Please allow location to continue.');
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile.replace(/\D/g, '');
      await sendOtp({ mobile_number: fullMobile, is_new: true });
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Error sending OTP');
    }
    finally { setLoading(false); }
  };'''
c = safe_replace(c, old_start_otp, new_auth_methods)

# 5. Modify finish()
old_finish = '''const finish = async () => {
    if (otp.length !== 6 || !place) return;
    setLoading(true); setError('');
    try {
      const m = countryCode + mobile.replace(/\D/g, '');
      const verified = await verifyOtp(m, otp);
      const role = isSalesOfficer ? 'sales_officer' : (isDealerUI ? 'dealer' : (isFarmer ? 'farmer' : 'general_user'));
      const data = await updateProfile(verified.session_token, {
        role, first_name: firstName, last_name: lastName, preferred_language: language, date_of_birth: dob || null,
        district: place.district, state: place.state, city: place.city || null,
        social_media_used: social, acquisition_source: source,
        referral_code: isFarmer && referral ? referral : null,
        dealer_code: isDealerUI && dealerCode ? dealerCode : null,
        location_latitude: place.latitude, location_longitude: place.longitude,
        location_label: ${place.district}, ,
        location_consent: true,
      });
      await login(verified.session_token, {
        id: verified.user.id,
        first_name: (data?.user?.first_name as string) || firstName,
        last_name: (data?.user?.last_name as string) || lastName,
        mobile_number: verified.user.mobile_number,
        role,
        preferred_language: language,
        district: place.district,
        state: place.state,
        // @ts-ignore
        verified_dealer_id: data?.user?.verified_dealer_id
      });
    } catch (e: any) {
      setError(e.message || t.error_otp || 'Invalid code. Try again.');
    }
    finally { setLoading(false); }
  };'''

new_finish = '''const finish = async () => {
    if (otp.length !== 6) return;
    setLoading(true); setError('');
    try {
      const m = countryCode + mobile.replace(/\D/g, '');
      const verified = await verifyOtp(m, otp);
      
      let finalRole = role; // role from checkPhone state
      let finalFirst = verified.user.first_name || firstName;
      let finalLast = (verified.user as any).last_name || lastName;
      let finalDistrict = (verified.user as any).district || (place ? place.district : null);
      let finalState = (verified.user as any).state || (place ? place.state : null);
      let verifiedDealerId = (verified.user as any).verified_dealer_id || null;

      // Only update profile if new user, or if dealer linking code
      if (isNewUser && place) {
        const data = await updateProfile(verified.session_token, {
          role: finalRole, first_name: firstName, last_name: lastName, preferred_language: language, date_of_birth: dob || null,
          district: place.district, state: place.state, city: place.city || null,
          social_media_used: social, acquisition_source: source,
          referral_code: finalRole === 'farmer' && referral ? referral : null,
          dealer_code: finalRole === 'dealer' && dealerCode ? dealerCode : null,
          location_latitude: place.latitude, location_longitude: place.longitude,
          location_label: ${place.district}, ,
          location_consent: true,
        });
        if (data && data.user) {
           finalFirst = data.user.first_name || finalFirst;
           finalLast = (data.user as any).last_name || finalLast;
           finalDistrict = (data.user as any).district || finalDistrict;
           finalState = (data.user as any).state || finalState;
           verifiedDealerId = (data.user as any).verified_dealer_id || verifiedDealerId;
        }
      } else if (finalRole === 'dealer' && dealerCode && !verifiedDealerId) {
        const data = await updateProfile(verified.session_token, { dealer_code: dealerCode });
        if (data && data.user) verifiedDealerId = (data.user as any).verified_dealer_id;
      }

      await login(verified.session_token, {
        id: verified.user.id,
        first_name: finalFirst,
        last_name: finalLast,
        mobile_number: verified.user.mobile_number,
        role: finalRole,
        preferred_language: language,
        district: finalDistrict,
        state: finalState,
        // @ts-ignore
        verified_dealer_id: verifiedDealerId
      });
    } catch (e: any) {
      setError(e.message || t.error_otp || 'Invalid code. Try again.');
    }
    finally { setLoading(false); }
  };'''
c = safe_replace(c, old_finish, new_finish)

# 6. UI Rendering Renders
old_render_acc = '''const renderAccount = () => (
    <View>
      {renderHeader(t.account || 'Join CLSL AI', t.intro || 'Unlock AI crop care, weather, products, rewards, and offers.')}
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.firstName || 'First name'}</Text>
        <TextInput style={s.input} value={firstName} onChangeText={t => { setFirstName(t); setError(''); }} placeholder="Ex. Rahul" autoCapitalize="words" autoComplete="given-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.lastName || 'Last name'}</Text>
        <TextInput style={s.input} value={lastName} onChangeText={t => { setLastName(t); setError(''); }} placeholder="Ex. Sharma" autoCapitalize="words" autoComplete="family-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>Date of Birth <Text style={{fontSize: 10, color: '#8294A0'}}>(get rewards on your birthday)</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput 
            style={[s.input, { flex: 1, paddingRight: 45 }]} 
            value={dob} 
            onChangeText={t => { 
              let cleaned = t.replace(/\D/g, '');
              if (cleaned.length > 2) {
                let m = parseInt(cleaned.slice(2, 4));
                if (m > 12) cleaned = cleaned.slice(0, 2) + '12' + cleaned.slice(4);
                if (cleaned.slice(2, 4) === '00') cleaned = cleaned.slice(0, 2) + '01' + cleaned.slice(4);
              }
              if (cleaned.length >= 2) {
                let d = parseInt(cleaned.slice(0, 2));
                if (d > 31) cleaned = '31' + cleaned.slice(2);
                if (cleaned.slice(0, 2) === '00') cleaned = '01' + cleaned.slice(2);
              }
              let formatted = cleaned;
              if (cleaned.length > 2) formatted = cleaned.slice(0,2) + '/' + cleaned.slice(2);
              if (cleaned.length > 4) formatted = formatted.slice(0,5) + '/' + cleaned.slice(4,8);
              setDob(formatted);
              setError('');
            }} 
            placeholder="DD/MM/YYYY" 
            keyboardType="numeric" 
            maxLength={10} 
          />
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ position: 'absolute', right: 15, height: '100%', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={22} color={T.primary} />
          </TouchableOpacity>
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={dobDate || new Date()}
            mode="date"
            display="default"
            onValueChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.mobile || 'Mobile number'}</Text>
        <View style={s.phoneRow}>
          <TouchableOpacity style={s.phonePrefix} onPress={() => setShowCountryModal(true)} activeOpacity={0.7}>
            <Text style={s.phonePrefixText}>{COUNTRIES.find(c => c.code === countryCode)?.flag} {countryCode}</Text>
            <Ionicons name="chevron-down" size={14} color={T.primary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
          <TextInput
            style={[s.input, s.phoneInput]}
            value={mobile}
            onChangeText={t => { setMobile(t.replace(/\D/g, '').slice(0, 10)); setError(''); setIsDealerUI(false); setIsSalesOfficer(false); }}
            placeholder={Enter number without }
            keyboardType="number-pad"
            autoComplete="tel"
            maxLength={10}
          />
        </View>
      </View>
    </View>
  );'''

new_render_steps = '''const renderPhone = () => (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>{t.mobileLabel || 'Mobile Number'}</Text>
      <Text style={s.stepSubtitle}>Enter your phone number to login or sign up.</Text>
      <View style={s.mobileInputContainer}>
        <View style={s.countryCodeBox}><Text style={s.countryCodeText}>{countryCode}</Text></View>
        <TextInput
          style={s.mobileInput}
          value={mobile}
          onChangeText={(v) => { setMobile(v.replace(/[^0-9]/g, '')); setError(''); }}
          placeholder="9876543210"
          keyboardType="phone-pad"
          maxLength={10}
          placeholderTextColor={T.muted}
        />
      </View>
    </View>
  );

  const renderDealerCode = () => (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>Dealer Code</Text>
      <Text style={s.stepSubtitle}>Please verify your identity by entering your CLSL Dealer Code.</Text>
      <TextInput
        style={s.input}
        value={dealerCode}
        onChangeText={(v) => { setDealerCode(v); setError(''); }}
        placeholder="e.g. DL12345"
        placeholderTextColor={T.muted}
      />
    </View>
  );

  const renderAccount = () => (
    <View>
      {renderHeader(t.account || 'Join CLSL AI', t.intro || 'Unlock AI crop care, weather, products, rewards, and offers.')}
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.firstName || 'First name'}</Text>
        <TextInput style={s.input} value={firstName} onChangeText={t => { setFirstName(t); setError(''); }} placeholder="Ex. Rahul" autoCapitalize="words" autoComplete="given-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>{t.lastName || 'Last name'}</Text>
        <TextInput style={s.input} value={lastName} onChangeText={t => { setLastName(t); setError(''); }} placeholder="Ex. Sharma" autoCapitalize="words" autoComplete="family-name" />
      </View>
      <View style={s.field}>
        <Text style={s.fieldLabel}>Date of Birth <Text style={{fontSize: 10, color: '#8294A0'}}>(get rewards on your birthday)</Text></Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TextInput 
            style={[s.input, { flex: 1, paddingRight: 45 }]} 
            value={dob} 
            onChangeText={t => { 
              let cleaned = t.replace(/\D/g, '');
              if (cleaned.length > 2) {
                let m = parseInt(cleaned.slice(2, 4));
                if (m > 12) cleaned = cleaned.slice(0, 2) + '12' + cleaned.slice(4);
                if (cleaned.slice(2, 4) === '00') cleaned = cleaned.slice(0, 2) + '01' + cleaned.slice(4);
              }
              if (cleaned.length >= 2) {
                let d = parseInt(cleaned.slice(0, 2));
                if (d > 31) cleaned = '31' + cleaned.slice(2);
                if (cleaned.slice(0, 2) === '00') cleaned = '01' + cleaned.slice(2);
              }
              let formatted = cleaned;
              if (cleaned.length > 2) formatted = cleaned.slice(0,2) + '/' + cleaned.slice(2);
              if (cleaned.length > 4) formatted = formatted.slice(0,5) + '/' + cleaned.slice(4,8);
              setDob(formatted);
              setError('');
            }} 
            placeholder="DD/MM/YYYY" 
            keyboardType="numeric" 
            maxLength={10} 
          />
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ position: 'absolute', right: 15, height: '100%', justifyContent: 'center' }}>
            <Ionicons name="calendar-outline" size={22} color={T.primary} />
          </TouchableOpacity>
        </View>
        {showDatePicker && (
          <DateTimePicker
            value={dobDate || new Date()}
            mode="date"
            display="default"
            onValueChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}
      </View>
    </View>
  );'''

c = safe_replace(c, old_render_acc, new_render_steps)

# 7. Render Switch
old_render_switch = '''          <View style={s.stepContent}>
            {step === 'language' && renderLanguage()}
            {step === 'account' && renderAccount()}
            {step === 'details' && renderDetails()}
            {step === 'otp' && renderOtp()}
          </View>'''
new_render_switch = '''          <View style={s.stepContent}>
            {step === 'language' && renderLanguage()}
            {step === 'phone' && renderPhone()}
            {step === 'dealer_code' && renderDealerCode()}
            {step === 'account' && renderAccount()}
            {step === 'details' && renderDetails()}
            {step === 'otp' && renderOtp()}
          </View>'''
c = safe_replace(c, old_render_switch, new_render_switch)

# 8. Navigation Logic (Back)
old_back = '''              <Ionicons name="arrow-back" size={20} color={T.text} style={{ marginRight: 6 }} />
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}'''
old_back_handler = '''          {step !== 'language' && (
            <TouchableOpacity style={s.backBtn} onPress={() => {
              setError('');
              if (step === 'account') setStep('language');
              else if (step === 'details') setStep('account');
              else if (step === 'otp') setStep('details');
            }}>
              <Ionicons name="arrow-back" size={20} color={T.text} style={{ marginRight: 6 }} />
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}'''
new_back_handler = '''          {step !== 'language' && (
            <TouchableOpacity style={s.backBtn} onPress={() => {
              setError('');
              if (step === 'phone') setStep('language');
              else if (step === 'dealer_code') setStep('phone');
              else if (step === 'account') setStep('phone');
              else if (step === 'details') setStep('account');
              else if (step === 'otp') {
                if (isNewUser) setStep('details');
                else if (role === 'dealer') setStep('dealer_code');
                else setStep('phone');
              }
            }}>
              <Ionicons name="arrow-back" size={20} color={T.text} style={{ marginRight: 6 }} />
              <Text style={s.backBtnText}>Back</Text>
            </TouchableOpacity>
          )}'''
c = safe_replace(c, old_back_handler, new_back_handler)

# 9. Continue Button Logic
old_btn = '''<TouchableOpacity 
              style={[s.primaryBtn, (loading || (!place && step === 'details')) && s.primaryBtnDisabled]} 
              onPress={() => {
                if (step === 'language') setStep('account');
                else if (step === 'account') continueFromAccount();
                else if (step === 'details') startOtp();
                else if (step === 'otp') finish();
              }}
              disabled={loading || (!place && step === 'details')}
              activeOpacity={0.8}
            >'''

new_btn = '''<TouchableOpacity 
              style={[s.primaryBtn, (loading || (!place && step === 'details')) && s.primaryBtnDisabled]} 
              onPress={() => {
                if (step === 'language') setStep('phone');
                else if (step === 'phone') continueFromPhone();
                else if (step === 'dealer_code') verifyDealerCode();
                else if (step === 'account') continueFromAccount();
                else if (step === 'details') startOtpForNewUser();
                else if (step === 'otp') finish();
              }}
              disabled={loading || (!place && step === 'details')}
              activeOpacity={0.8}
            >'''
c = safe_replace(c, old_btn, new_btn)

# 10. Styles
styles_to_add = '''
  stepContainer: { paddingVertical: 20 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: T.text, marginBottom: 8 },
  stepSubtitle: { fontSize: 14, color: T.textSub, marginBottom: 24 },
  mobileInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderWidth: 1, borderColor: T.border, borderRadius: 12, overflow: 'hidden' },
  countryCodeBox: { backgroundColor: T.primaryLight, paddingHorizontal: 16, height: 56, justifyContent: 'center', borderRightWidth: 1, borderRightColor: T.border },
  countryCodeText: { fontSize: 16, fontWeight: '700', color: T.primary },
  mobileInput: { flex: 1, height: 56, fontSize: 18, fontWeight: '700', paddingHorizontal: 16, color: T.text },
'''
old_style_target = "  progressSegActive: { backgroundColor: T.primary },"
c = safe_replace(c, old_style_target, old_style_target + styles_to_add)

with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(c)

print("Done clean patch")
