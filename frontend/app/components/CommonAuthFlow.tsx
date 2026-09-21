'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { locateDevice, type DevicePlace } from '../lib/device-location';
import { LanguageCode, languages } from '../lib/i18n';
import type { PublicUser } from './AuthFlow';
import { authCopy, SprayerScene } from './AuthFlow';

type Step = 'language' | 'account' | 'details' | 'otp';
type Dealer = { dealer_code: string; name: string; location?: string; sales_territory?: string; state?: string; already_bound?: boolean };

const text: Record<LanguageCode, Record<string, string>> = {
  en: { welcome:'Welcome to CLSL AI', choose:'Choose your language', account:'Create your CLSL AI account', intro:'One simple login for crop care, weather, products and CLSL support.', name:'First name', mobile:'Mobile number', details:'Complete your login', detailsHelp:'Current location is required for local weather and crop support.', location:'Use my current location', locationReady:'Location verified', locationError:'Location is required. Allow location permission and try again.', city:'City / Town', district:'District', state:'State', email:'Email (optional)', social:'Social media you use (optional)', source:'How did you hear about CLSL AI? (optional)', relationship:'Dealer connection (optional)', relationshipHelp:'Enter your own dealer code, or a referral code received from a dealer.', ownDealer:'I am a CLSL dealer', referred:'I have a dealer referral', dealerCode:'Dealer code', referralCode:'Referral code', searchDealer:'Search dealer name or code', search:'Search', verify:'Verify', verified:'Verified', confirm:'This is my dealership', scan:'Scan QR', otpButton:'Continue with OTP', otpTitle:'Verify your mobile', otpHelp:'Testing mode: enter 123456.', otp:'6-digit OTP', enter:'Enter CLSL AI', back:'Back', continue:'Continue', wait:'Please wait…', required:'Complete the required information.', test:'TEST LOGIN · Airtel DLT will be connected after testing' },
  hi: { welcome:'CLSL AI में आपका स्वागत है', choose:'अपनी भाषा चुनें', account:'अपना CLSL AI खाता बनाएँ', intro:'फसल, मौसम, उत्पाद और CLSL सहायता के लिए एक आसान लॉगिन।', name:'पहला नाम', mobile:'मोबाइल नंबर', details:'लॉगिन पूरा करें', detailsHelp:'स्थानीय मौसम और फसल सहायता के लिए वर्तमान लोकेशन जरूरी है।', location:'मेरी वर्तमान लोकेशन लें', locationReady:'लोकेशन सत्यापित', locationError:'लोकेशन जरूरी है। अनुमति दें और फिर प्रयास करें।', city:'शहर / कस्बा', district:'जिला', state:'राज्य', email:'ईमेल (वैकल्पिक)', social:'आपका सोशल मीडिया (वैकल्पिक)', source:'CLSL AI के बारे में कहाँ से पता चला? (वैकल्पिक)', relationship:'डीलर कनेक्शन (वैकल्पिक)', relationshipHelp:'अपना डीलर कोड या डीलर से मिला रेफरल कोड डालें।', ownDealer:'मैं CLSL डीलर हूँ', referred:'मेरे पास डीलर रेफरल है', dealerCode:'डीलर कोड', referralCode:'रेफरल कोड', searchDealer:'डीलर नाम या कोड खोजें', search:'खोजें', verify:'जाँचें', verified:'सत्यापित', confirm:'यह मेरी डीलरशिप है', scan:'QR स्कैन', otpButton:'OTP से आगे बढ़ें', otpTitle:'मोबाइल सत्यापित करें', otpHelp:'टेस्ट मोड: 123456 दर्ज करें।', otp:'6 अंकों का OTP', enter:'CLSL AI खोलें', back:'पीछे', continue:'आगे बढ़ें', wait:'कृपया प्रतीक्षा करें…', required:'जरूरी जानकारी पूरी करें।', test:'टेस्ट लॉगिन · परीक्षण के बाद Airtel DLT जोड़ा जाएगा' },
  gu: {}, mr: {}, bn: {}, bho: {},
};

for (const code of ['gu','mr','bn','bho'] as LanguageCode[]) text[code] = text.en;
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
  const [firstName,setFirstName] = useState(''); const [mobile,setMobile] = useState('');
  const [email,setEmail] = useState(''); const [social,setSocial] = useState<string[]>([]); const [source,setSource] = useState('');
  const [place,setPlace] = useState<DevicePlace | null>(null);
  const [relationship,setRelationship] = useState<'none'|'dealer'|'referral'>('none');

  const [dealerCode,setDealerCode] = useState(''); const [dealer,setDealer] = useState<Dealer | null>(null); const [dealerConfirmed,setDealerConfirmed] = useState(false);
  const [referral,setReferral] = useState(''); const [referralName,setReferralName] = useState('');
  const [otp,setOtp] = useState(''); const [loading,setLoading] = useState(false); const [error,setError] = useState('');
  const qrInput = useRef<HTMLInputElement>(null);
  const legacy = authCopy[language];
  const c: Record<string,string> = { ...text.en, ...text[language], welcome:legacy.welcome, choose:legacy.chooseLanguage,
    account:legacy.basics, intro:legacy.basicsHelp, name:legacy.firstName, mobile:legacy.mobile,
    details:legacy.profile, location:legacy.useLocation, locationReady:legacy.locationReady,
    city:legacy.city, district:legacy.district, state:legacy.state, email:legacy.email,
    social:legacy.social, source:legacy.source, dealerCode:legacy.dealerCode,
    referralCode:legacy.referral, verify:legacy.verifyDealer, scan:legacy.scanQr,
    otpButton:legacy.sendOtp, otpTitle:legacy.otpTitle, otpHelp:legacy.otpHelp,
    otp:legacy.otp, enter:legacy.verify, back:legacy.back, continue:legacy.continue,
    wait:legacy.loading, required:legacy.required, test:legacy.test };
  const normalizedMobile = useMemo(() => mobile.replace(/\D/g,'').replace(/^91(?=\d{10}$)/,''),[mobile]);
  const order: Step[] = ['language','account','details','otp'];
  const previous: Record<Step,Step> = { language:'language', account:'language', details:'account', otp:'details' };
  const stepNumber = order.indexOf(step) + 1;
  const fail = (problem: unknown) => setError(problem instanceof Error ? problem.message : c.required);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref')?.trim();
    if (code) { setReferral(code); setRelationship('referral'); }
  }, []);

  async function captureLocation() {
    setLoading(true); setError('');
    try { setPlace(await locateDevice('en')); }
    catch { setPlace(null); setError(c.locationError); }
    finally { setLoading(false); }
  }
  async function lookupDealer(code = dealerCode) {
    setLoading(true); setError(''); setDealer(null); setDealerConfirmed(false);
    try { const data=await api<{dealer:Dealer}>('dealer-lookup',{dealer_code:code}); setDealerCode(code); setDealer(data.dealer); }
    catch(problem){ fail(problem); }
    finally { setLoading(false); }
  }
  async function verifyReferral() {
    setLoading(true); setError(''); setReferralName('');
    try { const data=await api<{dealer:{name:string}}>('referral-lookup',{referral_code:referral.trim()}); setReferralName(data.dealer.name); }
    catch(problem){ fail(problem); }
    finally { setLoading(false); }
  }
  async function scanQr(event: ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0]; event.target.value=''; if(!file)return;
    try { const Detector=(window as unknown as {BarcodeDetector?:new(o:{formats:string[]})=>{detect:(source:ImageBitmap)=>Promise<Array<{rawValue:string}>>}}).BarcodeDetector; if(!Detector) throw new Error('QR scanning is not supported on this phone. Enter the code manually.'); const bitmap=await createImageBitmap(file); const codes=await new Detector({formats:['qr_code']}).detect(bitmap); bitmap.close(); if(!codes[0]?.rawValue) throw new Error('No QR code was found.'); let value=codes[0].rawValue; try{const url=new URL(value);value=url.searchParams.get('ref')||url.pathname.split('/').filter(Boolean).pop()||value;}catch{/* plain token */} setReferral(value); setReferralName(''); }
    catch(problem){fail(problem);}
  }
  async function startOtp(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!place) return setError(c.locationError);
    if (relationship==='dealer' && (!dealer || !dealerConfirmed)) return setError('Verify and confirm your dealership.');
    if (relationship==='referral' && !referralName) return setError('Verify the referral code first.');
    setLoading(true);
    try { await api('send-otp',{mobile_number:`+91${normalizedMobile}`}); setOtp(''); setStep('otp'); }
    catch(problem){fail(problem);} finally{setLoading(false);}
  }
  async function finish(event: FormEvent) {
    event.preventDefault(); if(!place)return; setLoading(true); setError('');
    try {
      const verified=await api<{session_token:string;user:PublicUser}>('verify-otp',{mobile_number:`+91${normalizedMobile}`,otp});
      const session=verified.session_token;
      const role = relationship==='dealer' ? 'dealer' : relationship==='referral' ? 'farmer' : 'general_user';
      const data=await api<{user:PublicUser}>('profile',{role,first_name:firstName,preferred_language:language,email:email||null,city:place.city||null,district:place.district,village:place.village||null,state:place.state,social_media_used:social,acquisition_source:source||null,referral_code:relationship==='referral'?referral:null,dealer_code:relationship==='dealer'?dealerCode:null,location_latitude:place.latitude,location_longitude:place.longitude,location_consent:true,location_label:place.label,location_postcode:place.postcode||null,location_country:place.country||'India',location_accuracy_meters:place.accuracy,location_metadata:place.metadata},session);
      localStorage.setItem('clsl_auth_token',session); onComplete(session,data.user);
    } catch(problem){fail(problem);} finally{setLoading(false);}
  }

  return <main className="auth-shell common-auth"><section className="auth-visual"><div className="auth-brand"><img src="/clsl-logo.png" alt="Crop Life Science Limited"/><span><b>CLSL AI</b><small>Crop care, made smarter.</small></span></div><div className="auth-welcome"><small>CROP LIFE SCIENCE LIMITED</small><h1>{c.welcome}</h1><p>{c.intro}</p></div><figure className="auth-mascot"><img src="/crop-life-mitra-tomato-doctor.jpg" alt="Crop Life Mitra"/><figcaption><b>Crop Life Mitra</b><small>Your smart crop companion</small></figcaption></figure><div className="auth-field-art"><SprayerScene /></div></section><section className="auth-panel"><header className="auth-panel-head"><span>STEP {stepNumber} OF 4</span><b>{Math.round(stepNumber/4*100)}% complete</b></header><div className="auth-progress">{order.map((item,index)=><i key={item} className={index<stepNumber?'active':''}/>)}</div>{step!=='language'&&<button type="button" className="auth-back" onClick={()=>{setError('');setStep(previous[step]);}}>← {c.back}</button>}{error&&<p className="auth-error" role="alert">{error}</p>}
    {step==='language'&&<div className="auth-step"><span className="auth-step-icon">文</span><h2>{c.choose}</h2><div className="language-grid">{languages.map(item=><button type="button" key={item.code} className={language===item.code?'selected':''} onClick={()=>setLanguage(item.code)}><b>{item.name}</b><small>{item.code.toUpperCase()}</small></button>)}</div><button className="auth-primary" onClick={()=>setStep('account')}>{c.continue} →</button></div>}
    {step==='account'&&<form className="auth-step" onSubmit={event=>{event.preventDefault();if(firstName.trim().length<2||normalizedMobile.length!==10)return setError(c.required);setError('');setStep('details');}}><h2>{c.account}</h2><p>{c.intro}</p><label>{c.name}<input value={firstName} onChange={event=>setFirstName(event.target.value)} required autoComplete="given-name"/></label><label>{c.mobile}<div className="phone-field"><span>+91</span><input inputMode="numeric" value={mobile} onChange={event=>setMobile(event.target.value.replace(/\D/g,'').slice(0,10))} required placeholder="98765 43210" autoComplete="tel"/></div></label><button className="auth-primary">{c.continue} →</button></form>}
    {step==='details'&&<form className="auth-step auth-details common-login-details" onSubmit={startOtp}><h2>{c.details}</h2><p>{c.detailsHelp}</p><section className={`login-location-card ${place?'ready':''}`}><button type="button" className="location-consent" onClick={()=>void captureLocation()} disabled={loading}><span>{place?'✓':'⌖'}</span><b>{loading?c.wait:place?c.locationReady:c.location}</b></button>{place&&<dl><div><dt>{c.city}</dt><dd>{place.village||place.city}</dd></div><div><dt>{c.district}</dt><dd>{place.district}</dd></div><div><dt>{c.state}</dt><dd>{place.state}</dd></div></dl>}</section><label>{c.email}<input type="email" value={email} onChange={event=>setEmail(event.target.value)} autoComplete="email"/></label><fieldset><legend>{c.social}</legend><div className="social-grid">{socialOptions.map(item=><label key={item}><input type="checkbox" checked={social.includes(item)} onChange={()=>setSocial(current=>current.includes(item)?current.filter(value=>value!==item):[...current,item])}/><span>{item}</span></label>)}</div></fieldset><label>{c.source}<select value={source} onChange={event=>setSource(event.target.value)}><option value="">—</option>{sourceOptions.map(item=><option key={item}>{item}</option>)}</select></label><section className="relationship-card"><h3>{c.relationship}</h3><p>{c.relationshipHelp}</p><div className="relationship-tabs"><button type="button" className={relationship==='none'?'active':''} onClick={()=>{setRelationship('none');setDealer(null);setReferralName('');}}>No code</button><button type="button" className={relationship==='dealer'?'active':''} onClick={()=>{setRelationship('dealer');setReferralName('');}}>{c.ownDealer}</button><button type="button" className={relationship==='referral'?'active':''} onClick={()=>{setRelationship('referral');setDealer(null);}}>{c.referred}</button></div>
      {relationship==='dealer'&&<div className="dealer-code-box"><p className="dealer-code-help">Enter your CLSL dealer code exactly as provided by your sales officer. Your mobile number will be securely linked to this code on first login.</p><label>{c.dealerCode}<div className="dealer-code-row"><input value={dealerCode} onChange={event=>{setDealerCode(event.target.value.trim().toUpperCase());setDealer(null);setDealerConfirmed(false);}} placeholder="e.g. DL-XXXXX" autoCapitalize="characters"/><button type="button" onClick={()=>void lookupDealer()} disabled={!dealerCode.trim()||loading}>{loading?c.wait:c.verify}</button></div></label>{dealer&&<article className="verified-dealer-card"><b>✓ {dealer.name}</b><small>{[dealer.sales_territory,dealer.state].filter(Boolean).join(' · ')}</small>{dealer.already_bound&&<span className="dealer-bound-note">📱 Code already linked — you must use the registered mobile number.</span>}<label><input type="checkbox" checked={dealerConfirmed} onChange={event=>setDealerConfirmed(event.target.checked)}/>{c.confirm}</label></article>}</div>}
      {relationship==='referral'&&<div className="referral-card"><label>{c.referralCode}<div className="dealer-code-row"><input value={referral} onChange={event=>{setReferral(event.target.value);setReferralName('');}}/><button type="button" onClick={()=>void verifyReferral()} disabled={!referral.trim()||loading}>{c.verify}</button></div></label><button type="button" onClick={()=>qrInput.current?.click()}>▣ {c.scan}</button><input ref={qrInput} hidden type="file" accept="image/*" capture="environment" onChange={scanQr}/>{referralName&&<b className="verified-dealer">✓ {c.verified}: {referralName}</b>}</div>}
    </section><p className="test-login-note">{c.test}</p><button className="auth-primary" disabled={loading||!place}>{loading?c.wait:c.otpButton} →</button></form>}
    {step==='otp'&&<form className="auth-step otp-step" onSubmit={finish}><span className="auth-step-icon">•••</span><h2>{c.otpTitle}</h2><p>{c.otpHelp}</p><b className="otp-number">+91 {normalizedMobile}</b><label>{c.otp}<input value={otp} onChange={event=>setOtp(event.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="1 2 3 4 5 6" autoFocus/></label><button className="auth-primary" disabled={loading||otp.length!==6}>{loading?c.wait:c.enter} →</button></form>}</section></main>;
}
