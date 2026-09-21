'use client';
import FieldIdentityBanner from './components/FieldIdentityBanner';

import { ChangeEvent, FormEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { CatalogProduct, productSupportsCrop, searchCatalogProducts } from './lib/catalog';
import { getCopy, getLanguage, LanguageCode, languages } from './lib/i18n';
import { FarmTools } from './components/FarmTools';
import { WeatherAdvisory } from './components/WeatherAdvisory';
import { PwaInstall } from './components/PwaInstall';
import { PublicUser, SprayerScene } from './components/AuthFlow';
import { CommonAuthFlow } from './components/CommonAuthFlow';
import salesContactData from './data/sales-contacts.json';
import type { FieldIdentity } from './lib/field-access';
import { reverseGeocode } from './lib/device-location';

type View = 'home' | 'inspect' | 'assistant' | 'products' | 'tools' | 'history';
type Diagnosis = {
  crop: string; crop_confidence: number | null; issue_detected: boolean; issue_type: string; likely_issue: string;
  confidence: number; observed_symptoms: string[]; alternative_possibilities: string[];
  catalog_crop: string; plant_condition: string; problem_stage: string; probable_causes: string[];
  immediate_actions: string[]; prevention_tips: string[]; questions_for_farmer: string[];
  additional_information_required: boolean; recommended_next_action: string; summary: string;
  recommendations: CatalogProduct[];
  storage_status?: 'not_configured' | 'stored' | 'partial_failure' | 'failed';
  persistence_status?: 'saved' | 'skipped' | 'failed';
  declared_crop?: string | null; crop_source?: 'field_officer' | 'general_user' | 'ai_optional';
  confidence_level?: 'high' | 'medium' | 'low'; catalogue_source?: string;
};
type ChatMessage = { role: 'user' | 'assistant'; content: string; products?: CatalogProduct[]; contacts?: SalesContact[] };
type StoredInspection = { id: string; createdAt: string; crop: string; issue: string; confidence: number; summary: string; result: Diagnosis; city?: string; };
type Profile = { name: string; location: string; state: string; district?: string; village?: string; territory: string; city: string; language: LanguageCode; crop?: string; role?: string; };
type SalesContact = { name: string; designation: string; state: string; territory: string; city: string; email: string; phone: string };
type TopWeatherData = {
  location: string;
  current: { temperature_2m: number; precipitation: number; weather_code: number; wind_speed_10m: number; label: string };
  nextSix: { rainChance: number; rainMm: number; maxWind: number; maxGust: number };
};
type Copy = Record<string, string>;
type Theme = 'light' | 'dark';

const categoryPurpose: Record<string, string> = {
  'Insecticides': 'Products for insect and pest management',
  'Fungicides': 'Products for fungal disease management',
  'Antibiotic / Bactericide': 'Products for bacterial disease management',
  'Weedicides': 'Products for weed management',
  'Micro Fertilizers': 'Nutrition support for deficiency issues',
  'Bio Stimulant': 'Plant support for growth stress',
  'Plant Growth Regulator': 'Growth management for the identified crop',
  'Seed Treatment': 'Products for seed-borne or germination-stage issues',
};
const HISTORY_KEY = 'crop-life-ai-inspections-v1';
const PROFILE_KEY = 'crop-life-ai-profile-v1';
const THEME_KEY = 'crop-life-ai-theme-v1';
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const OPTIMISED_IMAGE_MAX_SIDE = 1280;
const OPTIMISED_IMAGE_MAX_BYTES = 700 * 1024;
const DEFAULT_PROFILE: Profile = { name: 'Farmer', location: '', state: '', territory: '', city: '', language: 'en' };
const salesContacts = salesContactData as SalesContact[];

function designationRank(value: string) {
  if (/sales officer/i.test(value)) return 1;
  if (/sales executive/i.test(value)) return 2;
  if (/area sales/i.test(value)) return 3;
  if (/regional/i.test(value)) return 4;
  return 5;
}

function contactsForProfile(profile: Profile, limit = 2) {
  if (!profile.state && !profile.territory && !profile.city) return [];
  return salesContacts.map((contact) => {
    let score = 0;
    if (profile.state && contact.state === profile.state) score += 20;
    if (profile.territory && contact.territory === profile.territory) score += 60;
    if (profile.city && contact.city === profile.city) score += 100;
    return { contact, score };
  }).filter((match) => match.score > 0).sort((a, b) => b.score - a.score || designationRank(a.contact.designation) - designationRank(b.contact.designation)).slice(0, limit).map((match) => match.contact);
}

function whatsappUrl(contact: SalesContact, message: string) {
  const phone = contact.phone.replace(/\D/g, '');
  return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '';
}

async function optimiseImage(file: File) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('This photo could not be prepared.'));
    });
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    // The same prepared file is used for live AI and private S3 storage. Keeping
    // its edge and byte size modest reduces phone upload and analysis time.
    if (longestSide <= OPTIMISED_IMAGE_MAX_SIDE && file.size <= OPTIMISED_IMAGE_MAX_BYTES) return file;
    const scale = Math.min(1, OPTIMISED_IMAGE_MAX_SIDE / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .78));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, '') || 'crop-photo';
    return new File([blob], `${name}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch { return file; }
  finally { URL.revokeObjectURL(objectUrl); }
}

async function readApiResponse<T>(response: Response): Promise<T & { error?: string }> {
  const text = await response.text();
  try { return JSON.parse(text) as T & { error?: string }; }
  catch {
    if (!response.ok) throw new Error('Analysis could not be completed. The photos may be too large or the AI service may be busy. Please try again.');
    throw new Error('The analysis service returned an unexpected response. Please try again.');
  }
}


function createClientId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}


export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const mascotCameraRef = useRef<HTMLInputElement>(null);
  const mascotUploadRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [view, setView] = useState<View>('home');
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [error, setError] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [history, setHistory] = useState<StoredInspection[]>([]);
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [profileOpen, setProfileOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [mascotPreparing, setMascotPreparing] = useState(false);
  const [approvedCatalogue, setApprovedCatalogue] = useState<CatalogProduct[] | null>(null);
  const [approvedCrops, setApprovedCrops] = useState<string[]>([]);
  const [catalogueUnavailable, setCatalogueUnavailable] = useState(false);
  const [fieldSession, setFieldSession] = useState<{ employee: FieldIdentity | null; error?: string; loaded: boolean }>({ employee: null, loaded: false });
  const [publicSession, setPublicSession] = useState<{ token: string; user: PublicUser | null; checked: boolean }>({ token: '', user: null, checked: false });
  const [liveCoordinates, setLiveCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [livePlaceName, setLivePlaceName] = useState('');


  useEffect(() => {
    fetch('/api/field/session', { cache: 'no-store' })
      .then(async (response) => ({ response, body: await response.json() as { employee?: FieldIdentity | null; error?: string } }))
      .then(({ response, body }) => setFieldSession({ employee: body.employee || null, error: response.status === 401 ? body.error : undefined, loaded: true }))
      .catch(() => setFieldSession({ employee: null, loaded: true }));
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('clsl_auth_token') || '';
    if (!token) {
      const timer = window.setTimeout(() => setPublicSession({ token: '', user: null, checked: true }), 0);
      return () => window.clearTimeout(timer);
    }
    fetch('/api/auth/me', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}' })
      .then(async (response) => ({ response, body: await response.json() as { user?: PublicUser } }))
      .then(({ response, body }) => {
        if (!response.ok || !body.user || body.user.requires_onboarding) throw new Error('Profile setup required');
        setPublicSession({ token, user: body.user, checked: true });
        const user = body.user;
        setProfile((current) => {
          const saved: Profile = { ...current, name: user.first_name || current.name, role: user.role || current.role, language: getLanguage(user.preferred_language), city: user.city || current.city, district:user.district, village:user.village, state: user.state || current.state, location: user.location_label || [user.village, user.city, user.district, user.state].filter(Boolean).join(', ') || current.location };
          try { localStorage.setItem(PROFILE_KEY, JSON.stringify(saved)); } catch { /* device storage may be unavailable */ }
          return saved;
        });
      })
      .catch(() => { localStorage.removeItem('clsl_auth_token'); setPublicSession({ token: '', user: null, checked: true }); });
  }, []);

  useEffect(() => {
    const user = publicSession.user;
    if (!user || !navigator.geolocation) return;
    if (user.location_latitude != null && user.location_longitude != null) {
      setLiveCoordinates({ latitude: user.location_latitude, longitude: user.location_longitude });
      setLivePlaceName(user.location_label || [user.village,user.city,user.district,user.state].filter(Boolean).join(', '));
    }
    let lastNamedAt = 0;
    const watcher = navigator.geolocation.watchPosition((position) => {
      const latitude = Math.round(position.coords.latitude * 10000) / 10000;
      const longitude = Math.round(position.coords.longitude * 10000) / 10000;
      setLiveCoordinates({ latitude, longitude });
      if (Date.now() - lastNamedAt > 10 * 60 * 1000) {
        lastNamedAt = Date.now();
        void reverseGeocode(latitude, longitude, 'en').then((place) => setLivePlaceName(place.label)).catch(() => undefined);
      }
    }, () => undefined, { enableHighAccuracy:false, maximumAge:5*60*1000, timeout:15000 });
    return () => navigator.geolocation.clearWatch(watcher);
  }, [publicSession.user]);

  useEffect(() => {
    const employee = fieldSession.employee;
    if (!employee) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- verified field identity hydrates the local profile snapshot
    setProfile((current) => {
      const saved = {
        ...current,
        name: employee.full_name,
        state: employee.state,
        territory: employee.territory,
        city: employee.territory,
        location: employee.location || [employee.territory, employee.state].filter(Boolean).join(', '),
      };
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(saved)); } catch { /* device storage may be unavailable */ }
      return saved;
    });
  }, [fieldSession.employee]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedHistory = localStorage.getItem(HISTORY_KEY);
        const storedProfile = localStorage.getItem(PROFILE_KEY);
        if (storedHistory) setHistory(JSON.parse(storedHistory));
        if (storedProfile) { const saved = JSON.parse(storedProfile); setProfile({ ...DEFAULT_PROFILE, ...saved, language: getLanguage(saved.language) }); }
      } catch { /* device storage may be unavailable */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  // The farmer UI deliberately reads the same approved PostgreSQL catalogue
  // as inspection recommendations and the chatbot. A final portal release is
  // therefore visible here without rebuilding or redeploying the app.
  useEffect(() => {
    let active = true;
    const loadApprovedCatalogue = async () => {
      try {
        const response = await fetch('/api/catalogue/live', { cache: 'no-store' });
        const data = await readApiResponse<{ items?: CatalogProduct[]; crops?: string[] }>(response);
        if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || 'Catalogue unavailable');
        if (active) {
          setApprovedCatalogue(data.items);
          setApprovedCrops(Array.isArray(data.crops) ? data.crops : Array.from(new Set(data.items.flatMap((product) => product.approvedCrops || []))).sort());
          setCatalogueUnavailable(false);
        }
      } catch {
        if (active) { setApprovedCatalogue([]); setApprovedCrops([]); setCatalogueUnavailable(true); }
      }
    };
    void loadApprovedCatalogue();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('open');
    const timer = window.setTimeout(() => {
      if (requested && ['inspect', 'assistant', 'products', 'tools', 'history'].includes(requested)) setView(requested as View);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = localStorage.getItem(THEME_KEY);
      const initial = saved === 'dark' || saved === 'light' ? saved : 'light';
      setTheme(initial);
      document.documentElement.dataset.theme = initial;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - started;
      const next = Math.min(96, Math.max(1, Math.round(5 + 92 * (1 - Math.exp(-elapsed / 18_000)))));
      setAnalysisProgress((current) => Math.max(current, next));
    }, 300);
    return () => window.clearInterval(timer);
  }, [loading]);

  const nav = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const language = getLanguage(profile.language);
  const t = getCopy(language);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const openProducts = (query = '') => { setProductQuery(query); nav('products'); };
  const saveProfile = (next: Profile) => { const saved = { ...next, location: [next.city, next.state].filter(Boolean).join(', ') || next.location }; setProfile(saved); localStorage.setItem(PROFILE_KEY, JSON.stringify(saved)); setProfileOpen(false); };
  const changeLanguage = (next: LanguageCode) => { const updated = { ...profile, language: next }; setProfile(updated); localStorage.setItem(PROFILE_KEY, JSON.stringify(updated)); document.documentElement.lang = next; };
  const toggleTheme = () => { const next = theme === 'dark' ? 'light' : 'dark'; setTheme(next); localStorage.setItem(THEME_KEY, next); document.documentElement.dataset.theme = next; };
  const completePublicLogin = (token: string, user: PublicUser) => {
    setPublicSession({ token, user, checked: true });
    setProfile((current) => {
      const saved: Profile = { ...current, name: user.first_name || current.name, role: user.role || current.role, language: getLanguage(user.preferred_language), city: user.city || current.city, district:user.district, village:user.village, state: user.state || current.state, location: user.location_label || [user.village, user.city, user.district, user.state].filter(Boolean).join(', ') || current.location };
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(saved)); } catch { /* device storage may be unavailable */ }
      return saved;
    });
  };
  const logoutPublicSession = async () => {
    const token = publicSession.token;
    setProfileOpen(false);
    try {
      if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: '{}' });
    } catch { /* Local sign-out must still complete if the network is unavailable. */ }
    try {
      localStorage.removeItem('clsl_auth_token');
      localStorage.removeItem(PROFILE_KEY);
    } catch { /* Device storage may be unavailable. */ }
    setPublicSession({ token: '', user: null, checked: true });
    setLiveCoordinates(null);
    setLivePlaceName('');
    setProfile(DEFAULT_PROFILE);
    setFiles([]);
    setResult(null);
    setView('home');
  };
  const chooseMascotPhotos = async (selected: File[]) => {
    const picked = selected.slice(0, 5);
    if (!picked.length) return;
    setMascotPreparing(true); setError('');
    try {
      setFiles(await Promise.all(picked.map(optimiseImage)));
      nav('inspect');
    } catch {
      setError('These photos could not be prepared. Please try again.');
      nav('inspect');
    } finally { setMascotPreparing(false); }
  };
  const analyse = async (form: HTMLFormElement) => {
    if (fieldSession.employee?.collection_mode === 'sales_officer' && files.length < 4) {
      setError(t.fieldFourRequired);
      return;
    }
    const uploadBytes = files.reduce((total, file) => total + file.size, 0);
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      setError(language === 'en' ? 'These photos are too large together. Please select fewer photos or use JPG images.' : t.safety);
      return;
    }
    setAnalysisProgress(1); setLoading(true); setError('');
    const body = new FormData(form); body.set('language', language); files.forEach((file) => body.append('images', file));
    try {
      const response = await fetch('/api/inspect', { method: 'POST', headers: publicSession.token ? { authorization: `Bearer ${publicSession.token}` } : undefined, body });
      const data = await readApiResponse<Diagnosis>(response);
      if (!response.ok) throw new Error(data.error || 'Unable to analyse these images.');
      setAnalysisProgress(100);
      // Let the farmer see the completed state before the diagnosis replaces it.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
      setResult(data);
      const record: StoredInspection = { id: createClientId(), createdAt: new Date().toISOString(), crop: data.crop || 'Unknown crop', issue: data.likely_issue || 'No clear issue', confidence: data.confidence, summary: data.summary, result: data, city: profile.city };
      setHistory((previous) => { const next = [record, ...previous].slice(0, 50); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); return next; });
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to analyse these images.'); }
    finally { setLoading(false); setAnalysisProgress(0); }
  };


  if (!fieldSession.loaded || !publicSession.checked) return <main className="auth-loading"><img src="/clsl-logo.png" alt="CLSL" /><b>CLSL AI</b><span>Preparing your crop companion…</span></main>;
  if (!fieldSession.employee && !publicSession.user) return <CommonAuthFlow onComplete={completePublicLogin} />;


  return <main className="app-shell">
    <Header view={view} nav={nav} profile={profile} onProfile={() => setProfileOpen(true)} language={language} changeLanguage={changeLanguage} theme={theme} toggleTheme={toggleTheme} t={t} />
    <FieldIdentityBanner employee={fieldSession.employee} error={fieldSession.error} t={t} />
    {publicSession.user?.role === 'dealer' && <DealerReferralBanner token={publicSession.token} />}
    <TopWeatherBar location={livePlaceName || profile.location || profile.city} coordinates={liveCoordinates} openProfile={() => setProfileOpen(true)} t={t} />
    <div className="mascot-file-inputs" aria-hidden="true"><input ref={mascotCameraRef} tabIndex={-1} type="file" accept="image/*" capture="environment" onChange={(event) => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void chooseMascotPhotos(selected); }} /><input ref={mascotUploadRef} tabIndex={-1} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void chooseMascotPhotos(selected); }} /></div>
    {view === 'home' && <HomeView nav={nav} t={t} language={language} location={livePlaceName || profile.location || profile.city} coordinates={liveCoordinates} mascotPreparing={mascotPreparing} takePhoto={() => mascotCameraRef.current?.click()} uploadPhotos={() => mascotUploadRef.current?.click()} />}
    {view === 'inspect' && <section className="workspace"><PageTitle eyebrow={t.doctor} title={t.inspectHeading} text={t.inspectIntro} /><div className="inspection-layout"><div className="inspect-card large"><InspectionForm inputRef={inputRef} files={files} crops={approvedCrops} setFiles={setFiles} onAnalyse={analyse} loading={loading} analysisProgress={analysisProgress} error={error} t={t} fieldIdentity={fieldSession.employee} initialCoordinates={liveCoordinates} /></div><Tips t={t} /></div>{result && <Result result={result} profile={profile} onClose={() => setResult(null)} openProfile={() => setProfileOpen(true)} openProducts={openProducts} openProduct={setSelectedProduct} nav={nav} t={t} />}</section>}
    {view === 'assistant' && <Assistant openProduct={setSelectedProduct} language={language} crops={approvedCrops} t={t} />}
    {view === 'products' && <Products products={approvedCatalogue || []} loading={approvedCatalogue === null} unavailable={catalogueUnavailable} initialQuery={productQuery} onQuery={setProductQuery} openProduct={setSelectedProduct} t={t} />}
    {view === 'tools' && <FarmTools language={language} />}
    {view === 'history' && <HistoryView history={history} openResult={(savedResult) => { setResult(savedResult); nav('inspect'); }} nav={nav} clear={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }} t={t} />}
    <MobileNav view={view} nav={nav} t={t} />
    <PwaInstall label={t.installApp} iosHelp={t.iosInstallHelp} />
    <div className="app-sprayer-footer"><SprayerScene /></div><footer><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><div><b>{t.productOf}</b></div><button onClick={() => nav('home')}>{t.home} ↑</button></footer>
    {selectedProduct && <ProductModal product={selectedProduct} close={() => setSelectedProduct(null)} nav={nav} t={t} />}
    {profileOpen && <ProfileModal profile={profile} save={saveProfile} close={() => setProfileOpen(false)} logout={publicSession.user ? logoutPublicSession : undefined} sessionToken={publicSession.token} publicRole={publicSession.user?.role || null} t={t} fieldIdentity={fieldSession.employee} />}
  </main>;
}

function TopWeatherBar({ location, coordinates, openProfile, t }: { location: string; coordinates: {latitude:number;longitude:number}|null; openProfile: () => void; t: Copy }) {
  const [weather, setWeather] = useState<TopWeatherData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const city = location.trim();
    if (!city && !coordinates) return;
    let active = true;
    const update = async () => {
      try {
        const query = coordinates ? `lat=${coordinates.latitude}&lon=${coordinates.longitude}&display=${encodeURIComponent(city || 'Current field location')}` : `location=${encodeURIComponent(city)}`;
        const response = await fetch(`/api/weather?${query}`);
        const data = await readApiResponse<TopWeatherData>(response);
        if (!response.ok) throw new Error(data.error || 'Weather unavailable');
        if (active) { setWeather(data); setFailed(false); }
      } catch { if (active) setFailed(true); }
    };
    void update();
    const timer = window.setInterval(update, 15 * 60 * 1000);
    return () => { active = false; window.clearInterval(timer); };
  }, [location, coordinates]);

  if (!location.trim()) return <button className="top-weather-bar weather-setup" type="button" onClick={openProfile}><span>☀</span><b>{t.addCityWeather}</b><small>{t.addCityWeatherHelp}</small><i>＋</i></button>;
  const alert = weather ? weather.current.precipitation > 0 || weather.nextSix.rainChance >= 55 || weather.nextSix.rainMm >= 2
    ? t.topWeatherRain
    : weather.current.wind_speed_10m >= 15 || weather.nextSix.maxWind >= 18 || weather.nextSix.maxGust >= 28
      ? t.topWeatherWind
      : weather.current.temperature_2m >= 35 ? t.topWeatherHeat : t.topWeatherGood : failed ? t.topWeatherUnavailable : t.topWeatherLoading;
  return <section className={`top-weather-bar ${failed ? 'weather-failed' : ''}`} aria-live="polite"><span className="weather-symbol">{weather?.current.weather_code && weather.current.weather_code >= 51 ? '☂' : '☀'}</span><div><b>{weather?.location || location}</b><p>{alert}</p></div><strong>{weather ? `${Math.round(weather.current.temperature_2m)}°C` : '—°C'}</strong><button type="button" onClick={openProfile}>{t.changeCity}</button></section>;
}

function Header({ view, nav, profile, onProfile, language, changeLanguage, theme, toggleTheme, t }: { view: View; nav: (view: View) => void; profile: Profile; onProfile: () => void; language: LanguageCode; changeLanguage: (language: LanguageCode) => void; theme: Theme; toggleTheme: () => void; t: Copy }) {
  return <header className="topbar"><button className="brand plain" onClick={() => nav('home')}><img src="/clsl-logo.png" alt="CLSL" /><span><strong>CLSL AI</strong><small>{t.productTag}</small></span></button><nav className="topnav" aria-label="Main navigation"><NavButton label={t.navInspect} target="inspect" view={view} nav={nav} /><NavButton label={t.navAssistant} target="assistant" view={view} nav={nav} /><NavButton label={t.navProducts} target="products" view={view} nav={nav} /><NavButton label={t.navTools} target="tools" view={view} nav={nav} /><NavButton label={t.navHistory} target="history" view={view} nav={nav} /></nav><label className="language-picker"><span>文</span><select aria-label={t.language} value={language} onChange={(event) => changeLanguage(event.target.value as LanguageCode)}>{languages.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={theme === 'dark' ? t.lightMode : t.darkMode} title={theme === 'dark' ? t.lightMode : t.darkMode}><span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span><small>{theme === 'dark' ? t.lightMode : t.darkMode}</small></button><button className="contact-button" type="button" onClick={onProfile} aria-label={t.contactSales}><span aria-hidden="true">☎</span><small>{t.contactSales}</small></button><button className="profile-button" onClick={onProfile} aria-label={t.profile}>{initials(profile.name)}</button></header>;
}
function NavButton({ label, target, view, nav }: { label: string; target: View; view: View; nav: (view: View) => void }) { return <button className={view === target ? 'active' : ''} onClick={() => nav(target)}>{label}</button>; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F'; }

function HomeView({ nav, t, language, location, coordinates, mascotPreparing, takePhoto, uploadPhotos }: { nav: (view: View) => void; t: Copy; language: LanguageCode; location: string; coordinates:{latitude:number;longitude:number}|null; mascotPreparing: boolean; takePhoto: () => void; uploadPhotos: () => void }) {
  return <><section className="home-brief"><div className="home-brief-copy"><div className="home-brief-brand"><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><span><small>{t.developed}</small><b>Crop Life Science Limited</b></span></div><p className="eyebrow"><span /> CLSL AI</p><h1>{t.heroTitle}<em>{t.heroAccent}</em></h1><p className="home-brief-intro">{t.homeHeroBrief}</p><div className="home-brief-actions"><button type="button" onClick={() => nav('inspect')}>⌾ {t.inspectTitle}</button><button type="button" className="secondary" onClick={() => nav('assistant')}>✦ {t.askMitra}</button></div><div className="home-proof"><span>{t.photoHelp}</span><i /> <span>{t.cropGuidance}</span><i /> <span>{t.fieldSupport}</span></div></div><MascotGuide t={t} preparing={mascotPreparing} takePhoto={takePhoto} uploadPhotos={uploadPhotos} ask={() => nav('assistant')} /></section>
    <section className="quick-section home-quick-section"><div className="section-label"><span>{t.startHere}</span><p>{t.appTagline}</p></div><div className="quick-grid"><Quick featured icon="⌁" label={t.geminiPowered} title={t.inspectTitle} text={t.inspectCardText} onClick={() => nav('inspect')} /><Quick icon="✦" label="CLSL AI" title={t.assistantTitle} text={t.assistantCardText} onClick={() => nav('assistant')} /><Quick icon="◫" label="CLSL" title={t.marketplace} text={t.marketCardText} onClick={() => nav('products')} /><Quick icon="⚖" label={t.fieldTools} title={t.navTools} text={t.calculatorCardText} onClick={() => nav('tools')} /></div></section>
    <WeatherAdvisory language={language} initialLocation={location} initialCoordinates={coordinates} /></>;
}
function MascotGuide({ t, preparing, takePhoto, uploadPhotos, ask }: { t: Copy; preparing: boolean; takePhoto: () => void; uploadPhotos: () => void; ask: () => void }) {
  return <aside className="mitra-brief-card" aria-labelledby="mascot-greeting"><div className="mitra-brief-image"><img src="/crop-life-mitra-tomato-doctor.jpg" alt={`${t.mascotName}, CLSL AI assistant`} /><span><b>{t.mascotName}</b><small>● {t.online}</small></span></div><div className="mitra-brief-copy"><p className="eyebrow"><span /> CLSL AI</p><h2 id="mascot-greeting">{t.mascotGreeting}</h2><p>{t.mascotPhotoPrompt}</p><div className="mitra-brief-actions"><button type="button" onClick={takePhoto} disabled={preparing}><span aria-hidden="true">⌾</span>{preparing ? t.mascotPreparing : t.mascotTakePhoto}</button><button type="button" className="secondary" onClick={uploadPhotos} disabled={preparing}><span aria-hidden="true">↑</span>{t.mascotUpload}</button></div><button type="button" className="mitra-chat-link" onClick={ask}>✦ {t.askMitra}<span>→</span></button></div></aside>;
}
function Quick(props: { featured?: boolean; icon: string; label: string; title: string; text: string; onClick: () => void }) { return <button onClick={props.onClick} className={`quick-card ${props.featured ? 'featured' : ''}`}><span className="quick-icon">{props.icon}</span><div><small>{props.label}</small><h3>{props.title}</h3><p>{props.text}</p></div><b>→</b></button>; }
function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div className="page-title"><p className="eyebrow"><span />{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>; }

const fieldPhotoRoles = (t: Copy) => [
  { title: t.fieldWholeCrop, help: t.fieldWholeCropHelp },
  { title: t.fieldAffectedPart, help: t.fieldAffectedPartHelp },
  { title: t.fieldCloseup, help: t.fieldCloseupHelp },
  { title: t.fieldAnotherPhoto, help: t.fieldAnotherPhotoHelp },
];

function PhotoPreview({ file, index, remove, compact = false }: { file: File; index: number; remove: () => void; compact?: boolean }) {
  const source = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(source), [source]);
  return <figure className={`photo-preview ${compact ? 'compact' : ''}`}><img src={source} alt={`Uploaded crop photo ${index + 1}`} /><figcaption>{index + 1}</figcaption><button type="button" aria-label={`Remove uploaded crop photo ${index + 1}`} onClick={remove}>×</button></figure>;
}

function InspectionForm({ inputRef, files, crops, setFiles, onAnalyse, loading, analysisProgress, error, t, fieldIdentity, initialCoordinates }: { inputRef: RefObject<HTMLInputElement | null>; files: File[]; crops: string[]; setFiles: (files: File[]) => void; onAnalyse: (form: HTMLFormElement) => Promise<void>; loading: boolean; analysisProgress: number; error: string; t: Copy; fieldIdentity: FieldIdentity | null; initialCoordinates: { latitude: number; longitude: number } | null }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [qualityMessage, setQualityMessage] = useState('');
  const [crop, setCrop] = useState('');
  const [lat, setLat] = useState(initialCoordinates ? String(initialCoordinates.latitude) : '');
  const [lng, setLng] = useState(initialCoordinates ? String(initialCoordinates.longitude) : '');
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    if (!initialCoordinates) return;
    setLat(String(initialCoordinates.latitude));
    setLng(String(initialCoordinates.longitude));
    setLocationError('');
  }, [initialCoordinates]);

  const salesMode = fieldIdentity?.collection_mode === 'sales_officer';
  const minimumImages = salesMode ? 4 : 1;
  const cropOptions = Array.from(new Set(crops.filter((item) => item && item.toLowerCase() !== 'other'))).sort((left, right) => left.localeCompare(right));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!lat || !lng) {
      setLocationError(t.inspectionLocationRequired);
      return;
    }
    if (!crop.trim()) {
      setQualityMessage(t.cropRequired);
      return;
    }
    void onAnalyse(event.currentTarget);
  };
  const requestLocation = () => {
    setLocationError('');
    if (!navigator.geolocation) { setLocationError(t.inspectionLocationUnsupported); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setLat(String(position.coords.latitude)); setLng(String(position.coords.longitude)); setLocating(false); },
      () => { setLocationError(t.inspectionLocationDenied); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 },
    );
  };
  const chooseFiles = async (selected: File[]) => {
    const available = selected.slice(0, Math.max(0, 5 - files.length));
    if (!available.length) return;
    setPreparing(true); setQualityMessage('');
    try {
      const prepared = await Promise.all(available.map(optimiseImage));
      setFiles([...files, ...prepared]);
      setQualityMessage(t.fieldPhotosAccepted);
    } catch { setQualityMessage(t.fieldPhotoPrepareError); }
    finally { setPreparing(false); }
  };
  const stage = analysisProgress < 28 ? t.stageIdentify : analysisProgress < 56 ? t.stageClassify : analysisProgress < 82 ? t.stageMatch : t.stageFinal;
  const inputChange = (event: ChangeEvent<HTMLInputElement>) => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void chooseFiles(selected); };
  const roles = fieldPhotoRoles(t);
  return <form onSubmit={submit}><section className={`inspection-location-gate ${lat && lng ? 'ready' : ''}`}><span>{lat && lng ? '✓' : '⌖'}</span><div><b>{lat && lng ? t.inspectionLocationReady : t.inspectionLocationTitle}</b><p>{lat && lng ? t.inspectionLocationReadyHelp : t.inspectionLocationHelp}</p></div>{!lat && <button type="button" onClick={requestLocation} disabled={locating}>{locating ? t.inspectionLocating : t.inspectionAllowLocation}</button>}</section>{locationError && <p className="form-error">{locationError}</p>}<div className="card-heading"><span className="step-badge">01</span><div><h2>{salesMode ? t.fieldCompleteFour : t.addPhotos}</h2><p>{salesMode ? `${fieldIdentity?.full_name} · ${files.length}/4 ${t.fieldPhotosAdded}` : t.upToFive}</p></div></div>{salesMode && <section className="field-photo-contract"><header><div><small>{t.fieldStructuredCollection}</small><b>{t.fieldFourPhotoRequest}</b></div><span className={files.length >= 4 ? 'complete' : ''}>{Math.min(files.length, 4)}/4</span></header><div className="field-photo-slots">{roles.map((role, index) => <article key={role.title} className={files[index] ? 'filled' : ''}><i>{files[index] ? '✓' : index + 1}</i>{files[index] && <PhotoPreview file={files[index]} index={index} compact remove={() => setFiles(files.filter((_, item) => item !== index))} />}<div><b>{role.title}</b><small>{files[index]?.name || role.help}</small></div>{files[index] && <button type="button" aria-label={`${t.fieldRemovePhoto} ${index + 1}`} onClick={() => setFiles(files.filter((_, item) => item !== index))}>×</button>}</article>)}</div><p>{t.fieldDailyTarget}</p></section>}<div className={`upload-zone ${files.length ? 'has-files' : ''}`}><input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={inputChange} /><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={inputChange} /><span className="upload-icon">⌾</span><strong>{preparing ? t.preparing : files.length ? `${files.length} ${t.ready}` : t.upload}</strong><small>{preparing ? t.faster : salesMode ? `${t.fieldNextPhoto}: ${roles[Math.min(files.length, 3)].title}` : files.length ? t.photoPreviewReady : t.photoSourceHelp}</small><div className="photo-source-actions"><button type="button" onClick={() => cameraRef.current?.click()} disabled={preparing || loading || files.length >= 5}><span aria-hidden="true">⌾</span>{t.takeNewPhoto}</button><button type="button" className="gallery" onClick={() => inputRef.current?.click()} disabled={preparing || loading || files.length >= 5}><span aria-hidden="true">▧</span>{t.chooseGallery}</button></div></div>{qualityMessage && <p className="photo-quality-message passed">{qualityMessage}</p>}{files.length > 0 && <div className="photo-preview-grid" aria-label={t.photoPreviewReady}>{files.map((file, index) => <PhotoPreview key={`${file.name}-${index}`} file={file} index={index} remove={() => setFiles(files.filter((_, item) => item !== index))} />)}</div>}<div className="form-row"><label className="crop-picker full-width"><span>{t.crop} <b aria-label={t.cropRequired}>*</b></span><input name="crop" list="clsl-crop-options" value={crop} onChange={(event) => setCrop(event.target.value)} placeholder={t.cropSearchPlaceholder} required autoComplete="off" /><datalist id="clsl-crop-options">{cropOptions.map((item) => <option key={item} value={item} />)}<option value="Other">{t.otherCrop}</option></datalist><small>{t.cropRequired}</small></label>{lat && lng && <><input type="hidden" name="latitude" value={lat} /><input type="hidden" name="longitude" value={lng} /><input type="hidden" name="location" value={`${lat},${lng}`} /></>}</div><label className="full-field"><span>{t.notice} <small>{t.optional}</small></span><textarea name="description" placeholder={t.noticePlaceholder} /></label>{error && <p className="form-error">{error}</p>}{loading && <div className="analysis-progress" role="status" aria-live="polite"><div><span>{t.detailedAnalysis}</span><b>{analysisProgress}%</b></div><div className="analysis-track"><i style={{ width: `${analysisProgress}%` }} /></div><div className="analysis-mascot"><img src="/crop-life-mitra-tomato-doctor.jpg" alt="" /><p><b>{t.mascotAnalysing}</b><span>{stage}</span></p></div></div>}<button className="primary-button" disabled={files.length < minimumImages || loading || preparing || !crop.trim() || !lat || !lng}>{loading ? `${t.analysing} ${analysisProgress}%` : preparing ? t.preparing : salesMode && files.length < 4 ? t.fieldFourRequired : !lat || !lng ? t.inspectionLocationRequired : t.analyse} <span>{loading || preparing ? '◌' : '→'}</span></button><p className="safety-note">{salesMode ? `${t.fieldAnyPhotoAccepted} ` : ''}{t.safety}</p></form>;
}
function Tips({ t }: { t: Copy }) { return <aside className="tips"><h3>{t.tips}</h3><ol><li><b>{t.wholePlant}</b><span>{t.wholePlantHelp}</span></li><li><b>{t.affectedArea}</b><span>{t.affectedHelp}</span></li><li><b>{t.underside}</b><span>{t.undersideHelp}</span></li></ol><div className="privacy-box"><b>{t.cropData}</b><p>{t.privacy}</p></div></aside>; }

function Result({ result, profile, onClose, openProfile, openProducts, openProduct, nav, t }: { result: Diagnosis; profile: Profile; onClose: () => void; openProfile: () => void; openProducts: (query: string) => void; openProduct: (product: CatalogProduct) => void; nav: (view: View) => void; t: Copy }) {
  const confidence = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
  const groups = Object.entries((result.recommendations || []).reduce<Record<string, CatalogProduct[]>>((all, product) => {
    (all[product.category] ||= []).push(product); return all;
  }, {}));
  const list = (title: string, items?: string[]) => items?.length ? <section className="diagnosis-list"><h4>{title}</h4><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section> : null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Crop assessment"><div className="result-modal result-wide">
    <button className="modal-close" onClick={onClose}>×</button><p className="eyebrow"><span /> {t.probableAssessment}</p><div className="mascot-result-note"><img src="/crop-life-mitra-tomato-doctor.jpg" alt="" /><div><b>{t.mascotName}</b><p>{t.mascotReady}</p></div></div>{(result.storage_status === 'partial_failure' || result.storage_status === 'failed') && <p className="persistence-warning" role="status">{t.imageArchiveWarning}</p>}{result.persistence_status === 'failed' && <p className="persistence-warning" role="status">{t.inspectionRecordWarning}</p>}
    <div className="result-head"><div><small>{t.identified}</small><h2>{result.crop || '—'}</h2></div><span className="confidence"><b>{confidence}%</b> {t.confidence}</span></div>
    <div className="result-facts"><span><small>{t.condition}</small><b>{result.plant_condition || '—'}</b></span><span><small>{t.visibleStage}</small><b>{result.problem_stage || '—'}</b></span><span><small>{t.problemType}</small><b>{(result.issue_type || '—').replaceAll('_', ' ')}</b></span></div>
    <div className="issue-box"><small>{result.additional_information_required ? t.moreInfo : `${t.probable} ${result.issue_type?.replaceAll('_', ' ') || ''}`}</small><h3>{result.likely_issue || '—'}</h3><p>{result.summary}</p></div>
    <section className="diagnosis-section"><h3>{t.happening}</h3><div className="symptoms"><b>{t.visibleSigns}</b>{(result.observed_symptoms || []).map((symptom) => <span key={symptom}>{symptom}</span>)}</div><div className="diagnosis-columns">{list(t.causes, result.probable_causes)}{list(t.alternatives, result.alternative_possibilities)}</div></section>
    <div className="next-action"><b>{t.nextStep}</b><p>{result.recommended_next_action}</p></div>
    <div className="diagnosis-columns action-lists">{list(t.doNow, result.immediate_actions)}{list(t.prevention, result.prevention_tips)}</div>
    {result.additional_information_required && list(t.improve, result.questions_for_farmer)}
    <section className="matched-products"><div><small>{t.catalogMatch}</small><h3>{groups.length ? `${groups.length} ${t.applicableCategory} · ${result.recommendations.length} ${t.navProducts}` : t.noVerified}</h3><p>{groups.length ? t.productSupportText : t.noMatch}</p></div>
      {groups.length ? <div className="category-matches">{groups.map(([category, products]) => <section key={category}><header><div><small>{products.some((product) => product.matchScore && product.matchScore >= 20) ? t.strongCategory : t.applicableCategory}</small><h4>{category}</h4><p>{categoryPurpose[category] || t.catalogCategoryReason}</p></div><b>{products.length}</b></header><div className="mini-products">{products.map((product, index) => <button key={product.id} onClick={() => openProduct(product)}>{product.image ? <img src={product.image} alt="" /> : <span className="mini-fallback">CLSL</span>}<span><b>{product.name}{index === 0 && <mark>{t.topMatch}</mark>}</b><small>{product.commonName}</small><em>{product.matchReason}</em></span><i>{t.view} →</i></button>)}</div></section>)}</div> : <p className="no-match">{t.noMatch}</p>}
    </section>
    <ResultSalesSupport result={result} profile={profile} openProfile={openProfile} t={t} />
    <div className="result-actions"><button onClick={() => openProducts(result.catalog_crop || result.crop || '')}>{t.viewCropProducts}</button><button className="secondary" onClick={() => nav('assistant')}>{t.followUp}</button></div><p className="demo-disclaimer">{t.resultDisclaimer}</p>
  </div></div>;
}

function ContactButtons({ contact, message, t }: { contact: SalesContact; message: string; t: Copy }) {
  const whatsapp = whatsappUrl(contact, message);
  return <div className="contact-actions">{contact.phone && <a href={`tel:${contact.phone}`} aria-label={`${t.callNow} ${contact.name}`}>☎ {t.callNow}</a>}{contact.email && <a href={`mailto:${contact.email}?subject=${encodeURIComponent('CLSL AI crop support')}`} aria-label={`${t.emailNow} ${contact.name}`}>✉ {t.emailNow}</a>}{whatsapp && <a className="whatsapp" href={whatsapp} target="_blank" rel="noreferrer" aria-label={`${t.whatsappNow} ${contact.name}`}>◉ {t.whatsappNow}</a>}</div>;
}

function ResultSalesSupport({ result, profile, openProfile, t }: { result: Diagnosis; profile: Profile; openProfile: () => void; t: Copy }) {
  const contacts = contactsForProfile(profile);
  const message = `${t.whatsappGreeting} ${result.crop || result.catalog_crop || 'crop'} — ${result.likely_issue || result.summary}. ${t.whatsappHelp}`;
  return <section className="result-sales-support"><div className="result-sales-mitra"><img src="/crop-life-mitra-tomato-doctor.jpg" alt="" /><div><small>{t.mascotName}</small><h3>{t.mitraFoundSupport}</h3><p>{contacts.length ? t.mitraContactReady : t.mitraAddArea}</p></div><span className="talking-dots" aria-hidden="true"><i /><i /><i /></span></div>{contacts.length ? <div className="result-contact-list">{contacts.map((contact) => <article key={`${contact.email}-${contact.territory}`}><span className="contact-avatar">{initials(contact.name)}</span><div><small>{t.localSalesPerson}</small><b>{contact.name}</b><p>{contact.designation} · {contact.city || contact.territory}</p></div><ContactButtons contact={contact} message={message} t={t} /></article>)}</div> : <button className="set-area-button" type="button" onClick={openProfile}>⌖ {t.addAreaForContact}</button>}<p className="directory-privacy">✓ {t.directoryPrivacy}</p></section>;
}

function Assistant({ openProduct, language, crops, t }: { openProduct: (product: CatalogProduct) => void; language: LanguageCode; crops: string[]; t: Copy }) {
  const [input, setInput] = useState('');
  const [chatCrop, setChatCrop] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const prompts = [t.assistantCropPromptOne, t.assistantCropPromptTwo, t.assistantCompanyPromptOne, t.assistantSalesPrompt];
  const cropOptions = Array.from(new Set(crops.filter((item) => item && item.toLowerCase() !== 'other'))).sort((left, right) => left.localeCompare(right));
  
  const send = async (preset?: string) => {
    const question = (preset ?? input).trim(); if (!question || loading) return;
    const finalQuestion = chatCrop ? `[Crop: ${chatCrop}] ${question}` : question;
    const next = [...messages, { role: 'user' as const, content: finalQuestion }]; setMessages(next); setInput(''); setLoading(true); setError('');
    try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: finalQuestion, history: messages, language }) }); const data = await readApiResponse<{ answer?: string; products?: CatalogProduct[]; contacts?: SalesContact[] }>(response); if (!response.ok) throw new Error(data.error || 'Unable to answer.'); if (!data.answer?.trim()) throw new Error(t.assistantFormatError); setMessages([...next, { role: 'assistant', content: data.answer, products: data.products, contacts: data.contacts }]); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to answer.'); }
    finally { setLoading(false); }
  };
  return <section className="workspace"><PageTitle eyebrow="CLSL AI" title={t.askWords} text={t.assistantIntro} /><div className="chat-shell unified-chat"><div className="chat-head"><img className="assistant-mascot" src="/crop-life-mitra-tomato-doctor.jpg" alt="" /><div><b>{t.mascotName}</b><small>CLSL AI</small></div><span className="online">{t.online}</span></div><div className="chat-body"><div className="ai-message">{t.assistantUnifiedGreeting}</div><div className="suggestions">{prompts.map((prompt) => <button type="button" key={prompt} onClick={() => void send(prompt)} disabled={loading}>{prompt}</button>)}</div>{messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'user-message' : 'ai-message'}><p>{message.content}</p>{message.products && message.products.length > 0 && <div className="chat-products">{message.products.map((product) => <button key={product.id} onClick={() => openProduct(product)}>{product.image && <img src={product.image} alt="" />}<span><b>{product.name}</b><small>{product.commonName}</small></span></button>)}</div>}{message.contacts && message.contacts.length > 0 && <div className="chat-contacts">{message.contacts.map((contact) => <article key={`${contact.email}-${contact.territory}`}><span className="contact-avatar">{initials(contact.name)}</span><div><small>{t.officialContact}</small><b>{contact.name}</b><p>{contact.designation} · {contact.city || contact.territory}</p></div><ContactButtons contact={contact} message={`${t.whatsappGreeting} ${contact.city || contact.territory}. ${t.whatsappHelp}`} t={t} /></article>)}</div>}</div>)}{loading && <div className="ai-message typing">{t.checking}<span>•••</span></div>}{error && <p className="chat-error">{error}</p>}</div>
  <div className="chat-input chat-input-with-crop"><input list="chat-crops" className="chat-crop-select" placeholder={t.crop} value={chatCrop} onChange={(e) => setChatCrop(e.target.value)} /><datalist id="chat-crops">{cropOptions.map((item) => <option key={item} value={item} />)}</datalist>
  <input className="chat-main-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void send()} placeholder={t.askPlaceholder} /><button className="send" onClick={() => void send()} disabled={!input.trim() || loading}>↑</button></div></div></section>;
}
function Products({ products, loading, unavailable, initialQuery, onQuery, openProduct, t }: { products: CatalogProduct[]; loading: boolean; unavailable: boolean; initialQuery: string; onQuery: (query: string) => void; openProduct: (product: CatalogProduct) => void; t: Copy }) {
  const [category, setCategory] = useState('All products');
  const [crop, setCrop] = useState('');
  const [visible, setVisible] = useState(18);
  const categories = useMemo(() => ['All products', ...Array.from(new Set(products.map((product) => product.category)))], [products]);
  const crops = useMemo(() => Array.from(new Set(products.flatMap((product) => product.approvedCrops || []))).sort((a, b) => a.localeCompare(b)), [products]);
  const matches = useMemo(() => searchCatalogProducts(products, initialQuery, 1000, category).map((match) => match.product).filter((product) => !crop || productSupportsCrop(product, crop)), [products, initialQuery, category, crop]);
  const changeQuery = (query: string) => { setVisible(18); onQuery(query); };
  const changeCategory = (next: string) => { setVisible(18); setCategory(next); };
  const changeCrop = (next: string) => { setVisible(18); setCrop(next); };
  return <section className="marketplace"><div className="market-hero"><div><p className="eyebrow"><span /> CLSL</p><h1>{t.marketHeading}</h1><p>{t.marketIntro}</p></div><div className="catalog-stat"><b>{loading ? '…' : products.length}</b><span>{t.navProducts}</span><small>{t.cropGuidance}</small></div></div>{unavailable ? <div className="empty-state"><span>!</span><h3>{t.productsUnavailable}</h3><p>{t.productsUnavailableHelp}</p></div> : <><div className="market-toolbar"><label className="market-search"><span>⌕</span><input value={initialQuery} onChange={(event) => changeQuery(event.target.value)} placeholder={t.searchPlaceholder} disabled={loading} />{initialQuery && <button onClick={() => changeQuery('')}>×</button>}</label><select value={category} onChange={(event) => changeCategory(event.target.value)} disabled={loading}>{categories.map((item) => <option key={item}>{item}</option>)}</select><select value={crop} aria-label={t.crop} onChange={(event) => changeCrop(event.target.value)} disabled={loading}><option value="">{t.crop}</option>{crops.map((item) => <option key={item}>{item}</option>)}</select></div><div className="category-chips">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => changeCategory(item)} disabled={loading}>{item}<span>{item === 'All products' ? products.length : products.filter((product) => product.category === item).length}</span></button>)}</div>{loading ? <div className="empty-state"><span>◌</span><h3>{t.loadingProducts}</h3><p>{t.loadingProductsHelp}</p></div> : <><div className="result-count"><b>{matches.length}</b> {t.found}{crop && <small> · {crop}</small>}</div>{matches.length ? <div className="catalog-grid">{matches.slice(0, visible).map((product) => <ProductCard key={product.id} product={product} open={() => openProduct(product)} t={t} />)}</div> : <div className="empty-state"><span>⌕</span><h3>{t.noCatalogMatch}</h3><p>{t.trySearch}</p><button onClick={() => { changeQuery(''); changeCategory('All products'); changeCrop(''); }}>{t.showAll}</button></div>}{visible < matches.length && <button className="load-more" onClick={() => setVisible((count) => count + 18)}>{t.loadMore} <span>{visible} / {matches.length}</span></button>}</>}</>}</section>;
}
function ProductCard({ product, open, t }: { product: CatalogProduct; open: () => void; t: Copy }) { return <article className="catalog-card"><button className="product-image" onClick={open}>{product.image ? <img src={product.image} alt={`${product.name} pack`} /> : <div className="image-fallback"><img src="/clsl-logo.png" alt="" /><span>CLSL</span></div>}<span className="category-tag">{product.category}</span></button><div className="catalog-card-body"><small>CLSL</small><h2>{product.name}</h2><p>{product.commonName}</p><div className="approved-crop-summary"><b>{t.crop}</b><span>{(product.approvedCrops || []).slice(0, 3).join(' · ')}{(product.approvedCrops || []).length > 3 ? ` +${(product.approvedCrops || []).length - 3}` : ''}</span></div><div className="card-meta"><span><b>{t.dose}</b>{product.dose || '—'}</span><span><b>{t.packing}</b>{product.packing || '—'}</span></div><button onClick={open}>{t.details} <span>→</span></button></div></article>; }

function ProductModal({ product, close, nav, t }: { product: CatalogProduct; close: () => void; nav: (view: View) => void; t: Copy }) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><article className="product-modal"><button className="modal-close" onClick={close}>×</button><div className="product-modal-image">{product.image ? <img src={product.image} alt={`${product.name} pack`} /> : <div className="image-fallback"><img src="/clsl-logo.png" alt="" /><span>CLSL</span></div>}<span>CLSL</span></div><div className="product-modal-copy"><small>{product.category}</small><h2>{product.name}</h2><h3>{product.commonName}</h3>{product.limitedRecord ? <div className="limited-note">CLSL product record</div> : <><dl><div><dt>{t.dose}</dt><dd>{product.dose || '—'}</dd></div><div><dt>{t.packing}</dt><dd>{product.packing || '—'}</dd></div></dl><section className="approved-crops-panel"><h4>{t.crop}</h4><div>{(product.approvedCrops || []).map((crop) => <span key={crop}>{crop}</span>)}</div></section><section><h4>{t.useBenefits}</h4><p>{product.useBenefits}</p></section></>}<div className="label-warning"><b>{t.important}</b><p>{t.safety}</p></div><div className="product-modal-actions"><button onClick={() => { close(); nav('assistant'); }}>{t.askProduct}</button><button className="secondary" onClick={close}>{t.continueBrowsing}</button></div></div></article></div>; }

function HistoryView({ history, openResult, nav, clear, t }: { history: StoredInspection[]; openResult: (result: Diagnosis) => void; nav: (view: View) => void; clear: () => void; t: Copy }) { return <section className="workspace"><PageTitle eyebrow={t.savedDevice} title={t.historyHeading} text={t.historyIntro} />{history.length ? <><div className="history-tools"><span>{history.length}</span><button onClick={clear}>{t.clearHistory}</button></div><div className="history-list">{history.map((item) => <article className="history-item" key={item.id}><div className="history-date">{new Date(item.createdAt).toLocaleDateString()}</div><span className="crop-avatar">⌁</span><div><small>{item.crop}{item.city ? ` · ${item.city}` : ''}</small><h3>{item.issue}</h3><p>{item.summary}</p></div><span className="history-confidence">{Math.round(item.confidence * 100)}%</span><button onClick={() => openResult(item.result)}>{t.open} →</button></article>)}</div></> : <div className="empty-state history-empty"><span>⌁</span><h3>{t.noInspections}</h3><p>{t.historyEmpty}</p><button onClick={() => nav('inspect')}>{t.startInspection}</button></div>}</section>; }

function ProfileModal({ profile, save, close, logout, sessionToken, publicRole, t, fieldIdentity }: { profile: Profile; save: (profile: Profile) => void; close: () => void; logout?: () => Promise<void>; sessionToken:string; publicRole:PublicUser['role']; t: Copy; fieldIdentity: FieldIdentity | null }) {
  const [draft, setDraft] = useState(profile);
  const [referralLink,setReferralLink] = useState('');
  const [referralBusy,setReferralBusy] = useState(false);
  const [referralError,setReferralError] = useState('');
  const states = Array.from(new Set(salesContacts.map((contact) => contact.state))).sort();
  const stateContacts = salesContacts.filter((contact) => !draft.state || contact.state === draft.state);
  const territories = Array.from(new Set(stateContacts.map((contact) => contact.territory))).sort();
  const territoryContacts = stateContacts.filter((contact) => !draft.territory || contact.territory === draft.territory);
  const cities = Array.from(new Set(territoryContacts.map((contact) => contact.city))).sort();
  const matches = contactsForProfile(draft);
  const changeTerritory = (territory: string) => {
    const first = salesContacts.find((contact) => contact.state === draft.state && contact.territory === territory);
    setDraft({ ...draft, territory, city: first?.city || '' });
  };
  const generateReferral = async () => {
    setReferralBusy(true); setReferralError('');
    try {
      const response=await fetch('/api/auth/dealer-referral',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${sessionToken}`},body:'{}'});
      const data=await readApiResponse<{download_url?:string;detail?:string}>(response);
      if(!response.ok||!data.download_url) throw new Error(data.detail||'Unable to create referral link.');
      setReferralLink(data.download_url);
    } catch(problem) { setReferralError(problem instanceof Error?problem.message:'Unable to create referral link.'); }
    finally { setReferralBusy(false); }
  };
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="profile-modal contact-profile" onSubmit={(event) => { event.preventDefault(); save(draft); }}><button type="button" className="modal-close" onClick={close}>×</button><span className="profile-avatar">{initials(draft.name)}</span><h2>{fieldIdentity ? t.fieldOfficerProfile : t.profile}</h2><p>{fieldIdentity ? t.fieldProfileStored : t.profilePrivacy}</p>{fieldIdentity && <section className="field-profile-card"><small>{t.fieldOfficialIdentity}</small><b>{fieldIdentity.full_name} · {fieldIdentity.employee_code}</b><p>{fieldIdentity.designation || t.fieldSalesOfficer} · {fieldIdentity.department || 'CLSL'}</p><dl><div><dt>{t.territory}</dt><dd>{fieldIdentity.territory}, {fieldIdentity.state}</dd></div><div><dt>{t.officialContact}</dt><dd>{fieldIdentity.office_email || fieldIdentity.office_mobile || '—'}</dd></div></dl></section>}<div className="profile-fields"><label>{t.name}<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required readOnly={Boolean(fieldIdentity)} /></label><label>{t.preferredLanguage}<select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as LanguageCode })}>{languages.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>Role<select value={draft.role || 'General User'} onChange={(event) => setDraft({ ...draft, role: event.target.value })}><option>Farmer</option><option>Dealer</option><option>General User</option></select></label>{draft.role === 'Farmer' && <label>Primary Crop<input value={draft.crop || ''} onChange={(event) => setDraft({ ...draft, crop: event.target.value })} /></label>}</div><section className="contact-directory"><div className="contact-title"><span>☎</span><div><small>{t.contactSales}</small><h3>{t.areaContact}</h3><p>{t.contactHelp}</p></div></div><div className="contact-location-grid"><label>{t.state}<select value={draft.state} disabled={Boolean(fieldIdentity)} onChange={(event) => setDraft({ ...draft, state: event.target.value, territory: '', city: '' })}><option value="">{t.chooseState}</option>{states.map((state) => <option key={state}>{state}</option>)}</select></label><label>{t.territory}<select value={draft.territory} disabled={Boolean(fieldIdentity) || !draft.state} onChange={(event) => changeTerritory(event.target.value)}><option value="">{t.chooseTerritory}</option>{territories.map((territory) => <option key={territory}>{territory}</option>)}</select></label><label>{t.city}<select value={draft.city} disabled={Boolean(fieldIdentity) || !draft.territory} onChange={(event) => setDraft({ ...draft, city: event.target.value })}><option value="">{t.chooseCity}</option>{cities.map((city) => <option key={city}>{city}</option>)}</select></label></div>{draft.state && draft.territory ? <div className="contact-results">{matches.map((contact) => <article key={`${contact.email}-${contact.territory}`}><span className="contact-avatar">{initials(contact.name)}</span><div><small>{t.officialContact}</small><b>{contact.name}</b><p>{contact.designation} · {contact.territory}</p></div><ContactButtons contact={contact} message={`${t.whatsappGreeting} ${draft.city || draft.territory}. ${t.whatsappHelp}`} t={t} /></article>)}</div> : <p className="no-area-contact">{t.noAreaContact}</p>}<p className="directory-privacy">✓ {t.directoryPrivacy}</p></section><button className="primary-button">{t.saveProfile}</button>{logout && <section className="profile-session-actions"><div><b>{t.logout}</b><small>{t.logoutHelp}</small></div><button type="button" onClick={() => void logout()}>↪ {t.logout}</button></section>}</form></div>;
}

function MobileNav({ view, nav, t }: { view: View; nav: (view: View) => void; t: Copy }) { return <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => nav('home')}><span>⌂</span>{t.home}</button><button className={view === 'assistant' ? 'active' : ''} onClick={() => nav('assistant')}><span>✦</span>{t.assistant}</button><button className="camera" onClick={() => nav('inspect')} aria-label={t.navInspect}><span>＋</span></button><button className={view === 'tools' ? 'active' : ''} onClick={() => nav('tools')}><span>⚖</span>{t.navTools}</button><button className={view === 'products' ? 'active' : ''} onClick={() => nav('products')}><span>◫</span>{t.navProducts}</button></nav>; }

function DealerReferralBanner({ token }: { token:string }) {
  const [link,setLink]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const generate=async()=>{setBusy(true);setError('');try{const response=await fetch('/api/auth/dealer-referral',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:'{}'});const data=await readApiResponse<{download_url?:string;detail?:string}>(response);if(!response.ok||!data.download_url)throw new Error(data.detail||'Unable to create referral link.');setLink(data.download_url);}catch(problem){setError(problem instanceof Error?problem.message:'Unable to create referral link.');}finally{setBusy(false);}};
  return <section className="dealer-referral-banner"><div><small>CLSL DEALER TOOL</small><b>Invite farmers with your referral code</b><p>Farmers using this link are securely associated with your dealership.</p></div>{link?<div className="dealer-referral-link"><code>{link}</code><button type="button" onClick={()=>void navigator.clipboard.writeText(link)}>Copy link</button></div>:<button type="button" onClick={()=>void generate()} disabled={busy}>{busy?'Creating…':'Generate referral code'}</button>}{error&&<p className="form-error">{error}</p>}</section>;
}
