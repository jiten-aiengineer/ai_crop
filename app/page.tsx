'use client';

import { FormEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { catalog, catalogCrops, CatalogProduct, searchCatalog } from './lib/catalog';
import { getCopy, getLanguage, LanguageCode, languages } from './lib/i18n';
import { FarmTools } from './components/FarmTools';
import { WeatherAdvisory } from './components/WeatherAdvisory';

type View = 'home' | 'inspect' | 'assistant' | 'products' | 'tools' | 'history';
type Diagnosis = {
  crop: string; crop_confidence: number; issue_detected: boolean; issue_type: string; likely_issue: string;
  confidence: number; observed_symptoms: string[]; alternative_possibilities: string[];
  catalog_crop: string; plant_condition: string; problem_stage: string; probable_causes: string[];
  immediate_actions: string[]; prevention_tips: string[]; questions_for_farmer: string[];
  additional_information_required: boolean; recommended_next_action: string; summary: string;
  recommendations: CatalogProduct[];
};
type ChatMessage = { role: 'user' | 'assistant'; content: string; products?: CatalogProduct[] };
type StoredInspection = { id: string; createdAt: string; crop: string; issue: string; confidence: number; summary: string; result: Diagnosis };
type Profile = { name: string; location: string; language: LanguageCode };
type Copy = Record<string, string>;

const categories = ['All products', ...Array.from(new Set(catalog.map((product) => product.category)))];
const categoryPurpose: Record<string, string> = {
  'Insecticides': 'Products whose catalogue use aligns with insect-pest management',
  'Fungicides': 'Products whose catalogue use aligns with fungal-disease management',
  'Antibiotic / Bactericide': 'Products whose catalogue use aligns with bacterial-disease management',
  'Weedicides': 'Products whose catalogue use aligns with weed management',
  'Micro Fertilizers': 'Catalogue nutrition options when the visible issue points to deficiency',
  'Bio Stimulant': 'Catalogue plant-support options when the issue points to growth stress',
  'Plant Growth Regulator': 'Catalogue growth-management options for the identified crop',
  'Seed Treatment': 'Catalogue options intended for seed-borne or germination-stage problems',
};
const HISTORY_KEY = 'crop-life-ai-inspections-v1';
const PROFILE_KEY = 'crop-life-ai-profile-v1';
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

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
    if (longestSide <= 1024 && file.size <= 550 * 1024) return file;
    const scale = Math.min(1, 1024 / longestSide);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .68));
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

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [view, setView] = useState<View>('home');
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisSeconds, setAnalysisSeconds] = useState(0);
  const [error, setError] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [history, setHistory] = useState<StoredInspection[]>([]);
  const [profile, setProfile] = useState<Profile>({ name: 'Farmer', location: '', language: 'en' });
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const storedHistory = localStorage.getItem(HISTORY_KEY);
        const storedProfile = localStorage.getItem(PROFILE_KEY);
        if (storedHistory) setHistory(JSON.parse(storedHistory));
        if (storedProfile) { const saved = JSON.parse(storedProfile); setProfile({ ...saved, language: getLanguage(saved.language) }); }
      } catch { /* device storage may be unavailable */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const started = Date.now();
    const timer = window.setInterval(() => setAnalysisSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [loading]);

  const nav = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const language = getLanguage(profile.language);
  const t = getCopy(language);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const openProducts = (query = '') => { setProductQuery(query); nav('products'); };
  const saveProfile = (next: Profile) => { setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); setProfileOpen(false); };
  const changeLanguage = (next: LanguageCode) => { const updated = { ...profile, language: next }; setProfile(updated); localStorage.setItem(PROFILE_KEY, JSON.stringify(updated)); document.documentElement.lang = next; };
  const analyse = async (form: HTMLFormElement) => {
    const uploadBytes = files.reduce((total, file) => total + file.size, 0);
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      setError(language === 'en' ? 'These photos are too large together. Please select fewer photos or use JPG images.' : t.safety);
      return;
    }
    setAnalysisSeconds(0); setLoading(true); setError('');
    const body = new FormData(form); body.set('language', language); files.forEach((file) => body.append('images', file));
    try {
      const response = await fetch('/api/inspect', { method: 'POST', body });
      const data = await readApiResponse<Diagnosis>(response);
      if (!response.ok) throw new Error(data.error || 'Unable to analyse these images.');
      setResult(data);
      const record: StoredInspection = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), crop: data.crop || 'Unknown crop', issue: data.likely_issue || 'No clear issue', confidence: data.confidence, summary: data.summary, result: data };
      setHistory((previous) => { const next = [record, ...previous].slice(0, 50); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); return next; });
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to analyse these images.'); }
    finally { setLoading(false); setAnalysisSeconds(0); }
  };

  return <main className="app-shell">
    <Header view={view} nav={nav} profile={profile} onProfile={() => setProfileOpen(true)} language={language} changeLanguage={changeLanguage} t={t} />
    {view === 'home' && <HomeView nav={nav} t={t} language={language} location={profile.location} />}
    {view === 'inspect' && <section className="workspace"><PageTitle eyebrow={t.doctor} title={t.inspectHeading} text={t.inspectIntro} /><div className="inspection-layout"><div className="inspect-card large"><InspectionForm inputRef={inputRef} files={files} setFiles={setFiles} onAnalyse={analyse} loading={loading} analysisSeconds={analysisSeconds} error={error} t={t} /></div><Tips t={t} /></div>{result && <Result result={result} onClose={() => setResult(null)} openProducts={openProducts} openProduct={setSelectedProduct} nav={nav} t={t} />}</section>}
    {view === 'assistant' && <Assistant openProduct={setSelectedProduct} language={language} t={t} />}
    {view === 'products' && <Products initialQuery={productQuery} onQuery={setProductQuery} openProduct={setSelectedProduct} t={t} />}
    {view === 'tools' && <FarmTools language={language} />}
    {view === 'history' && <HistoryView history={history} openResult={setResult} nav={nav} clear={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }} t={t} />}
    <MobileNav view={view} nav={nav} t={t} />
    <footer><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><div><b>{t.productOf}</b><p>{t.catalogProducts} · {t.catalogOnly}</p></div><button onClick={() => nav('home')}>{t.home} ↑</button></footer>
    {selectedProduct && <ProductModal product={selectedProduct} close={() => setSelectedProduct(null)} nav={nav} t={t} />}
    {profileOpen && <ProfileModal profile={profile} save={saveProfile} close={() => setProfileOpen(false)} t={t} />}
  </main>;
}

function Header({ view, nav, profile, onProfile, language, changeLanguage, t }: { view: View; nav: (view: View) => void; profile: Profile; onProfile: () => void; language: LanguageCode; changeLanguage: (language: LanguageCode) => void; t: Copy }) {
  return <header className="topbar"><button className="brand plain" onClick={() => nav('home')}><img src="/clsl-logo.png" alt="CLSL" /><span><strong>Crop Life AI</strong><small>{t.productTag}</small></span></button><nav className="topnav" aria-label="Main navigation"><NavButton label={t.navInspect} target="inspect" view={view} nav={nav} /><NavButton label={t.navAssistant} target="assistant" view={view} nav={nav} /><NavButton label={t.navProducts} target="products" view={view} nav={nav} /><NavButton label={t.navTools} target="tools" view={view} nav={nav} /><NavButton label={t.navHistory} target="history" view={view} nav={nav} /></nav><label className="language-picker"><span>文</span><select aria-label={t.language} value={language} onChange={(event) => changeLanguage(event.target.value as LanguageCode)}>{languages.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><button className="profile-button" onClick={onProfile} aria-label={t.profile}>{initials(profile.name)}</button></header>;
}
function NavButton({ label, target, view, nav }: { label: string; target: View; view: View; nav: (view: View) => void }) { return <button className={view === target ? 'active' : ''} onClick={() => nav(target)}>{label}</button>; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F'; }

function HomeView({ nav, t, language, location }: { nav: (view: View) => void; t: Copy; language: LanguageCode; location: string }) {
  return <><section className="hero"><div className="hero-copy"><div className="endorsed"><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><span>{t.developed}<br /><b>Crop Life Science Limited</b></span></div><p className="eyebrow"><span /> {t.companion}</p><h1>{t.heroTitle}<br /><em>{t.heroAccent}</em></h1><p>{t.heroText}</p><div className="trust-row"><span>✓ {t.imageAssessment}</span><span>✓ {t.catalogProducts}</span><span>✓ {t.catalogOnly}</span></div></div><div className="home-panel"><span className="leaf-shape">⌁</span><small>{t.care}</small><h2>{t.unusual}</h2><p>{t.flow}</p><button type="button" onClick={() => nav('inspect')}>{t.takePictures} <span>→</span></button><div className="panel-stats"><span><b>5</b> {t.photosSupported}</span><span><b>73</b> CLSL {t.navProducts}</span></div></div></section>
    <WeatherAdvisory language={language} initialLocation={location} />
    <section className="quick-section"><div className="section-label"><span>{t.startHere}</span><p>{t.tools}</p></div><div className="quick-grid"><Quick featured icon="⌁" label={t.geminiPowered} title={t.inspectTitle} text={t.inspectCardText} onClick={() => nav('inspect')} /><Quick icon="✦" label={t.grounded} title={t.assistantTitle} text={t.assistantCardText} onClick={() => nav('assistant')} /><Quick icon="▦" label={t.fieldTools} title={t.calculators} text={t.calculatorCardText} onClick={() => nav('tools')} /><Quick icon="◫" label={t.catalogProducts} title={t.marketplace} text={t.marketCardText} onClick={() => nav('products')} /></div></section>
    <section className="catalog-band"><div><small>{t.officialKnowledge}</small><h2>{t.everyProduct}</h2><p>{t.categorySummary}</p></div><button onClick={() => nav('products')}>{t.explore} →</button></section></>;
}
function Quick(props: { featured?: boolean; icon: string; label: string; title: string; text: string; onClick: () => void }) { return <button onClick={props.onClick} className={`quick-card ${props.featured ? 'featured' : ''}`}><span className="quick-icon">{props.icon}</span><div><small>{props.label}</small><h3>{props.title}</h3><p>{props.text}</p></div><b>→</b></button>; }
function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div className="page-title"><p className="eyebrow"><span />{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>; }

function InspectionForm({ inputRef, files, setFiles, onAnalyse, loading, analysisSeconds, error, t }: { inputRef: RefObject<HTMLInputElement | null>; files: File[]; setFiles: (files: File[]) => void; onAnalyse: (form: HTMLFormElement) => Promise<void>; loading: boolean; analysisSeconds: number; error: string; t: Copy }) {
  const [preparing, setPreparing] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onAnalyse(event.currentTarget); };
  const chooseFiles = async (selected: File[]) => {
    const picked = selected.slice(0, 5);
    if (!picked.length) return;
    setPreparing(true);
    try { setFiles(await Promise.all(picked.map(optimiseImage))); }
    finally { setPreparing(false); }
  };
  const stage = analysisSeconds < 4 ? t.stageIdentify : analysisSeconds < 8 ? t.stageClassify : analysisSeconds < 11 ? t.stageMatch : t.stageFinal;
  return <form onSubmit={submit}><div className="card-heading"><span className="step-badge">01</span><div><h2>{t.addPhotos}</h2><p>{t.upToFive}</p></div></div><button type="button" className={`upload-zone ${files.length ? 'has-files' : ''}`} onClick={() => inputRef.current?.click()} disabled={preparing || loading}><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void chooseFiles(selected); }} /><span className="upload-icon">↑</span><strong>{preparing ? t.preparing : files.length ? `${files.length} ${t.ready}` : t.upload}</strong><small>{preparing ? t.faster : files.length ? files.map((file) => file.name).join(' · ') : t.uploadHelp}</small></button>{files.length > 0 && <div className="file-list">{files.map((file, index) => <span key={`${file.name}-${index}`}>{index + 1}. {file.name}<button type="button" onClick={() => setFiles(files.filter((_, item) => item !== index))}>×</button></span>)}</div>}<div className="form-row"><label><span>{t.crop} <small>{t.fromCatalog}</small></span><select name="crop" defaultValue=""><option value="">{t.identify}</option>{catalogCrops.map((crop) => <option key={crop}>{crop}</option>)}</select></label><label><span>{t.location} <small>{t.optional}</small></span><input name="location" placeholder="Ahmedabad, Gujarat" /></label></div><label className="full-field"><span>{t.notice} <small>{t.optional}</small></span><textarea name="description" placeholder={t.noticePlaceholder} /></label>{error && <p className="form-error">{error}</p>}{loading && <div className="analysis-progress" role="status" aria-live="polite"><div><span>{t.detailedAnalysis}</span><b>{analysisSeconds}s <small>{t.aboutTen}</small></b></div><div className="analysis-track"><i style={{ width: `${Math.min(95, Math.max(7, analysisSeconds * 10))}%` }} /></div><p>{stage}</p></div>}<button className="primary-button" disabled={!files.length || loading || preparing}>{loading ? `${t.analysing} ${analysisSeconds}s` : preparing ? t.preparing : t.analyse} <span>{loading || preparing ? '◌' : '→'}</span></button><p className="safety-note">{t.safety}</p></form>;
}
function Tips({ t }: { t: Copy }) { return <aside className="tips"><h3>{t.tips}</h3><ol><li><b>{t.wholePlant}</b><span>{t.wholePlantHelp}</span></li><li><b>{t.affectedArea}</b><span>{t.affectedHelp}</span></li><li><b>{t.underside}</b><span>{t.undersideHelp}</span></li></ol><div className="privacy-box"><b>{t.cropData}</b><p>{t.privacy}</p></div><div className="source-seal"><b>{t.catalogGrounded}</b><span>{t.catalogLimit}</span></div></aside>; }

function Result({ result, onClose, openProducts, openProduct, nav, t }: { result: Diagnosis; onClose: () => void; openProducts: (query: string) => void; openProduct: (product: CatalogProduct) => void; nav: (view: View) => void; t: Copy }) {
  const confidence = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
  const groups = Object.entries((result.recommendations || []).reduce<Record<string, CatalogProduct[]>>((all, product) => {
    (all[product.category] ||= []).push(product); return all;
  }, {}));
  const list = (title: string, items?: string[]) => items?.length ? <section className="diagnosis-list"><h4>{title}</h4><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section> : null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Crop assessment"><div className="result-modal result-wide">
    <button className="modal-close" onClick={onClose}>×</button><p className="eyebrow"><span /> {t.probableAssessment}</p>
    <div className="result-head"><div><small>{t.identified}</small><h2>{result.crop || '—'}</h2>{result.catalog_crop && <p>{t.catalogCrop}: <b>{result.catalog_crop}</b></p>}</div><span className="confidence"><b>{confidence}%</b> {t.confidence}</span></div>
    <div className="result-facts"><span><small>{t.condition}</small><b>{result.plant_condition || '—'}</b></span><span><small>{t.visibleStage}</small><b>{result.problem_stage || '—'}</b></span><span><small>{t.problemType}</small><b>{(result.issue_type || '—').replaceAll('_', ' ')}</b></span></div>
    <div className="issue-box"><small>{result.additional_information_required ? t.moreInfo : `${t.probable} ${result.issue_type?.replaceAll('_', ' ') || ''}`}</small><h3>{result.likely_issue || '—'}</h3><p>{result.summary}</p></div>
    <section className="diagnosis-section"><h3>{t.happening}</h3><div className="symptoms"><b>{t.visibleSigns}</b>{(result.observed_symptoms || []).map((symptom) => <span key={symptom}>{symptom}</span>)}</div><div className="diagnosis-columns">{list(t.causes, result.probable_causes)}{list(t.alternatives, result.alternative_possibilities)}</div></section>
    <div className="next-action"><b>{t.nextStep}</b><p>{result.recommended_next_action}</p></div>
    <div className="diagnosis-columns action-lists">{list(t.doNow, result.immediate_actions)}{list(t.prevention, result.prevention_tips)}</div>
    {result.additional_information_required && list(t.improve, result.questions_for_farmer)}
    <section className="matched-products"><div><small>{t.catalogMatch}</small><h3>{groups.length ? `${groups.length} ${t.applicableCategory} · ${result.recommendations.length} ${t.navProducts}` : t.noVerified}</h3><p>{result.catalog_crop ? t.explicitCrop : t.selectCrop}</p></div>
      {groups.length ? <div className="category-matches">{groups.map(([category, products]) => <section key={category}><header><div><small>{products.some((product) => product.matchScore && product.matchScore >= 20) ? t.strongCategory : t.applicableCategory}</small><h4>{category}</h4><p>{categoryPurpose[category] || t.catalogCategoryReason}</p></div><b>{products.length}</b></header><div className="mini-products">{products.map((product, index) => <button key={product.id} onClick={() => openProduct(product)}>{product.image ? <img src={product.image} alt="" /> : <span className="mini-fallback">CLSL</span>}<span><b>{product.name}{index === 0 && <mark>{t.topMatch}</mark>}</b><small>{product.commonName}</small><em>{product.matchReason}</em></span><i>{t.view} →</i></button>)}</div></section>)}</div> : <p className="no-match">{t.noMatch}</p>}
    </section>
    <div className="result-actions"><button onClick={() => openProducts(result.catalog_crop || '')}>{result.catalog_crop ? `${t.viewCropProducts}: ${result.catalog_crop}` : t.browseCatalog}</button><button className="secondary" onClick={() => nav('assistant')}>{t.followUp}</button></div><p className="demo-disclaimer">{t.resultDisclaimer}</p>
  </div></div>;
}

function Assistant({ openProduct, language, t }: { openProduct: (product: CatalogProduct) => void; language: LanguageCode; t: Copy }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const send = async (preset?: string) => {
    const question = (preset ?? input).trim(); if (!question || loading) return;
    const next = [...messages, { role: 'user' as const, content: question }]; setMessages(next); setInput(''); setLoading(true); setError('');
    try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, history: messages, language }) }); const data = await response.json() as { answer?: string; products?: CatalogProduct[]; error?: string }; if (!response.ok) throw new Error(data.error || 'Unable to answer.'); setMessages([...next, { role: 'assistant', content: data.answer || '', products: data.products }]); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to answer.'); }
    finally { setLoading(false); }
  };
  return <section className="workspace"><PageTitle eyebrow={t.assistantEyebrow} title={t.askWords} text={t.assistantIntro} /><div className="chat-shell"><div className="chat-head"><span className="assistant-orb">✦</span><div><b>Crop Life AI</b><small>Gemini + CLSL RAG</small></div><span className="online">{t.connected}</span></div><div className="chat-body"><div className="ai-message">{t.hello}</div>{messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'user-message' : 'ai-message'}><p>{message.content}</p>{message.products && message.products.length > 0 && <div className="chat-products">{message.products.map((product) => <button key={product.id} onClick={() => openProduct(product)}>{product.image && <img src={product.image} alt="" />}<span><b>{product.name}</b><small>{product.commonName}</small></span></button>)}</div>}</div>)}{loading && <div className="ai-message typing">{t.checking}<span>•••</span></div>}{error && <p className="chat-error">{error}</p>}</div><div className="chat-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void send()} placeholder={t.askPlaceholder} /><button className="send" onClick={() => void send()} disabled={!input.trim() || loading}>↑</button></div></div></section>;
}

function Products({ initialQuery, onQuery, openProduct, t }: { initialQuery: string; onQuery: (query: string) => void; openProduct: (product: CatalogProduct) => void; t: Copy }) {
  const [category, setCategory] = useState('All products');
  const [visible, setVisible] = useState(18);
  const matches = useMemo(() => searchCatalog(initialQuery, 1000, category).map((match) => match.product), [initialQuery, category]);
  const changeQuery = (query: string) => { setVisible(18); onQuery(query); };
  const changeCategory = (next: string) => { setVisible(18); setCategory(next); };
  return <section className="marketplace"><div className="market-hero"><div><p className="eyebrow"><span /> {t.officialCatalog}</p><h1>{t.marketHeading}</h1><p>{t.marketIntro}</p></div><div className="catalog-stat"><b>{catalog.length}</b><span>{t.catalogProducts}</span><small>{t.source}</small></div></div><div className="market-toolbar"><label className="market-search"><span>⌕</span><input value={initialQuery} onChange={(event) => changeQuery(event.target.value)} placeholder={t.searchPlaceholder} />{initialQuery && <button onClick={() => changeQuery('')}>×</button>}</label><select value={category} onChange={(event) => changeCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="category-chips">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => changeCategory(item)}>{item}<span>{item === 'All products' ? catalog.length : catalog.filter((product) => product.category === item).length}</span></button>)}</div><div className="result-count"><b>{matches.length}</b> {t.found}</div>{matches.length ? <div className="catalog-grid">{matches.slice(0, visible).map((product) => <ProductCard key={product.id} product={product} open={() => openProduct(product)} t={t} />)}</div> : <div className="empty-state"><span>⌕</span><h3>{t.noCatalogMatch}</h3><p>{t.trySearch}</p><button onClick={() => { changeQuery(''); changeCategory('All products'); }}>{t.showAll}</button></div>}{visible < matches.length && <button className="load-more" onClick={() => setVisible((count) => count + 18)}>{t.loadMore} <span>{visible} / {matches.length}</span></button>}<p className="catalog-disclaimer">{t.resultDisclaimer}</p></section>;
}
function ProductCard({ product, open, t }: { product: CatalogProduct; open: () => void; t: Copy }) { return <article className="catalog-card"><button className="product-image" onClick={open}>{product.image ? <img src={product.image} alt={`${product.name} pack`} /> : <div className="image-fallback"><img src="/clsl-logo.png" alt="" /><span>CLSL</span></div>}<span className="category-tag">{product.category}</span></button><div className="catalog-card-body"><small>CLSL · Page {product.sourcePage}</small><h2>{product.name}</h2><p>{product.commonName}</p><div className="card-meta"><span><b>{t.dose}</b>{product.dose || '—'}</span><span><b>{t.packing}</b>{product.packing || '—'}</span></div><button onClick={open}>{t.details} <span>→</span></button></div></article>; }

function ProductModal({ product, close, nav, t }: { product: CatalogProduct; close: () => void; nav: (view: View) => void; t: Copy }) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><article className="product-modal"><button className="modal-close" onClick={close}>×</button><div className="product-modal-image">{product.image ? <img src={product.image} alt={`${product.name} pack`} /> : <div className="image-fallback"><img src="/clsl-logo.png" alt="" /><span>CLSL</span></div>}<span>CLSL · Page {product.sourcePage}</span></div><div className="product-modal-copy"><small>{product.category}</small><h2>{product.name}</h2><h3>{product.commonName}</h3>{product.limitedRecord ? <div className="limited-note">CLSL catalogue index record</div> : <><dl><div><dt>{t.dose}</dt><dd>{product.dose || '—'}</dd></div><div><dt>{t.packing}</dt><dd>{product.packing || '—'}</dd></div></dl><section><h4>{t.useBenefits}</h4><p>{product.useBenefits}</p></section></>}<div className="label-warning"><b>{t.important}</b><p>{t.safety}</p></div><div className="product-modal-actions"><button onClick={() => { close(); nav('assistant'); }}>{t.askProduct}</button><button className="secondary" onClick={close}>{t.continueBrowsing}</button></div></div></article></div>; }

function HistoryView({ history, openResult, nav, clear, t }: { history: StoredInspection[]; openResult: (result: Diagnosis) => void; nav: (view: View) => void; clear: () => void; t: Copy }) { return <section className="workspace"><PageTitle eyebrow={t.savedDevice} title={t.historyHeading} text={t.historyIntro} />{history.length ? <><div className="history-tools"><span>{history.length}</span><button onClick={clear}>{t.clearHistory}</button></div><div className="history-list">{history.map((item) => <article className="history-item" key={item.id}><div className="history-date">{new Date(item.createdAt).toLocaleDateString()}</div><span className="crop-avatar">⌁</span><div><small>{item.crop}</small><h3>{item.issue}</h3><p>{item.summary}</p></div><span className="history-confidence">{Math.round(item.confidence * 100)}%</span><button onClick={() => openResult(item.result)}>{t.open} →</button></article>)}</div></> : <div className="empty-state history-empty"><span>⌁</span><h3>{t.noInspections}</h3><p>{t.historyEmpty}</p><button onClick={() => nav('inspect')}>{t.startInspection}</button></div>}</section>; }

function ProfileModal({ profile, save, close, t }: { profile: Profile; save: (profile: Profile) => void; close: () => void; t: Copy }) { const [draft, setDraft] = useState(profile); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="profile-modal" onSubmit={(event) => { event.preventDefault(); save(draft); }}><button type="button" className="modal-close" onClick={close}>×</button><span className="profile-avatar">{initials(draft.name)}</span><h2>{t.profile}</h2><p>{t.profilePrivacy}</p><label>{t.name}<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label>{t.location}<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="District, State" /></label><label>{t.preferredLanguage}<select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as LanguageCode })}>{languages.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><button className="primary-button">{t.saveProfile}</button></form></div>; }

function MobileNav({ view, nav, t }: { view: View; nav: (view: View) => void; t: Copy }) { return <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => nav('home')}><span>⌂</span>{t.home}</button><button className={view === 'assistant' ? 'active' : ''} onClick={() => nav('assistant')}><span>✦</span>{t.assistant}</button><button className="camera" onClick={() => nav('inspect')} aria-label={t.navInspect}><span>＋</span></button><button className={view === 'products' ? 'active' : ''} onClick={() => nav('products')}><span>◫</span>{t.navProducts}</button><button className={view === 'history' ? 'active' : ''} onClick={() => nav('history')}><span>◎</span>{t.history}</button></nav>; }
