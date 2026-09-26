import { NextResponse } from 'next/server';

// English Fallback
const en = {
  welcomeTitle: 'Welcome!',
  welcomeSub: 'I am your smart crop doctor, ready to help.',
  welcome: 'Welcome to CLSL AI',
  choose: 'Choose your language',
  account: 'Join CLSL AI',
  intro: 'Unlock AI crop care, weather, products, rewards, and offers.',
  firstName: 'First name',
  lastName: 'Last name',
  mobile: 'Mobile number',
  details: 'Complete your login',
  farmer: 'Farmer',
  dealer: 'CLSL Dealer',
  farmerBenefitTitle: 'CLSL Farmer Benefits',
  farmerBenefitText: 'Farmers get offers and coupons on CLSL products. Get a referral code from your nearest CLSL dealer.',
  dealerRecognised: 'Dealer Mobile Recognised',
  dealerRecognisedHelp: 'Enter your CLSL dealer code to verify dealership.',
  dealerCode: 'Dealer Code',
  referralCode: 'Dealer Referral Code',
  scanQr: 'Scan Referral QR',
  orEnterCode: 'Or enter 7-letter code',
  verify: 'Verify',
  verified: 'Verified',
  confirmDealer: 'Confirm Dealership Details',
  dealerConfirmed: '✓ Details verified',
  otpButton: 'Continue with OTP',
  otpTitle: 'Verify Mobile',
  otpHelp: 'TEST MODE: Enter 123456.',
  otp: '6-digit OTP',
  enter: 'Enter CLSL AI',
  back: 'Back',
  continue: 'Continue',
  wait: 'Please wait...',
  required: 'Complete required fields.',
  test: 'Test login',
  cityTerritory: 'City / Territory',
  owner: 'Owner',
  registeredMobile: 'Registered Mobile',
  mobileWarning: 'This dealership is registered to another number. Go back and login with that number.',
  selectOne: 'Select one',
  requiredField: 'Required'
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lang = searchParams.get('lang') || 'en';

  if (lang === 'en') {
    return NextResponse.json(en);
  }

  try {
    const worldTranslations = require('./world_translations.json');
    if (worldTranslations[lang]) {
      return NextResponse.json(worldTranslations[lang]);
    }
  } catch (e) {
    // File might not exist yet
  }

  return NextResponse.json(en);
}
