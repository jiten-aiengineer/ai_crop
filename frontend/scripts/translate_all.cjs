const axios = require('axios').default;
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const key = process.env.AZURE_TRANSLATOR_KEY || "YOUR_AZURE_KEY";
const region = "eastus";
const endpoint = "https://api.cognitive.microsofttranslator.com/";

const en = {
  welcomeTitle: "Welcome!",
  welcomeSub: "I'm your smart crop doctor, ready to help.",
  welcome: 'Welcome to CLSL AI',
  choose: 'Choose your language',
  account: 'Join CLSL AI',
  intro: 'Unlock AI crop care, weather, products, rewards, and offers.',
  firstName: 'First name',
  lastName: 'Last name',
  mobile: 'Mobile number',
  details: 'Complete your login',
  detailsHelp: 'Current location is required for local weather and crop support.',
  location: 'Use my current location',
  locationReady: 'Location verified',
  locationError: 'Location is required. Allow location permission and try again.',
  district: 'District',
  state: 'State',
  social: 'Social media you use',
  source: 'How did you hear about CLSL AI?',
  iAmFarmer: 'I am a farmer',
  farmerBenefitTitle: 'CLSL farmer benefits',
  farmerBenefitText: 'Farmers can receive offers and coupons on CLSL products. Get a referral code from your nearest CLSL dealer.',
  dealerRecognised: 'Registered dealer mobile recognised',
  dealerRecognisedHelp: 'Enter your private CLSL dealer code below to verify the dealership.',
  dealerCode: 'Dealer code',
  referralCode: 'Dealer referral code',
  scanQr: 'Scan referral QR code',
  orEnterCode: 'or enter the 7-character code',
  verify: 'Verify',
  verified: 'Verified',
  confirmDealer: 'Confirm dealership details',
  dealerConfirmed: '✓ Details confirmed',
  otpButton: 'Continue with OTP',
  otpTitle: 'Verify your mobile',
  otpHelp: 'Testing mode: enter 123456.',
  otp: '6-digit OTP',
  enter: 'Verify & Enter CLSL AI',
  back: 'Back',
  continue: 'Continue',
  wait: 'Please wait…',
  required: 'Complete the required information.',
  test: 'TEST LOGIN · Airtel DLT will be connected after testing',
  cityTerritory: 'City / territory',
  owner: 'Owner',
  registeredMobile: 'Registered mobile',
  mobileWarning: 'This dealership is registered with a different number. Go back and log in with that number.',
  selectOne: 'Select one',
  requiredField: 'Required',
};

const langs = [
  'hi', 'gu', 'mr', 'bn', 'bho', 'pa', 'te', 'ta', 'kn', 'ml', 'or', 'as', 'ur',
  'ar', 'ne', 'vi', 'am', 'ms', 'my', 'fa', 'sw', 'fil', 'zh-Hans', 'es', 'fr', 'de', 'ru', 'pt', 'ja', 'ko', 'it'
];

async function run() {
  const textArray = Object.values(en);
  const keys = Object.keys(en);
  
  const translations = {};
  translations['en'] = en;
  
  // We can do it in batches of 10 languages
  for (let i = 0; i < langs.length; i += 10) {
    const batchLangs = langs.slice(i, i + 10);
    console.log(`Translating: ${batchLangs.join(', ')}`);
    try {
      const response = await axios({
        baseURL: endpoint,
        url: '/translate',
        method: 'post',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-type': 'application/json',
          'X-ClientTraceId': uuidv4().toString()
        },
        params: new URLSearchParams([
          ['api-version', '3.0'],
          ['from', 'en'],
          ...batchLangs.map(lang => ['to', lang])
        ]),
        data: textArray.map(t => ({ text: t })),
        responseType: 'json'
      });
      
      const resData = response.data;
      
      for (const lang of batchLangs) {
        translations[lang] = {};
      }
      
      resData.forEach((item, index) => {
        const k = keys[index];
        item.translations.forEach(t => {
          let lCode = t.to;
          if (lCode === 'zh-Hans') lCode = 'zh';
          if (translations[lCode]) {
            translations[lCode][k] = t.text;
          } else {
            // handle case where API returns slightly different code
            const baseCode = lCode.split('-')[0];
            if (translations[baseCode]) translations[baseCode][k] = t.text;
          }
        });
      });
    } catch (e) {
      console.error(e.response ? e.response.data : e.message);
    }
  }

  const outPath = path.join(__dirname, '../../mobile/src/config/world_translations.json');
  fs.writeFileSync(outPath, JSON.stringify(translations, null, 2));
  console.log(`Saved to ${outPath}`);
}
run();
