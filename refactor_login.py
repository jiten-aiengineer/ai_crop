import sys
import re

with open('mobile/src/screens/auth/LoginScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Update Step type
content = content.replace(
    "type Step = 'language' | 'account' | 'details' | 'otp';",
    "type Step = 'language' | 'phone' | 'dealer_code' | 'details' | 'otp';"
)
content = content.replace(
    "const STEP_ORDER: Step[] = ['language', 'account', 'details', 'otp'];",
    "const STEP_ORDER: Step[] = ['language', 'phone', 'dealer_code', 'details', 'otp'];"
)

# Add import for checkPhone
content = content.replace(
    "import { sendOtp, verifyOtp, dealerMobileStatus, updateProfile, referralLookup, dealerLookup } from '../../services/api';",
    "import { sendOtp, verifyOtp, dealerMobileStatus, updateProfile, referralLookup, dealerLookup, checkPhone } from '../../services/api';"
)

# Insert new state variables
state_hook = "const [step, setStep] = useState<Step>('language');"
new_state_hook = '''const [step, setStep] = useState<Step>('language');
  const [role, setRole] = useState<'farmer' | 'dealer' | 'sales_officer'>('farmer');
  const [isNewUser, setIsNewUser] = useState(false);
  const [dealerCode, setDealerCode] = useState('');'''
content = content.replace(state_hook, new_state_hook)

# Replace startOtp with continueFromPhone
continue_phone_fn = '''
  const continueFromPhone = async () => {
    if (!mobile || mobile.length < 10) {
      setError(t.error_mobile || 'Enter a valid 10-digit mobile number');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile;
      const checkRes = await checkPhone(fullMobile);
      if (checkRes.exists) {
        setRole(checkRes.role || 'farmer');
        setIsNewUser(false);
        if (checkRes.role === 'dealer') {
          // If dealer, must enter dealer code first
          setStep('dealer_code');
        } else {
          // Farmer or Sales Officer: jump straight to OTP
          await sendOtp({ mobile_number: fullMobile });
          setStep('otp');
        }
      } else {
        // New User -> Must be a Farmer signing up (Dealers/SO are added by admin)
        setRole('farmer');
        setIsNewUser(true);
        setStep('details'); // Collect name, state, etc.
      }
    } catch (e: any) {
      setError(e.message || 'Error checking phone number');
    }
    setLoading(false);
  };

  const verifyDealerCode = async () => {
    if (!dealerCode) {
      setError('Please enter your dealer code');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile;
      await sendOtp({ mobile_number: fullMobile, dealer_code: dealerCode });
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Invalid dealer code');
    }
    setLoading(false);
  };

  const startOtpForNewUser = async () => {
    if (!firstName) {
      setError(t.error_firstname || 'First Name is required');
      return;
    }
    // New user signing up
    setError('');
    setLoading(true);
    try {
      const fullMobile = countryCode + mobile;
      await sendOtp({ mobile_number: fullMobile, is_new: true });
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Error sending OTP');
    }
    setLoading(false);
  };
'''

# Find the startOtp function and replace it, or just insert above it
idx = content.find("const startOtp = async () => {")
if idx != -1:
    content = content[:idx] + continue_phone_fn + content[idx:]

# Modify finish() to pass dealerCode if it's a dealer
# Or just let verifyOtp handle it. The backend verifyOtp doesn't strictly need dealer_code, just the mobile number.

# Now we need to modify the UI rendering.
# Replace {step === 'account' && renderAccount()} with {step === 'phone' && renderPhone()} and {step === 'dealer_code' && renderDealerCode()}
content = content.replace("{step === 'account' && renderAccount()}", "{step === 'phone' && renderPhone()}\n            {step === 'dealer_code' && renderDealerCode()}")

# Create the renderPhone() and renderDealerCode() functions
# I will replace const renderAccount = () => ( with the new renders.
new_renders = '''
  const renderPhone = () => (
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

  const renderAccount = () => ( // keeping to avoid syntax errors if referenced elsewhere
'''
content = content.replace("const renderAccount = () => (", new_renders)

# Modify back button logic
content = content.replace("if (step === 'account') setStep('language');", "if (step === 'phone') setStep('language');")
content = content.replace("else if (step === 'details') setStep('account');", "else if (step === 'details') setStep('phone');")
content = content.replace("else if (step === 'otp') setStep('details');", "else if (step === 'otp') { if (isNewUser) setStep('details'); else if (role === 'dealer') setStep('dealer_code'); else setStep('phone'); }")
content = content.replace("else if (step === 'dealer_code') setStep('phone');", "")
idx = content.find("else if (step === 'otp') {")
if idx != -1:
    # insert dealer_code back handler
    content = content[:idx] + "else if (step === 'dealer_code') setStep('phone');\n    " + content[idx:]

# Modify continue button logic
btn_logic = '''if (step === 'language') setStep('phone');
                else if (step === 'phone') continueFromPhone();
                else if (step === 'dealer_code') verifyDealerCode();
                else if (step === 'details') startOtpForNewUser();
                else if (step === 'otp') finish();'''
# The old one was:
# if (step === 'language') setStep('account');
# else if (step === 'account') continueFromAccount();
# else if (step === 'details') startOtp();
# else if (step === 'otp') finish();
old_btn_logic = '''if (step === 'language') setStep('account');
                else if (step === 'account') continueFromAccount();
                else if (step === 'details') startOtp();
                else if (step === 'otp') finish();'''
content = content.replace(old_btn_logic, btn_logic)

with open('mobile/src/screens/auth/LoginScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated LoginScreen.tsx structure")
