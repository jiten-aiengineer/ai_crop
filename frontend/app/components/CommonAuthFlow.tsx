'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { locateDevice, type DevicePlace } from '../lib/device-location';
import { LanguageCode, languages } from '../lib/i18n';
import type { PublicUser } from './AuthFlow';
import { authCopy, SprayerScene } from './AuthFlow';

type Step = 'language' | 'account' | 'details' | 'otp';
type Dealer = { dealer_code: string; name: string; owner_name?: string; location?: string; sales_territory?: string; state?: string; already_bound?: boolean; registered_mobile?: string; mobile_matches?: boolean };
type BarcodeDetectorLike = { detect: (source: ImageBitmap | HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const text: Record<LanguageCode, Record<string, string>> = {
  en: { welcome:'Welcome to CLSL AI', choose:'Choose your language', account:'Create your CLSL AI account', intro:'One simple login for crop care, weather, products and CLSL support.', name:'First name', lastName:'Last name', mobile:'Mobile number', details:'Complete your login', detailsHelp:'Current location is required for local weather and crop support.', location:'Use my current location', locationReady:'Location verified', locationError:'Location is required. Allow location permission and try again.', city:'City / Town', district:'District', state:'State', email:'Email (optional)', social:'Social media you use (optional)', source:'How did you hear about CLSL AI? (optional)', relationship:'Dealer connection (optional)', relationshipHelp:'Dealers enter their CLSL-issued dealer code. Farmers may enter a referral code received from their dealer.', ownDealer:'I am a CLSL dealer', referred:'I have a dealer referral', dealerCode:'Dealer code', referralCode:'Referral code', searchDealer:'Search dealer name or code', search:'Search', verify:'Verify', verified:'Verified', confirm:'This is my dealership', scan:'Scan QR', otpButton:'Continue with OTP', otpTitle:'Verify your mobile', otpHelp:'Testing mode: enter 123456.', otp:'6-digit OTP', enter:'Enter CLSL AI', back:'Back', continue:'Continue', wait:'Please wait…', required:'Complete the required information.', test:'TEST LOGIN · Airtel DLT will be connected after testing' },
  hi: { welcome:'CLSL AI में आपका स्वागत है', choose:'अपनी भाषा चुनें', account:'अपना CLSL AI खाता बनाएँ', intro:'फसल, मौसम, उत्पाद और CLSL सहायता के लिए एक आसान लॉगिन।', name:'पहला नाम', mobile:'मोबाइल नंबर', details:'लॉगिन पूरा करें', detailsHelp:'स्थानीय मौसम और फसल सहायता के लिए वर्तमान लोकेशन जरूरी है।', location:'मेरी वर्तमान लोकेशन लें', locationReady:'लोकेशन सत्यापित', locationError:'लोकेशन जरूरी है। अनुमति दें और फिर प्रयास करें।', city:'शहर / कस्बा', district:'जिला', state:'राज्य', email:'ईमेल (वैकल्पिक)', social:'आपका सोशल मीडिया (वैकल्पिक)', source:'CLSL AI के बारे में कहाँ से पता चला? (वैकल्पिक)', relationship:'डीलर कनेक्शन (वैकल्पिक)', relationshipHelp:'अपना डीलर कोड या डीलर से मिला रेफरल कोड डालें।', ownDealer:'मैं CLSL डीलर हूँ', referred:'मेरे पास डीलर रेफरल है', dealerCode:'डीलर कोड', referralCode:'रेफरल कोड', searchDealer:'डीलर नाम या कोड खोजें', search:'खोजें', verify:'जाँचें', verified:'सत्यापित', confirm:'यह मेरी डीलरशिप है', scan:'QR स्कैन', otpButton:'OTP से आगे बढ़ें', otpTitle:'मोबाइल सत्यापित करें', otpHelp:'टेस्ट मोड: 123456 दर्ज करें।', otp:'6 अंकों का OTP', enter:'CLSL AI खोलें', back:'पीछे', continue:'आगे बढ़ें', wait:'कृपया प्रतीक्षा करें…', required:'जरूरी जानकारी पूरी करें।', test:'टेस्ट लॉगिन · परीक्षण के बाद Airtel DLT जोड़ा जाएगा' },
  gu: { welcome:'CLSL AI માં આપનું સ્વાગત છે', choose:'તમારી ભાષા પસંદ કરો', account:'તમારું CLSL AI એકાઉન્ટ બનાવો', intro:'પાકની સંભાળ, હવામાન, ઉત્પાદનો અને CLSL સહાય માટે એક સરળ લોગિન.', name:'પ્રથમ નામ', lastName:'છેલ્લું નામ', mobile:'મોબાઇલ નંબર', details:'તમારું લોગિન પૂર્ણ કરો', detailsHelp:'સ્થાનિક હવામાન અને પાક સહાય માટે વર્તમાન સ્થાન જરૂરી છે.', location:'મારું વર્તમાન સ્થાન વાપરો', locationReady:'સ્થાન ચકાસાયેલ છે', locationError:'સ્થાન જરૂરી છે. સ્થાન પરવાનગી આપો અને ફરી પ્રયાસ કરો.', city:'શહેર / નગર', district:'જિલ્લો', state:'રાજ્ય', email:'ઇમેઇલ (વૈકલ્પિક)', social:'તમે કયું સોશિયલ મીડિયા વાપરો છો? (વૈકલ્પિક)', source:'CLSL AI વિશે ક્યાંથી જાણ્યું? (વૈકલ્પિક)', relationship:'ડીલર કનેક્શન (વૈકલ્પિક)', relationshipHelp:'ડીલરો તેમનો CLSL ડીલર કોડ દાખલ કરે છે. ખેડૂતો તેમના ડીલર તરફથી મળેલ રેફરલ કોડ દાખલ કરી શકે છે.', ownDealer:'હું CLSL ડીલર છું', referred:'મારી પાસે ડીલર રેફરલ છે', dealerCode:'ડીલર કોડ', referralCode:'રેફરલ કોડ', searchDealer:'ડીલર નામ અથવા કોડ શોધો', search:'શોધો', verify:'ચકાસો', verified:'ચકાસાયેલ', confirm:'આ મારી ડીલરશિપ છે', scan:'QR સ્કેન', otpButton:'OTP સાથે ચાલુ રાખો', otpTitle:'તમારો મોબાઇલ ચકાસો', otpHelp:'ટેસ્ટ મોડ: 123456 દાખલ કરો.', otp:'6-અંકનો OTP', enter:'CLSL AI ખોલો', back:'પાછળ', continue:'આગળ વધો', wait:'કૃપા કરીને રાહ જુઓ…', required:'જરૂરી માહિતી પૂર્ણ કરો.', test:'ટેસ્ટ લોગિન · પરીક્ષણ પછી Airtel DLT જોડવામાં આવશે' },
  mr: { welcome:'CLSL AI मध्ये आपले स्वागत आहे', choose:'तुमची भाषा निवडा', account:'तुमचे CLSL AI खाते तयार करा', intro:'पीक काळजी, हवामान, उत्पादने आणि CLSL समर्थनासाठी एक सोपे लॉगिन.', name:'पहिले नाव', lastName:'आडनाव', mobile:'मोबाईल नंबर', details:'तुमचे लॉगिन पूर्ण करा', detailsHelp:'स्थानिक हवामान आणि पीक समर्थनासाठी वर्तमान स्थान आवश्यक आहे.', location:'माझे वर्तमान स्थान वापरा', locationReady:'स्थान सत्यापित केले', locationError:'स्थान आवश्यक आहे. स्थान परवानगी द्या आणि पुन्हा प्रयत्न करा.', city:'शहर / गाव', district:'जिल्हा', state:'राज्य', email:'ईमेल (ऐच्छिक)', social:'तुम्ही वापरत असलेले सोशल मीडिया (ऐच्छिक)', source:'तुम्हाला CLSL AI बद्दल कसे समजले? (ऐच्छिक)', relationship:'डीलर कनेक्शन (ऐच्छिक)', relationshipHelp:'डीलर त्यांचा CLSL डीलर कोड प्रविष्ट करतात. शेतकरी त्यांच्या डीलरकडून मिळालेला रेफरल कोड प्रविष्ट करू शकतात.', ownDealer:'मी CLSL डीलर आहे', referred:'माझ्याकडे डीलर रेफरल आहे', dealerCode:'डीलर कोड', referralCode:'रेफरल कोड', searchDealer:'डीलरचे नाव किंवा कोड शोधा', search:'शोधा', verify:'सत्यापित करा', verified:'सत्यापित', confirm:'ही माझी डीलरशिप आहे', scan:'QR स्कॅन', otpButton:'OTP सह सुरू ठेवा', otpTitle:'तुमचा मोबाईल सत्यापित करा', otpHelp:'चाचणी मोड: 123456 प्रविष्ट करा.', otp:'6-अंकी OTP', enter:'CLSL AI मध्ये प्रविष्ट करा', back:'मागे', continue:'पुढे जा', wait:'कृपया प्रतीक्षा करा…', required:'आवश्यक माहिती पूर्ण करा.', test:'चाचणी लॉगिन · चाचणीनंतर Airtel DLT कनेक्ट केले जाईल' },
  bn: { welcome:'CLSL AI তে স্বাগতম', choose:'আপনার ভাষা নির্বাচন করুন', account:'আপনার CLSL AI অ্যাকাউন্ট তৈরি করুন', intro:'ফসল সুরক্ষা, আবহাওয়া, পণ্য এবং CLSL সহায়তার জন্য একটি সহজ লগইন।', name:'প্রথম নাম', lastName:'শেষ নাম', mobile:'মোবাইল নম্বর', details:'লগইন সম্পূর্ণ করুন', detailsHelp:'স্থানীয় আবহাওয়া এবং ফসল সহায়তার জন্য বর্তমান অবস্থান প্রয়োজন।', location:'আমার বর্তমান অবস্থান ব্যবহার করুন', locationReady:'অবস্থান যাচাইকৃত', locationError:'অবস্থান প্রয়োজন। অবস্থানের অনুমতি দিন এবং আবার চেষ্টা করুন।', city:'শহর / নগর', district:'জেলা', state:'রাজ্য', email:'ইমেইল (ঐচ্ছিক)', social:'আপনি যে সোশ্যাল মিডিয়া ব্যবহার করেন (ঐচ্ছিক)', source:'আপনি CLSL AI সম্পর্কে কীভাবে জানলেন? (ঐচ্ছিক)', relationship:'ডিলার সংযোগ (ঐচ্ছিক)', relationshipHelp:'ডিলাররা তাদের CLSL ডিলার কোড প্রবেশ করান। কৃষকরা তাদের ডিলারের থেকে প্রাপ্ত একটি রেফারেল কোড প্রবেশ করতে পারেন।', ownDealer:'আমি একজন CLSL ডিলার', referred:'আমার কাছে ডিলার রেফারেল আছে', dealerCode:'ডিলার কোড', referralCode:'রেফারেল কোড', searchDealer:'ডিলারের নাম বা কোড খুঁজুন', search:'অনুসন্ধান', verify:'যাচাই করুন', verified:'যাচাইকৃত', confirm:'এটি আমার ডিলারশিপ', scan:'QR স্ক্যান করুন', otpButton:'OTP দিয়ে চালিয়ে যান', otpTitle:'আপনার মোবাইল যাচাই করুন', otpHelp:'টেস্ট মোড: 123456 প্রবেশ করুন।', otp:'৬-সংখ্যার OTP', enter:'CLSL AI এ প্রবেশ করুন', back:'পিছনে', continue:'চালিয়ে যান', wait:'অনুগ্রহ করে অপেক্ষা করুন…', required:'প্রয়োজনীয় তথ্য সম্পূর্ণ করুন।', test:'টেস্ট লগইন · পরীক্ষার পর Airtel DLT সংযুক্ত করা হবে' },
  bho: { welcome:'CLSL AI में राउर स्वागत बा', choose:'आपन भाषा चुनीं', account:'आपन CLSL AI अकाउंट बनाईं', intro:'फसल देखभाल, मौसम, उत्पाद आ CLSL मदद खातिर एगो आसान लॉगिन।', name:'पहिल नाम', lastName:'अंतिम नाम', mobile:'मोबाइल नंबर', details:'लॉगिन पूरा करीं', detailsHelp:'स्थानीय मौसम आ फसल मदद खातिर वर्तमान लोकेशन जरूरी बा।', location:'हमार वर्तमान लोकेशन लीं', locationReady:'लोकेशन सत्यापित बा', locationError:'लोकेशन जरूरी बा। लोकेशन के अनुमति दीं आ दोबारा कोशिश करीं।', city:'शहर / कस्बा', district:'जिला', state:'राज्य', email:'ईमेल (वैकल्पिक)', social:'राउर सोशल मीडिया (वैकल्पिक)', source:'CLSL AI के बारे में कहाँ से सुननी? (वैकल्पिक)', relationship:'डीलर कनेक्शन (वैकल्पिक)', relationshipHelp:'डीलर आपन CLSL डीलर कोड डालें। किसान अपना डीलर से मिलल रेफरल कोड डाल सके लें।', ownDealer:'हम एगो CLSL डीलर बानी', referred:'हमार लगे एगो डीलर रेफरल बा', dealerCode:'डीलर कोड', referralCode:'रेफरल कोड', searchDealer:'डीलर के नाम भा कोड खोजीं', search:'खोजीं', verify:'जाँचीं', verified:'सत्यापित', confirm:'ई हमार डीलरशिप बा', scan:'QR स्कैन', otpButton:'OTP से आगे बढ़ीं', otpTitle:'मोबाइल सत्यापित करीं', otpHelp:'टेस्ट मोड: 123456 डालीं।', otp:'6 अंक के OTP', enter:'CLSL AI खोलीं', back:'पीछे', continue:'आगे बढ़ीं', wait:'तनिका रुकीं…', required:'जरूरी जानकारी पूरा करीं।', test:'टेस्ट लॉगिन · टेस्ट के बाद Airtel DLT जुड़ जाई' },
  de: { welcome:'Willkommen bei CLSL AI', choose:'Wählen Sie Ihre Sprache', account:'Erstellen Sie Ihr CLSL AI-Konto', intro:'Ein einfaches Login für Pflanzenpflege, Wetter, Produkte und CLSL-Support.', name:'Vorname', lastName:'Nachname', mobile:'Handynummer', details:'Schließen Sie Ihr Login ab', detailsHelp:'Der aktuelle Standort ist für lokales Wetter und Pflanzenunterstützung erforderlich.', location:'Meinen aktuellen Standort verwenden', locationReady:'Standort bestätigt', locationError:'Standort ist erforderlich. Erlauben Sie den Standortzugriff und versuchen Sie es erneut.', city:'Stadt / Ort', district:'Bezirk', state:'Bundesland', email:'E-Mail (optional)', social:'Welche sozialen Medien nutzen Sie? (optional)', source:'Wie haben Sie von CLSL AI erfahren? (optional)', relationship:'Händlerverbindung (optional)', relationshipHelp:'Händler geben ihren CLSL-Händlercode ein. Landwirte können einen Empfehlungscode ihres Händlers eingeben.', ownDealer:'Ich bin ein CLSL-Händler', referred:'Ich habe eine Händlerempfehlung', dealerCode:'Händlercode', referralCode:'Empfehlungscode', searchDealer:'Händlername oder -code suchen', search:'Suchen', verify:'Überprüfen', verified:'Überprüft', confirm:'Das ist mein Händler', scan:'QR scannen', otpButton:'Weiter mit OTP', otpTitle:'Handy überprüfen', otpHelp:'Testmodus: Geben Sie 123456 ein.', otp:'6-stellige OTP', enter:'CLSL AI öffnen', back:'Zurück', continue:'Weiter', wait:'Bitte warten…', required:'Bitte füllen Sie die erforderlichen Informationen aus.', test:'TEST LOGIN · Airtel DLT wird nach dem Test verbunden' },
};
const socialOptions = ['WhatsApp', 'Facebook', 'Instagram', 'YouTube', 'Telegram', 'X'];
const sourceOptions = ['Dealer', 'Sales Officer', 'Facebook', 'Instagram', 'YouTube', 'WhatsApp', 'Google', 'Friend / Family', 'Other'];

async function api<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`/api/auth/${path}`, { method:'POST', headers:{ 'content-type':'application/json', ...(token ? { authorization:`Bearer ${token}` } : {}) }, body:JSON.stringify(body) });
  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* handled below */ }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Unable to continue. Please try again.');
  return data as T;
}

export function CommonAuthFlow({ onComplete }: { onComplete: (token: string, user: PublicUser) => void }) {
  const [step,setStep] = useState<Step>('language');
  const [language,setLanguage] = useState<LanguageCode>('en');
  const [firstName,setFirstName] = useState(''); const [lastName,setLastName] = useState(''); const [mobile,setMobile] = useState('');
  const [social,setSocial] = useState<string[]>([]); const [source,setSource] = useState('');
  const [place,setPlace] = useState<DevicePlace | null>(null);
  const [relationship,setRelationship] = useState<'none'|'dealer'|'referral'>('none');
  const [isFarmer,setIsFarmer] = useState<'yes'|'no'>('no');

  const [dealerCode,setDealerCode] = useState(''); const [dealer,setDealer] = useState<Dealer | null>(null); const [dealerConfirmed,setDealerConfirmed] = useState(false);
  const [isDealerUI,setIsDealerUI] = useState(false);
  const [referral,setReferral] = useState(''); const [referralName,setReferralName] = useState('');
  const [otp,setOtp] = useState(''); const [loading,setLoading] = useState(false); const [error,setError] = useState('');
  const [dealerError,setDealerError] = useState(''); const [referralError,setReferralError] = useState('');
  const [submitAttempted,setSubmitAttempted] = useState(false);
  const qrInput = useRef<HTMLInputElement>(null);
  const qrVideo = useRef<HTMLVideoElement>(null);
  const qrStream = useRef<MediaStream | null>(null);
  const qrScanTimer = useRef<number | null>(null);
  const qrRejected = useRef('');
  const [qrCameraOpen,setQrCameraOpen] = useState(false);
  const legacy = authCopy[language];
  const c: Record<string,string> = { ...text.en, ...text[language], welcome:legacy.welcome, choose:legacy.chooseLanguage,
    account:legacy.basics, intro:legacy.basicsHelp, name:legacy.firstName, mobile:legacy.mobile,
    details:legacy.profile, location:legacy.useLocation, locationReady:legacy.locationReady,
    city:legacy.city, district:legacy.district, state:legacy.state, email:legacy.email,
    social:legacy.social, source:legacy.source, dealerCode:legacy.dealerCode,
    referralCode:'Farmer refer code', verify:legacy.verifyDealer, scan:legacy.scanQr,
    otpButton:legacy.sendOtp, otpTitle:legacy.otpTitle, otpHelp:legacy.otpHelp,
    otp:legacy.otp, enter:legacy.verify, back:legacy.back, continue:legacy.continue,
    wait:legacy.loading, required:legacy.required, test:legacy.test };
  const normalizedMobile = useMemo(() => mobile.replace(/\D/g,'').replace(/^91(?=\d{10}$)/,''),[mobile]);
  const order: Step[] = ['language','account','details','otp'];
  const previous: Record<Step,Step> = { language:'language', account:'language', details:'account', otp:'details' };
  const stepNumber = order.indexOf(step) + 1;
  const fail = (problem: unknown) => setError(problem instanceof Error ? problem.message : c.required);
  const problemMessage = (problem: unknown) => problem instanceof Error ? problem.message : c.required;

  function referralFromQr(rawValue: string) {
    let value = rawValue;
    try {
      const url = new URL(value);
      value = url.searchParams.get('ref') || url.pathname.split('/').filter(Boolean).pop() || value;
    } catch { /* a QR can also contain the code itself */ }
    return value.trim().toUpperCase();
  }

  function stopQrCamera() {
    if (qrScanTimer.current !== null) {
      window.clearInterval(qrScanTimer.current);
      qrScanTimer.current = null;
    }
    qrStream.current?.getTracks().forEach((track) => track.stop());
    qrStream.current = null;
    if (qrVideo.current) qrVideo.current.srcObject = null;
    setQrCameraOpen(false);
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (code) { setReferral(code); setRelationship('referral'); setIsFarmer('yes'); }
  }, []);

  useEffect(() => () => stopQrCamera(), []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [step]);

  useEffect(() => {
    const code = referral.trim().toUpperCase();
    if (isFarmer !== 'yes' || code.length !== 7 || referralName) return;
    const timer = window.setTimeout(() => { void verifyReferral(code); }, 450);
    return () => window.clearTimeout(timer);
  }, [referral, isFarmer, referralName]);

  async function captureLocation() {
    setLoading(true); setError('');
    try { setPlace(await locateDevice('en')); }
    catch { setPlace(null); setError(c.locationError); }
    finally { setLoading(false); }
  }
  async function lookupDealer(code = dealerCode) {
    setLoading(true); setError(''); setDealerError(''); setDealer(null); setDealerConfirmed(false);
    try { 
      const data=await api<{dealer:Dealer}>('dealer-lookup',{dealer_code:code,mobile_number:`+91${normalizedMobile}`});
      
      setDealerCode(code); setDealer(data.dealer); setRelationship('dealer'); setReferral(''); setReferralName(''); 
    }
    catch(problem){ setDealerError(problemMessage(problem)); }
    finally { setLoading(false); }
  }
  async function verifyReferral(code = referral) {
    if (isFarmer !== 'yes') return setReferralError('Select Farmer before adding a referral code.');
    setLoading(true); setError(''); setReferralError(''); setReferralName('');
    try { 
      const data=await api<{dealer:{name:string}}>('referral-lookup',{referral_code:code.trim()});
      setReferralName(data.dealer.name); 
      setRelationship('referral'); 
      setDealerCode(''); 
      setDealer(null);
    }
    catch(problem){ setReferralError(problemMessage(problem)); }
    finally { setLoading(false); }
  }
  async function scanQr(event: ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0]; event.target.value=''; if(!file)return;
    try { const Detector=(window as unknown as {BarcodeDetector?:BarcodeDetectorConstructor}).BarcodeDetector; if(!Detector)return; const bitmap=await createImageBitmap(file); const codes=await new Detector({formats:['qr_code']}).detect(bitmap); bitmap.close(); if(!codes[0]?.rawValue)return; const code=referralFromQr(codes[0].rawValue); const data=await api<{dealer:{name:string}}>('referral-lookup',{referral_code:code}); setReferral(code); setReferralName(data.dealer.name); setRelationship('referral'); }
    catch{/* A non-CLSL QR is ignored. The user can scan again. */}
  }
  async function openQrCamera() {
    setError('');
    qrRejected.current = '';
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setError('Live QR scanning is not supported by this browser. Choose a saved QR image instead.');
      qrInput.current?.click();
      return;
    }
    setQrCameraOpen(true);
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (!qrVideo.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      qrStream.current = stream;
      qrVideo.current.srcObject = stream;
      await qrVideo.current.play();
      const detector = new Detector({ formats: ['qr_code'] });
      let scanning = false;
      qrScanTimer.current = window.setInterval(() => {
        void (async () => {
          if (scanning || !qrVideo.current || qrVideo.current.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          scanning = true;
          try {
            const codes = await detector.detect(qrVideo.current);
            if (codes[0]?.rawValue) {
              const code = referralFromQr(codes[0].rawValue);
              if (code === qrRejected.current) return;
              try {
                const data = await api<{dealer:{name:string}}>('referral-lookup',{referral_code:code});
                setReferral(code); setReferralName(data.dealer.name); setRelationship('referral'); setIsFarmer('yes');
                stopQrCamera();
              } catch { qrRejected.current = code; }
            }
          } catch { /* keep the camera open and try the next frame */ }
          finally { scanning = false; }
        })();
      }, 300);
    } catch {
      stopQrCamera();
      setError('Camera permission was not granted. Allow camera access and try again, or choose a saved QR image.');
    }
  }
  function chooseFarmer(selected: boolean) {
    setError(''); setDealerError(''); setReferralError('');
    if (selected) {
      setIsFarmer('yes'); setIsDealerUI(false); setDealerCode(''); setDealer(null); setDealerConfirmed(false);
      setRelationship(referral ? 'referral' : 'none');
      return;
    }
    setIsFarmer('no'); setIsDealerUI(false); setRelationship('none');
    setDealerCode(''); setDealer(null); setDealerConfirmed(false); setReferral(''); setReferralName('');
  }
  async function continueFromAccount(event: FormEvent) {
    event.preventDefault();
    if(firstName.trim().length<2||lastName.trim().length<1||normalizedMobile.length!==10) return setError(c.required);
    setLoading(true); setError(''); setDealerError('');
    try {
      const status = await api<{is_registered_dealer:boolean}>('dealer-mobile-status', { mobile_number:`+91${normalizedMobile}` });
      setIsDealerUI(status.is_registered_dealer);
      setIsFarmer('no'); setReferral(''); setReferralName('');
      setDealerCode(''); setDealer(null); setDealerConfirmed(false); setRelationship('none');
      setStep('details');
    } catch(problem) { fail(problem); }
    finally { setLoading(false); }
  }
  async function startOtp(event: FormEvent) {
    event.preventDefault(); setSubmitAttempted(true); setError('');
    if (!place) return setError(c.locationError);
    if (isDealerUI && (!dealer || !dealerConfirmed)) { setDealerError(dealer ? 'Confirm the dealership details to continue.' : 'Enter and verify your dealer code.'); return; }
    if (relationship==='dealer' && (!dealer || !dealerConfirmed)) { setDealerError(dealer ? 'Confirm the dealership details to continue.' : 'Enter and verify your dealer code.'); return; }
    if (relationship==='referral' && !referralName) { setReferralError('Enter a valid farmer referral code to continue.'); return; }
    if (!social.length) return setError('Select at least one social media platform.');
    if (!source) return setError('Select where you heard about CLSL AI.');
    setLoading(true);
    try {
      await api('send-otp', {
        mobile_number:`+91${normalizedMobile}`,
        ...(relationship==='dealer' ? { dealer_code: dealerCode } : {}),
      });
      setOtp('');
      setStep('otp');
    }
    catch(problem){fail(problem);} finally{setLoading(false);}
  }
  async function finish(event: FormEvent) {
    event.preventDefault(); if(!place)return; setLoading(true); setError('');
    try {
      const verified=await api<{session_token:string;user:PublicUser}>('verify-otp',{mobile_number:`+91${normalizedMobile}`,otp});
      const session=verified.session_token;
      const role = relationship==='dealer' ? 'dealer' : (isFarmer==='yes' ? 'farmer' : 'general_user');
      const data=await api<{user:PublicUser}>('profile',{role,first_name:firstName,last_name:lastName,preferred_language:language,email:null,city:place.city||null,district:place.district,village:place.village||null,state:place.state,social_media_used:social,acquisition_source:source,referral_code:relationship==='referral'?referral:null,dealer_code:relationship==='dealer'?dealerCode:null,location_latitude:place.latitude,location_longitude:place.longitude,location_consent:true,location_label:place.label,location_postcode:place.postcode||null,location_country:place.country||'India',location_accuracy_meters:place.accuracy,location_metadata:place.metadata},session);
      localStorage.setItem('clsl_auth_token',session); onComplete(session,data.user);
    } catch(problem){fail(problem);} finally{setLoading(false);}
  }

  return <main className={`auth-shell common-auth auth-screen-${step}`}><section className="auth-visual"><div className="auth-brand"><img src="/clsl-logo.png" alt="Crop Life Science Limited"/><span><b>CLSL AI</b><small>Crop care, made smarter.</small></span></div><div className="auth-welcome"><small>CROP LIFE SCIENCE LIMITED</small><h1>{c.welcome}</h1><p>{c.intro}</p></div><figure className="auth-mascot"><img src="/crop-life-mitra-tomato-doctor.jpg" alt="Crop Life Mitra"/><figcaption><b>Crop Life Mitra</b><small>Your smart crop companion</small></figcaption></figure><div className="auth-field-art"><SprayerScene /></div></section><section className="auth-panel"><header className="auth-panel-head"><span>STEP {stepNumber} OF 4</span><b>{Math.round(stepNumber/4*100)}% complete</b></header><div className="auth-progress">{order.map((item,index)=><i key={item} className={index<stepNumber?'active':''}/>)}</div>{step!=='language'&&<button type="button" className="auth-back" onClick={()=>{setError('');setStep(previous[step]);}}>← {c.back}</button>}{error&&<p className="auth-error" role="alert">{error}</p>}
    {step==='language'&&<div className="auth-step"><span className="auth-step-icon">文</span><h2>{c.choose}</h2><div className="language-grid">{languages.map(item=><button type="button" key={item.code} className={language===item.code?'selected':''} onClick={()=>setLanguage(item.code)}><b>{item.name}</b><small>{item.code.toUpperCase()}</small></button>)}</div><button className="auth-primary" onClick={()=>setStep('account')}>{c.continue} →</button></div>}
    {step==='account'&&<form className="auth-step" onSubmit={continueFromAccount}><h2>{c.account}</h2><p>{c.intro}</p><label>{c.name}<input value={firstName} onChange={event=>setFirstName(event.target.value)} required autoComplete="given-name"/></label><label>{c.lastName || 'Last name'}<input value={lastName} onChange={event=>setLastName(event.target.value)} required autoComplete="family-name"/></label><label>{c.mobile}<div className="phone-field"><span>+91</span><input inputMode="numeric" value={mobile} onChange={event=>{setMobile(event.target.value.replace(/\D/g,'').slice(0,10));setIsDealerUI(false);setDealerCode('');setDealer(null);setDealerConfirmed(false);setRelationship('none');}} required placeholder="98765 43210" autoComplete="tel"/></div></label><button className="auth-primary" disabled={loading}>{loading?c.wait:c.continue} →</button></form>}
    {step==='details'&&<form className="auth-step auth-details common-login-details" onSubmit={startOtp}><h2>{c.details}</h2><p>{c.detailsHelp}</p><section className={`login-location-card ${place?'ready':''}`}><button type="button" className="location-consent" onClick={()=>void captureLocation()} disabled={loading}><span>{place?'✓':'⌖'}</span><b>{loading?c.wait:place?c.locationReady:c.location}</b></button>{place&&<dl><div><dt>{c.district}</dt><dd>{place.district}</dd></div></dl>}</section><section className={`marketing-profile ${submitAttempted&&(!social.length||!source)?'has-error':''}`}><fieldset><legend>{c.social} {submitAttempted&&!social.length&&<em>Required</em>}</legend><div className="social-grid">{socialOptions.map(item=><label key={item}><input type="checkbox" checked={social.includes(item)} onChange={()=>setSocial(current=>current.includes(item)?current.filter(value=>value!==item):[...current,item])}/><span>{item}</span></label>)}</div></fieldset><label>{c.source} {submitAttempted&&!source&&<em>Required</em>}<select aria-required="true" value={source} onChange={event=>setSource(event.target.value)}><option value="" disabled>Select one</option>{sourceOptions.map(item=><option key={item}>{item}</option>)}</select></label></section>
      {!isDealerUI&&<section className="account-type-card farmer-choice"><label><input type="checkbox" checked={isFarmer==='yes'} onChange={event=>chooseFarmer(event.target.checked)}/><span><b>I am a farmer</b><small>Select this only to receive farmer offers and coupons.</small></span></label></section>}
      {isDealerUI&&<aside className="dealer-recognised"><b>Registered dealer mobile recognised</b><p>Enter your private CLSL dealer code below to verify the dealership.</p></aside>}
      {isFarmer==='yes'&&<aside className="farmer-benefit"><b>CLSL farmer benefits</b><p>Farmers can receive offers and coupons on CLSL products. Get a referral code from your nearest CLSL dealer.</p></aside>}
      
      {isFarmer === 'yes' && !isDealerUI && (
        <section className="relationship-card">
          <div className="referral-card"><button className="scan-referral" type="button" onClick={()=>void openQrCamera()}>Scan referral QR code</button><div className="referral-divider"><span>or enter the 7-character code</span></div><label>Dealer referral code<input className={referralError?'field-invalid':''} maxLength={7} value={referral} onChange={event=>{setError('');setReferralError('');setReferral(event.target.value.replace(/[^a-z0-9]/gi,'').toUpperCase());setReferralName('');setRelationship('referral');}} placeholder="A7Q2K9M" autoCapitalize="characters"/></label>{referralError&&<p className="code-field-error" role="alert">{referralError}</p>}<input ref={qrInput} hidden type="file" accept="image/*" capture="environment" onChange={scanQr}/>{qrCameraOpen&&<div className="referral-qr-camera"><video ref={qrVideo} muted playsInline aria-label="Camera scanning a dealer referral QR code"/><p>Point the back camera at the dealer QR code.</p><button type="button" onClick={stopQrCamera}>Cancel camera</button></div>}{referral.length===7&&!referralName&&loading&&<span className="referral-status">Checking code…</span>}{referralName&&<b className="verified-dealer">✓ {c.verified}: {referralName}</b>}</div>
        </section>
      )}

      {isDealerUI && isFarmer !== 'yes' && <section className="relationship-card"><div className="dealer-code-box"><label>{c.dealerCode}<div className="dealer-code-row"><input className={dealerError?'field-invalid':''} value={dealerCode} onChange={event=>{setError('');setDealerError('');setDealerCode(event.target.value.trim().toUpperCase());setDealer(null);setDealerConfirmed(false);}} placeholder="DLR-…" autoCapitalize="characters" disabled={relationship==='referral'||referral.length>0}/><button type="button" onClick={()=>void lookupDealer()} disabled={!dealerCode.trim()||loading||relationship==='referral'}>{loading?c.wait:c.verify}</button></div></label>{dealerError&&<p className="code-field-error" role="alert">{dealerError}</p>}{dealer&&<article className="verified-dealer-card"><b>{dealer.name}</b><dl><div><dt>City / territory</dt><dd>{dealer.location||dealer.sales_territory||'Not recorded'}</dd></div><div><dt>State</dt><dd>{dealer.state||'Not recorded'}</dd></div><div><dt>Owner</dt><dd>{dealer.owner_name||'Not recorded'}</dd></div><div><dt>Registered mobile</dt><dd>{dealer.registered_mobile||'Not recorded'}</dd></div></dl>{dealer.mobile_matches===false?<p className="dealer-mobile-warning">This dealership is registered with {dealer.registered_mobile}. Go back and log in using that mobile number to verify it.</p>:<button className="confirm-dealer" type="button" onClick={()=>{setDealerError('');setDealerConfirmed(true)}}>{dealerConfirmed?'✓ Details confirmed':'Confirm dealership details'}</button>}</article>}</div></section>}
      <div className="auth-submit-bar"><p className="test-login-note">{c.test}</p><button className="auth-primary" disabled={loading}>{loading?c.wait:c.otpButton} →</button></div></form>}
    {step==='otp'&&<form className="auth-step otp-step" onSubmit={finish}><span className="auth-step-icon">•••</span><h2>{c.otpTitle}</h2><p>{c.otpHelp}</p><b className="otp-number">+91 {normalizedMobile}</b><label>{c.otp}<input value={otp} onChange={event=>setOtp(event.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="1 2 3 4 5 6" autoFocus/></label><button className="auth-primary" disabled={loading||otp.length!==6}>{loading?c.wait:c.enter} →</button></form>}</section></main>;
}
