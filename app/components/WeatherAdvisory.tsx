'use client';

import { FormEvent, useMemo, useState } from 'react';
import { LanguageCode } from '../lib/i18n';

type WeatherData = {
  location: string;
  current: { temperature_2m: number; relative_humidity_2m: number; precipitation: number; weather_code: number; wind_speed_10m: number; wind_gusts_10m: number; label: string };
  nextSix: { rainChance: number; rainMm: number; maxWind: number; maxGust: number };
  source: string;
};

const weatherCopy: Record<LanguageCode, Record<string, string>> = {
  en: { eyebrow:'LIVE FIELD WEATHER',title:'Plan today’s farm work',intro:'Check spraying, irrigation and field activity conditions for your location.',placeholder:'Village, district or city',check:'Check weather',locate:'Use my location',loading:'Checking field conditions…',spraying:'Spraying',irrigation:'Irrigation',fertilizer:'Fertilizer application',fieldwork:'Field work',good:'Good',caution:'Use caution',avoid:'Avoid now',updated:'Current conditions',next:'Next 6 hours',rain:'Rain chance',wind:'Wind',humidity:'Humidity',source:'Forecast source',disclaimer:'Weather-based guidance only. Recheck the product label, local forecast and field conditions before acting.',enter:'Enter a location to get farm activity guidance.',rainRisk:'Rain can wash off spray or fertilizer.',windRisk:'Wind can cause spray drift.',heatRisk:'High heat can reduce spray safety and increase crop stress.',dryRisk:'Very dry air can increase evaporation.',irrigateRain:'Rain is likely soon; delay irrigation and reassess.',irrigateDry:'Hot or dry conditions may require a field moisture check.',fertRain:'Avoid application before likely rain or runoff.',fieldStorm:'Postpone exposed field work during rain, strong wind or storms.',fieldGood:'Normal field work is suitable; keep monitoring conditions.',sprayGood:'Conditions look reasonable for spraying. Follow the product label.' },
  hi: { eyebrow:'लाइव खेत मौसम',title:'आज के खेत के काम की योजना',intro:'अपने स्थान के लिए छिड़काव, सिंचाई और खेत कार्य की स्थिति देखें।',placeholder:'गाँव, जिला या शहर',check:'मौसम देखें',locate:'मेरा स्थान उपयोग करें',loading:'खेत की स्थिति देखी जा रही है…',spraying:'छिड़काव',irrigation:'सिंचाई',fertilizer:'खाद का प्रयोग',fieldwork:'खेत का काम',good:'अच्छा',caution:'सावधानी रखें',avoid:'अभी न करें',updated:'वर्तमान स्थिति',next:'अगले 6 घंटे',rain:'बारिश की संभावना',wind:'हवा',humidity:'नमी',source:'पूर्वानुमान स्रोत',disclaimer:'यह मौसम आधारित सलाह है। काम से पहले उत्पाद लेबल, स्थानीय पूर्वानुमान और खेत की स्थिति जाँचें।',enter:'खेत गतिविधि सलाह के लिए स्थान लिखें।',rainRisk:'बारिश दवा या खाद को बहा सकती है।',windRisk:'तेज हवा से स्प्रे बह सकता है।',heatRisk:'अधिक गर्मी में छिड़काव असुरक्षित हो सकता है।',dryRisk:'बहुत सूखी हवा में दवा जल्दी उड़ सकती है।',irrigateRain:'जल्द बारिश संभव है; सिंचाई रोककर फिर जाँचें।',irrigateDry:'गर्मी या सूखे में खेत की नमी जाँचें।',fertRain:'बारिश से पहले खाद न डालें।',fieldStorm:'बारिश, तेज हवा या तूफान में खुला खेत कार्य रोकें।',fieldGood:'सामान्य खेत कार्य ठीक है; मौसम देखते रहें।',sprayGood:'छिड़काव की स्थिति ठीक लगती है। उत्पाद लेबल मानें।' },
  gu: { eyebrow:'લાઇવ ખેતર હવામાન',title:'આજના ખેત કામની યોજના',intro:'તમારા સ્થળે છંટકાવ, સિંચાઈ અને ખેત કામની સ્થિતિ જુઓ.',placeholder:'ગામ, જિલ્લો અથવા શહેર',check:'હવામાન જુઓ',locate:'મારું સ્થાન વાપરો',loading:'ખેતરની સ્થિતિ તપાસી રહ્યા છીએ…',spraying:'છંટકાવ',irrigation:'સિંચાઈ',fertilizer:'ખાતર આપવું',fieldwork:'ખેત કામ',good:'સારું',caution:'સાવચેતી',avoid:'હમણાં ટાળો',updated:'હાલની સ્થિતિ',next:'આગામી 6 કલાક',rain:'વરસાદની શક્યતા',wind:'પવન',humidity:'ભેજ',source:'આગાહી સ્ત્રોત',disclaimer:'આ હવામાન આધારિત માર્ગદર્શન છે. કામ પહેલાં લેબલ અને સ્થાનિક સ્થિતિ તપાસો.',enter:'ખેત પ્રવૃત્તિ માર્ગદર્શન માટે સ્થળ લખો.',rainRisk:'વરસાદ દવા અથવા ખાતર ધોઈ શકે છે.',windRisk:'પવનથી સ્પ્રે ઊડી શકે છે.',heatRisk:'વધુ ગરમીમાં છંટકાવ ટાળો.',dryRisk:'સૂકી હવામાં દવા ઝડપથી બાષ્પીભવન થાય છે.',irrigateRain:'ટૂંક સમયમાં વરસાદ શક્ય છે; સિંચાઈ રોકો.',irrigateDry:'ગરમી અથવા સૂકા માટીમાં ભેજ તપાસો.',fertRain:'વરસાદ પહેલાં ખાતર ન આપો.',fieldStorm:'વરસાદ કે તેજ પવનમાં ખુલ્લું કામ ટાળો.',fieldGood:'સામાન્ય ખેત કામ યોગ્ય છે.',sprayGood:'છંટકાવ માટે સ્થિતિ યોગ્ય લાગે છે; લેબલ અનુસરો.' },
  mr: { eyebrow:'थेट शेत हवामान',title:'आजच्या शेतकामाचे नियोजन',intro:'फवारणी, सिंचन आणि शेतकामाची स्थिती तपासा.',placeholder:'गाव, जिल्हा किंवा शहर',check:'हवामान पाहा',locate:'माझे स्थान वापरा',loading:'शेताची स्थिती तपासत आहोत…',spraying:'फवारणी',irrigation:'सिंचन',fertilizer:'खत वापर',fieldwork:'शेतकाम',good:'चांगले',caution:'सावध रहा',avoid:'आत्ता टाळा',updated:'सध्याची स्थिती',next:'पुढील 6 तास',rain:'पावसाची शक्यता',wind:'वारा',humidity:'आर्द्रता',source:'अंदाज स्रोत',disclaimer:'हे हवामान-आधारित मार्गदर्शन आहे. कामापूर्वी लेबल व स्थानिक स्थिती तपासा.',enter:'शेतकाम मार्गदर्शनासाठी स्थान लिहा.',rainRisk:'पावसामुळे औषध किंवा खत वाहून जाऊ शकते.',windRisk:'वाऱ्यामुळे फवारणी वाहू शकते.',heatRisk:'जास्त उष्णतेत फवारणी टाळा.',dryRisk:'कोरड्या हवेत बाष्पीभवन वाढते.',irrigateRain:'लवकरच पाऊस शक्य; सिंचन थांबवा.',irrigateDry:'उष्ण किंवा कोरड्या स्थितीत मातीची ओल तपासा.',fertRain:'पावसापूर्वी खत देऊ नका.',fieldStorm:'पाऊस किंवा जोरदार वाऱ्यात काम टाळा.',fieldGood:'सामान्य शेतकामासाठी स्थिती योग्य आहे.',sprayGood:'फवारणीची स्थिती योग्य दिसते; लेबल पाळा.' },
  bn: { eyebrow:'লাইভ মাঠের আবহাওয়া',title:'আজকের কৃষিকাজের পরিকল্পনা',intro:'স্প্রে, সেচ ও মাঠের কাজের অবস্থা দেখুন।',placeholder:'গ্রাম, জেলা বা শহর',check:'আবহাওয়া দেখুন',locate:'আমার অবস্থান ব্যবহার করুন',loading:'মাঠের অবস্থা দেখা হচ্ছে…',spraying:'স্প্রে',irrigation:'সেচ',fertilizer:'সার প্রয়োগ',fieldwork:'মাঠের কাজ',good:'ভালো',caution:'সতর্ক থাকুন',avoid:'এখন এড়ান',updated:'বর্তমান অবস্থা',next:'পরবর্তী ৬ ঘণ্টা',rain:'বৃষ্টির সম্ভাবনা',wind:'বাতাস',humidity:'আর্দ্রতা',source:'পূর্বাভাস উৎস',disclaimer:'এটি আবহাওয়া-ভিত্তিক নির্দেশনা। কাজের আগে লেবেল ও স্থানীয় অবস্থা যাচাই করুন।',enter:'কৃষিকাজের পরামর্শ পেতে অবস্থান লিখুন।',rainRisk:'বৃষ্টিতে স্প্রে বা সার ধুয়ে যেতে পারে।',windRisk:'বাতাসে স্প্রে ছড়িয়ে যেতে পারে।',heatRisk:'অতিরিক্ত গরমে স্প্রে এড়ান।',dryRisk:'শুষ্ক বাতাসে দ্রুত বাষ্পীভবন হয়।',irrigateRain:'শীঘ্র বৃষ্টি হতে পারে; সেচ স্থগিত রাখুন।',irrigateDry:'গরম বা শুষ্ক হলে মাটির আর্দ্রতা দেখুন।',fertRain:'বৃষ্টির আগে সার দেবেন না।',fieldStorm:'বৃষ্টি বা জোর বাতাসে মাঠের কাজ বন্ধ রাখুন।',fieldGood:'সাধারণ মাঠের কাজের জন্য অবস্থা ভালো।',sprayGood:'স্প্রের অবস্থা ভালো মনে হচ্ছে; লেবেল মানুন।' },
  bho: { eyebrow:'लाइव खेत के मौसम',title:'आज के खेत काम के योजना',intro:'अपना जगह पर छिड़काव, सिंचाई आ खेत काम के हालत देखीं।',placeholder:'गाँव, जिला चाहे शहर',check:'मौसम देखीं',locate:'हमार जगह इस्तेमाल करीं',loading:'खेत के हालत देखल जाता…',spraying:'छिड़काव',irrigation:'सिंचाई',fertilizer:'खाद डालल',fieldwork:'खेत के काम',good:'ठीक बा',caution:'सावधानी',avoid:'अभी मत करीं',updated:'अभी के हालत',next:'अगिला 6 घंटा',rain:'बरखा के आसार',wind:'हवा',humidity:'नमी',source:'पूर्वानुमान स्रोत',disclaimer:'ई मौसम आधारित सलाह बा। काम से पहिले लेबल आ खेत के हालत देखीं।',enter:'खेत के काम के सलाह खातिर जगह लिखीं।',rainRisk:'बरखा दवाई चाहे खाद बहा सकेला।',windRisk:'हवा से स्प्रे उड़ सकेला।',heatRisk:'बहुत गर्मी में स्प्रे मत करीं।',dryRisk:'सूखल हवा में दवाई जल्दी उड़ सकेला।',irrigateRain:'जल्दी बरखा हो सकेला; सिंचाई रोक के फेर देखीं।',irrigateDry:'गर्मी चाहे सूखा में माटी के नमी देखीं।',fertRain:'बरखा से पहिले खाद मत डालीं।',fieldStorm:'बरखा चाहे तेज हवा में काम रोक दीं।',fieldGood:'सामान्य खेत काम खातिर हालत ठीक बा।',sprayGood:'स्प्रे के हालत ठीक लागत बा; लेबल मानीं।' },
};

export function WeatherAdvisory({ language, initialLocation = '' }: { language: LanguageCode; initialLocation?: string }) {
  const c = weatherCopy[language] || weatherCopy.en;
  const [location, setLocation] = useState(initialLocation);
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = async (query: string) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/weather?${query}`);
      const result = await response.json() as WeatherData & { error?: string };
      if (!response.ok) throw new Error(result.error || 'Weather is unavailable.');
      setData(result);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Weather is unavailable.'); }
    finally { setLoading(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); if (location.trim()) void load(`location=${encodeURIComponent(location.trim())}`); };
  const useLocation = () => {
    if (!navigator.geolocation) { setError('Location is not supported on this device.'); return; }
    setLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => void load(`lat=${position.coords.latitude}&lon=${position.coords.longitude}`),
      () => { setLoading(false); setError('Location permission was not available. Enter your village or district instead.'); },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60 * 1000 },
    );
  };

  const advice = useMemo(() => {
    if (!data) return [];
    const { current, nextSix } = data;
    const rainRisk = current.precipitation > 0 || nextSix.rainChance >= 55 || nextSix.rainMm >= 2;
    const windRisk = current.wind_speed_10m >= 15 || nextSix.maxWind >= 18 || nextSix.maxGust >= 28;
    const heatRisk = current.temperature_2m >= 35;
    const dryRisk = current.relative_humidity_2m < 35;
    const sprayReasons = [rainRisk && c.rainRisk, windRisk && c.windRisk, heatRisk && c.heatRisk, dryRisk && c.dryRisk].filter(Boolean) as string[];
    const sprayStatus = rainRisk || windRisk ? 'avoid' : heatRisk || dryRisk ? 'caution' : 'good';
    return [
      { icon:'◉', title:c.spraying, status:sprayStatus, text:sprayReasons.join(' ') || c.sprayGood },
      { icon:'◒', title:c.irrigation, status:rainRisk ? 'avoid' : heatRisk || dryRisk ? 'caution' : 'good', text:rainRisk ? c.irrigateRain : heatRisk || dryRisk ? c.irrigateDry : c.fieldGood },
      { icon:'⌁', title:c.fieldwork, status:rainRisk || current.weather_code >= 80 ? 'caution' : 'good', text:rainRisk || current.weather_code >= 80 ? c.fieldStorm : c.fieldGood },
    ];
  }, [data, c]);
  const statusLabel = (status: string) => status === 'good' ? c.good : status === 'avoid' ? c.avoid : c.caution;

  return <section className="weather-section">
    <div className="weather-intro"><p className="eyebrow"><span />{c.eyebrow}</p><h2>{c.title}</h2><p>{c.intro}</p><form onSubmit={submit}><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={c.placeholder} aria-label={c.placeholder} /><button disabled={loading || !location.trim()}>{c.check}</button></form><button className="location-button" onClick={useLocation} disabled={loading}>⌖ {c.locate}</button>{error && <p className="weather-error">{error}</p>}</div>
    <div className="weather-card">{loading ? <div className="weather-empty"><span>◌</span><b>{c.loading}</b></div> : data ? <><header><div><small>{c.updated}</small><h3>{data.location}</h3><p>{data.current.label}</p></div><b>{Math.round(data.current.temperature_2m)}°C</b></header><div className="weather-metrics"><span><small>{c.rain}</small><b>{Math.round(data.nextSix.rainChance)}%</b></span><span><small>{c.wind}</small><b>{Math.round(data.current.wind_speed_10m)} km/h</b></span><span><small>{c.humidity}</small><b>{Math.round(data.current.relative_humidity_2m)}%</b></span><span><small>{c.next}</small><b>{data.nextSix.rainMm.toFixed(1)} mm</b></span></div><div className="activity-grid">{advice.map((item) => <article key={item.title} className={`activity ${item.status}`}><span>{item.icon}</span><div><b>{item.title}</b><small>{item.text}</small></div><em>{statusLabel(item.status)}</em></article>)}</div><p className="weather-source">{c.source}: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">{data.source}</a> · {c.disclaimer}</p></> : <div className="weather-empty"><span>☀</span><b>{c.enter}</b></div>}</div>
  </section>;
}
