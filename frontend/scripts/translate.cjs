const axios = require('axios').default;
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const key = process.env.AZURE_TRANSLATOR_KEY || "YOUR_AZURE_KEY";
const endpoint = "https://api.cognitive.microsofttranslator.com";
// We don't know the location, so we'll try 'global' and a few others if it fails
const locationsToTry = ['global', 'centralindia', 'eastus', 'westeurope'];

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
  requiredField: 'Required',
  iAmFarmer: 'I am a farmer',
  source: 'Where did you hear about CLSL AI?'
};

const languages = ['hi', 'gu', 'mr', 'bn', 'bho'];

async function translateChunk(textArray, targetLangs, location) {
  try {
    const response = await axios({
      baseURL: endpoint,
      url: '/translate',
      method: 'post',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Ocp-Apim-Subscription-Region': location,
        'Content-type': 'application/json',
        'X-ClientTraceId': uuidv4().toString()
      },
      params: new URLSearchParams([
        ['api-version', '3.0'],
        ['from', 'en'],
        ...targetLangs.map(lang => ['to', lang])
      ]),
      data: textArray.map(t => ({ text: t })),
      responseType: 'json'
    });
    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`Location ${location} failed: ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

async function run() {
  const keys = Object.keys(en);
  const values = keys.map(k => en[k]);
  
  let successLocation = null;
  let translatedData = null;
  
  for (const loc of locationsToTry) {
    console.log(`Trying location: ${loc}`);
    try {
      translatedData = await translateChunk(values, languages, loc);
      successLocation = loc;
      console.log(`Success with location: ${loc}`);
      break;
    } catch (e) {
      console.log(e.message);
    }
  }
  
  if (!translatedData) {
    console.error("Failed to translate with all attempted locations.");
    return;
  }
  
  const finalTranslations = {};
  languages.forEach(lang => {
    finalTranslations[lang] = {};
  });
  
  translatedData.forEach((translationResult, index) => {
    const originalKey = keys[index];
    translationResult.translations.forEach(t => {
      finalTranslations[t.to][originalKey] = t.text;
    });
  });
  
  const outPath = path.join(__dirname, '../app/api/i18n/login/world_translations.json');
  fs.writeFileSync(outPath, JSON.stringify(finalTranslations, null, 2));
  console.log(`Saved translations to ${outPath}`);
}

run();
