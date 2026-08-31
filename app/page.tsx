'use client';

import { FormEvent, RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { catalog, catalogCrops, CatalogProduct, searchCatalog } from './lib/catalog';

type View = 'home' | 'inspect' | 'assistant' | 'products' | 'history';
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
type Profile = { name: string; location: string; language: string };

const categories = ['All products', ...Array.from(new Set(catalog.map((product) => product.category)))];
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
  const [profile, setProfile] = useState<Profile>({ name: 'Farmer', location: '', language: 'English' });
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_KEY);
      const storedProfile = localStorage.getItem(PROFILE_KEY);
      if (storedHistory) setHistory(JSON.parse(storedHistory));
      if (storedProfile) setProfile(JSON.parse(storedProfile));
    } catch { /* device storage may be unavailable */ }
  }, []);

  useEffect(() => {
    if (!loading) { setAnalysisSeconds(0); return; }
    const started = Date.now();
    setAnalysisSeconds(0);
    const timer = window.setInterval(() => setAnalysisSeconds(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [loading]);

  const nav = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const openProducts = (query = '') => { setProductQuery(query); nav('products'); };
  const saveProfile = (next: Profile) => { setProfile(next); localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); setProfileOpen(false); };
  const analyse = async (form: HTMLFormElement) => {
    const uploadBytes = files.reduce((total, file) => total + file.size, 0);
    if (uploadBytes > MAX_UPLOAD_BYTES) {
      setError('These photos are still too large to upload together. Please select fewer photos or use JPG images.');
      return;
    }
    setLoading(true); setError('');
    const body = new FormData(form); files.forEach((file) => body.append('images', file));
    try {
      const response = await fetch('/api/inspect', { method: 'POST', body });
      const data = await readApiResponse<Diagnosis>(response);
      if (!response.ok) throw new Error(data.error || 'Unable to analyse these images.');
      setResult(data);
      const record: StoredInspection = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), crop: data.crop || 'Unknown crop', issue: data.likely_issue || 'No clear issue', confidence: data.confidence, summary: data.summary, result: data };
      setHistory((previous) => { const next = [record, ...previous].slice(0, 50); localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); return next; });
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to analyse these images.'); }
    finally { setLoading(false); }
  };

  return <main className="app-shell">
    <Header view={view} nav={nav} profile={profile} onProfile={() => setProfileOpen(true)} />
    {view === 'home' && <HomeView nav={nav} />}
    {view === 'inspect' && <section className="workspace"><PageTitle eyebrow="AI Crop Doctor" title="Inspect your crop" text="Upload clear photos from different angles. Gemini assesses visible evidence, then Crop Life products are matched only from the supplied company catalog." /><div className="inspection-layout"><div className="inspect-card large"><InspectionForm inputRef={inputRef} files={files} setFiles={setFiles} onAnalyse={analyse} loading={loading} analysisSeconds={analysisSeconds} error={error} /></div><Tips /></div>{result && <Result result={result} onClose={() => setResult(null)} openProducts={openProducts} openProduct={setSelectedProduct} nav={nav} />}</section>}
    {view === 'assistant' && <Assistant openProduct={setSelectedProduct} />}
    {view === 'products' && <Products initialQuery={productQuery} onQuery={setProductQuery} openProduct={setSelectedProduct} />}
    {view === 'history' && <HistoryView history={history} openResult={setResult} nav={nav} clear={() => { setHistory([]); localStorage.removeItem(HISTORY_KEY); }} />}
    <MobileNav view={view} nav={nav} />
    <footer><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><div><b>A product of Crop Life Science Limited</b><p>73 catalog products · Catalog-only product suggestions</p></div><button onClick={() => nav('home')}>Home ↑</button></footer>
    {selectedProduct && <ProductModal product={selectedProduct} close={() => setSelectedProduct(null)} nav={nav} />}
    {profileOpen && <ProfileModal profile={profile} save={saveProfile} close={() => setProfileOpen(false)} />}
  </main>;
}

function Header({ view, nav, profile, onProfile }: { view: View; nav: (view: View) => void; profile: Profile; onProfile: () => void }) {
  return <header className="topbar"><button className="brand plain" onClick={() => nav('home')}><img src="/clsl-logo.png" alt="CLSL" /><span><strong>Crop Life AI</strong><small>A Crop Life Science product</small></span></button><nav className="topnav" aria-label="Main navigation"><NavButton label="AI Inspection" target="inspect" view={view} nav={nav} /><NavButton label="AI Assistant" target="assistant" view={view} nav={nav} /><NavButton label="Products" target="products" view={view} nav={nav} /><NavButton label="My Inspections" target="history" view={view} nav={nav} /></nav><button className="profile-button" onClick={onProfile} aria-label="Open farmer profile">{initials(profile.name)}</button></header>;
}
function NavButton({ label, target, view, nav }: { label: string; target: View; view: View; nav: (view: View) => void }) { return <button className={view === target ? 'active' : ''} onClick={() => nav(target)}>{label}</button>; }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F'; }

function HomeView({ nav }: { nav: (view: View) => void }) {
  return <><section className="hero"><div className="hero-copy"><div className="endorsed"><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><span>Developed for farmers by<br /><b>Crop Life Science Limited</b></span></div><p className="eyebrow"><span /> Your crop companion</p><h1>Understand your crop.<br /><em>Act with confidence.</em></h1><p>Take crop photos, get a cautious AI assessment, and discover relevant solutions from Crop Life Science’s verified catalog—not from invented AI product knowledge.</p><div className="trust-row"><span>✓ Gemini image assessment</span><span>✓ 73 catalog products</span><span>✓ Catalog-only suggestions</span></div></div><div className="home-panel"><span className="leaf-shape">⌁</span><small>AI-assisted crop care</small><h2>See something unusual?</h2><p>Photo → probable assessment → catalog match</p><button type="button" onClick={() => nav('inspect')}>Take crop pictures <span>→</span></button><div className="panel-stats"><span><b>5</b> photos supported</span><span><b>73</b> CLSL products</span></div></div></section>
    <section className="quick-section"><div className="section-label"><span>Start here</span><p>Working Phase 1 tools</p></div><div className="quick-grid"><Quick featured icon="⌁" label="Gemini powered" title="AI Crop Inspection" text="Assess crop photos and find catalog matches." onClick={() => nav('inspect')} /><Quick icon="✦" label="Catalog grounded" title="Farmer Assistant" text="Ask agricultural and Crop Life product questions." onClick={() => nav('assistant')} /><Quick icon="◫" label="73 products" title="Product Marketplace" text="Search, filter, compare and inspect catalog details." onClick={() => nav('products')} /></div></section>
    <section className="catalog-band"><div><small>OFFICIAL PRODUCT KNOWLEDGE</small><h2>Every product from the supplied CLSL catalog</h2><p>Insecticides, fungicides, seed treatment, biostimulants, PGRs, micronutrients, weedicides and more.</p></div><button onClick={() => nav('products')}>Explore all 73 products →</button></section></>;
}
function Quick(props: { featured?: boolean; icon: string; label: string; title: string; text: string; onClick: () => void }) { return <button onClick={props.onClick} className={`quick-card ${props.featured ? 'featured' : ''}`}><span className="quick-icon">{props.icon}</span><div><small>{props.label}</small><h3>{props.title}</h3><p>{props.text}</p></div><b>→</b></button>; }
function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div className="page-title"><p className="eyebrow"><span />{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>; }

function InspectionForm({ inputRef, files, setFiles, onAnalyse, loading, analysisSeconds, error }: { inputRef: RefObject<HTMLInputElement | null>; files: File[]; setFiles: (files: File[]) => void; onAnalyse: (form: HTMLFormElement) => Promise<void>; loading: boolean; analysisSeconds: number; error: string }) {
  const [preparing, setPreparing] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onAnalyse(event.currentTarget); };
  const chooseFiles = async (selected: File[]) => {
    const picked = selected.slice(0, 5);
    if (!picked.length) return;
    setPreparing(true);
    try { setFiles(await Promise.all(picked.map(optimiseImage))); }
    finally { setPreparing(false); }
  };
  const stage = analysisSeconds < 4 ? 'Identifying the crop and visible symptoms' : analysisSeconds < 8 ? 'Classifying the probable problem' : analysisSeconds < 11 ? 'Matching CLSL catalogue categories' : 'Finalising verified catalogue matches';
  return <form onSubmit={submit}><div className="card-heading"><span className="step-badge">01</span><div><h2>Add crop photos</h2><p>Up to 5 images · automatically optimised</p></div></div><button type="button" className={`upload-zone ${files.length ? 'has-files' : ''}`} onClick={() => inputRef.current?.click()} disabled={preparing || loading}><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => { const selected = Array.from(event.currentTarget.files || []); event.currentTarget.value = ''; void chooseFiles(selected); }} /><span className="upload-icon">↑</span><strong>{preparing ? 'Preparing photos…' : files.length ? `${files.length} photo${files.length > 1 ? 's' : ''} ready` : 'Take or upload crop photos'}</strong><small>{preparing ? 'Reducing upload size for a faster analysis' : files.length ? files.map((file) => file.name).join(' · ') : 'Whole plant, affected area and leaf underside work best'}</small></button>{files.length > 0 && <div className="file-list">{files.map((file, index) => <span key={`${file.name}-${index}`}>{index + 1}. {file.name}<button type="button" onClick={() => setFiles(files.filter((_, item) => item !== index))}>×</button></span>)}</div>}<div className="form-row"><label><span>Crop <small>from catalogue</small></span><select name="crop" defaultValue=""><option value="">Let Gemini identify it</option>{catalogCrops.map((crop) => <option key={crop}>{crop}</option>)}</select></label><label><span>Location <small>optional</small></span><input name="location" placeholder="e.g. Ahmedabad, Gujarat" /></label></div><label className="full-field"><span>What do you notice? <small>optional</small></span><textarea name="description" placeholder="Describe colour changes, spots, insects or when the problem started..." /></label>{error && <p className="form-error">{error}</p>}{loading && <div className="analysis-progress" role="status" aria-live="polite"><div><span>Detailed crop analysis</span><b>{analysisSeconds}s <small>/ about 10s</small></b></div><div className="analysis-track"><i style={{ width: `${Math.min(95, Math.max(7, analysisSeconds * 10))}%` }} /></div><p>{stage}</p></div>}<button className="primary-button" disabled={!files.length || loading || preparing}>{loading ? `Analysing… ${analysisSeconds}s` : preparing ? 'Preparing photos…' : 'Analyse my crop'} <span>{loading || preparing ? '◌' : '→'}</span></button><p className="safety-note">Probable assessment only. Recommendations are matched from the supplied CLSL catalog; always verify the approved label and local registration.</p></form>;
}
function Tips() { return <aside className="tips"><h3>Photos that help</h3><ol><li><b>Whole plant</b><span>Show the plant and surroundings</span></li><li><b>Affected area</b><span>Take a clear symptom close-up</span></li><li><b>Leaf underside</b><span>Capture insects or growth underneath</span></li></ol><div className="privacy-box"><b>Your crop data</b><p>Photos are analysed for this result. Model-training reuse requires separate consent.</p></div><div className="source-seal"><b>Catalog-grounded matching</b><span>Product suggestions are limited to the uploaded CLSL catalog.</span></div></aside>; }

function Result({ result, onClose, openProducts, openProduct, nav }: { result: Diagnosis; onClose: () => void; openProducts: (query: string) => void; openProduct: (product: CatalogProduct) => void; nav: (view: View) => void }) {
  const confidence = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
  const groups = Object.entries((result.recommendations || []).reduce<Record<string, CatalogProduct[]>>((all, product) => {
    (all[product.category] ||= []).push(product); return all;
  }, {}));
  const list = (title: string, items?: string[]) => items?.length ? <section className="diagnosis-list"><h4>{title}</h4><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></section> : null;
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Crop assessment"><div className="result-modal result-wide">
    <button className="modal-close" onClick={onClose}>×</button><p className="eyebrow"><span /> Probable AI assessment</p>
    <div className="result-head"><div><small>Plant identified by Gemini</small><h2>{result.crop || 'Uncertain'}</h2>{result.catalog_crop && <p>Catalogue crop used: <b>{result.catalog_crop}</b></p>}</div><span className="confidence"><b>{confidence}%</b> confidence</span></div>
    <div className="result-facts"><span><small>Condition</small><b>{result.plant_condition || 'Uncertain'}</b></span><span><small>Visible stage</small><b>{result.problem_stage || 'Unknown'}</b></span><span><small>Problem type</small><b>{(result.issue_type || 'unknown').replaceAll('_', ' ')}</b></span></div>
    <div className="issue-box"><small>{result.additional_information_required ? 'PROBABLE RESULT · MORE INFORMATION CAN IMPROVE IT' : `PROBABLE ${result.issue_type?.replaceAll('_', ' ') || 'ISSUE'}`}</small><h3>{result.likely_issue || 'No clear issue identified'}</h3><p>{result.summary}</p></div>
    <section className="diagnosis-section"><h3>What is happening to the plant</h3><div className="symptoms"><b>Visible signs</b>{(result.observed_symptoms || []).map((symptom) => <span key={symptom}>{symptom}</span>)}</div><div className="diagnosis-columns">{list('Probable causes', result.probable_causes)}{list('Other possibilities', result.alternative_possibilities)}</div></section>
    <div className="next-action"><b>Recommended next step</b><p>{result.recommended_next_action}</p></div>
    <div className="diagnosis-columns action-lists">{list('Do now', result.immediate_actions)}{list('Prevention', result.prevention_tips)}</div>
    {result.additional_information_required && list('Details that can improve the assessment', result.questions_for_farmer)}
    <section className="matched-products"><div><small>CLSL CATALOGUE · CROP + CATEGORY MATCH</small><h3>{groups.length ? `${groups.length} applicable categor${groups.length === 1 ? 'y' : 'ies'} · ${result.recommendations.length} crop-listed products` : 'No verified crop/category match yet'}</h3><p>{result.catalog_crop ? `Only products whose catalogue entry explicitly mentions ${result.catalog_crop} are shown.` : 'Select a catalogue crop to restrict matches more precisely.'}</p></div>
      {groups.length ? <div className="category-matches">{groups.map(([category, products]) => <section key={category}><header><div><small>APPLICABLE CATEGORY</small><h4>{category}</h4></div><b>{products.length} match{products.length === 1 ? '' : 'es'}</b></header><div className="mini-products">{products.map((product) => <button key={product.id} onClick={() => openProduct(product)}>{product.image ? <img src={product.image} alt="" /> : <span className="mini-fallback">CLSL</span>}<span><b>{product.name}</b><small>{product.commonName}</small><em>{product.matchReason}</em></span><i>View →</i></button>)}</div></section>)}</div> : <p className="no-match">The supplied catalogue did not produce a strong match for both this crop and probable category. Add clearer photos or ask the assistant before considering treatment.</p>}
    </section>
    <div className="result-actions"><button onClick={() => openProducts(result.catalog_crop || '')}>{result.catalog_crop ? `View all ${result.catalog_crop} products` : 'Browse the full catalogue'}</button><button className="secondary" onClick={() => nav('assistant')}>Ask a follow-up</button></div><p className="demo-disclaimer">Gemini explains the visible problem. Product candidates are selected deterministically only from the supplied Crop Life Science catalogue. Always verify the latest approved label, crop registration and expert guidance.</p>
  </div></div>;
}

function Assistant({ openProduct }: { openProduct: (product: CatalogProduct) => void }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const send = async (preset?: string) => {
    const question = (preset ?? input).trim(); if (!question || loading) return;
    const next = [...messages, { role: 'user' as const, content: question }]; setMessages(next); setInput(''); setLoading(true); setError('');
    try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question, history: messages }) }); const data = await response.json() as { answer?: string; products?: CatalogProduct[]; error?: string }; if (!response.ok) throw new Error(data.error || 'Unable to answer.'); setMessages([...next, { role: 'assistant', content: data.answer || '', products: data.products }]); }
    catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to answer.'); }
    finally { setLoading(false); }
  };
  return <section className="workspace"><PageTitle eyebrow="Catalog-grounded assistant" title="Ask in your own words" text="Ask about crop problems, cultivation, compositions, doses or CLSL products. Product answers are restricted to the supplied catalog." /><div className="chat-shell"><div className="chat-head"><span className="assistant-orb">✦</span><div><b>Crop Life AI</b><small>Gemini + CLSL catalog RAG</small></div><span className="online">Catalog connected</span></div><div className="chat-body"><div className="ai-message">Namaste! Ask an agricultural question or describe your crop and problem. I will only suggest products found in the Crop Life Science catalog.</div>{messages.map((message, index) => <div key={index} className={message.role === 'user' ? 'user-message' : 'ai-message'}><p>{message.content}</p>{message.products && message.products.length > 0 && <div className="chat-products">{message.products.map((product) => <button key={product.id} onClick={() => openProduct(product)}>{product.image && <img src={product.image} alt="" />}<span><b>{product.name}</b><small>{product.commonName}</small></span></button>)}</div>}</div>)}{loading && <div className="ai-message typing">Checking the CLSL catalog<span>•••</span></div>}{error && <p className="chat-error">{error}</p>}{messages.length === 0 && <div className="suggestions"><button onClick={() => void send('Which catalog products mention whitefly in cotton?')}>Cotton whitefly products</button><button onClick={() => void send('Show fungicides for tomato diseases from the catalog')}>Tomato fungicides</button><button onClick={() => void send('What is the composition and dose of ADO-70?')}>ADO-70 details</button></div>}</div><div className="chat-input"><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void send()} placeholder="Ask about crops or catalog products..." /><button className="send" onClick={() => void send()} disabled={!input.trim() || loading}>↑</button></div></div></section>;
}

function Products({ initialQuery, onQuery, openProduct }: { initialQuery: string; onQuery: (query: string) => void; openProduct: (product: CatalogProduct) => void }) {
  const [category, setCategory] = useState('All products');
  const [visible, setVisible] = useState(18);
  const matches = useMemo(() => searchCatalog(initialQuery, 1000, category).map((match) => match.product), [initialQuery, category]);
  useEffect(() => setVisible(18), [initialQuery, category]);
  return <section className="marketplace"><div className="market-hero"><div><p className="eyebrow"><span /> Official CLSL catalog</p><h1>Crop solutions marketplace</h1><p>Explore all {catalog.length} products extracted from the company catalog. Search by product, composition, crop, pest, disease or benefit.</p></div><div className="catalog-stat"><b>{catalog.length}</b><span>catalog products</span><small>Source: CLSL English Catalog</small></div></div><div className="market-toolbar"><label className="market-search"><span>⌕</span><input value={initialQuery} onChange={(event) => onQuery(event.target.value)} placeholder="Search whitefly, cotton, imidacloprid, product name..." />{initialQuery && <button onClick={() => onQuery('')}>×</button>}</label><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="category-chips">{categories.map((item) => <button key={item} className={category === item ? 'selected' : ''} onClick={() => setCategory(item)}>{item}<span>{item === 'All products' ? catalog.length : catalog.filter((product) => product.category === item).length}</span></button>)}</div><div className="result-count"><b>{matches.length}</b> products found {initialQuery && <>for “{initialQuery}”</>}</div>{matches.length ? <div className="catalog-grid">{matches.slice(0, visible).map((product) => <ProductCard key={product.id} product={product} open={() => openProduct(product)} />)}</div> : <div className="empty-state"><span>⌕</span><h3>No catalog match</h3><p>Try a product name, active ingredient, crop, pest, disease or another category.</p><button onClick={() => { onQuery(''); setCategory('All products'); }}>Show all products</button></div>}{visible < matches.length && <button className="load-more" onClick={() => setVisible((count) => count + 18)}>Load more products <span>{visible} of {matches.length}</span></button>}<p className="catalog-disclaimer">Catalog information is reproduced from the supplied Crop Life Science brochure. Always confirm the current approved label, crop registration and local expert guidance before use.</p></section>;
}
function ProductCard({ product, open }: { product: CatalogProduct; open: () => void }) { return <article className="catalog-card"><button className="product-image" onClick={open}>{product.image ? <img src={product.image} alt={`${product.name} pack`} /> : <div className="image-fallback"><img src="/clsl-logo.png" alt="" /><span>Catalog listing</span></div>}<span className="category-tag">{product.category}</span></button><div className="catalog-card-body"><small>CLSL · Catalog page {product.sourcePage}</small><h2>{product.name}</h2><p>{product.commonName}</p><div className="card-meta"><span><b>Dose</b>{product.dose || 'See current label'}</span><span><b>Packing</b>{product.packing || 'Contact CLSL'}</span></div><button onClick={open}>View product details <span>→</span></button></div></article>; }

function ProductModal({ product, close, nav }: { product: CatalogProduct; close: () => void; nav: (view: View) => void }) { return <div className="modal-backdrop" role="dialog" aria-modal="true"><article className="product-modal"><button className="modal-close" onClick={close}>×</button><div className="product-modal-image">{product.image ? <img src={product.image} alt={`${product.name} pack`} /> : <div className="image-fallback"><img src="/clsl-logo.png" alt="" /><span>Index-only listing</span></div>}<span>Official catalog source · Page {product.sourcePage}</span></div><div className="product-modal-copy"><small>{product.category}</small><h2>{product.name}</h2><h3>{product.commonName}</h3>{product.limitedRecord ? <div className="limited-note">This product appears in the catalog index, but a detailed profile page was not included in the supplied PDF.</div> : <><dl><div><dt>Catalog dose</dt><dd>{product.dose || 'Not printed'}</dd></div><div><dt>Available packing</dt><dd>{product.packing || 'Not printed'}</dd></div></dl><section><h4>Use / Benefits</h4><p>{product.useBenefits}</p></section></>}<div className="label-warning"><b>Important</b><p>This brochure record is informational. Verify the latest approved label, crop, dose and regional registration before application.</p></div><div className="product-modal-actions"><button onClick={() => { close(); nav('assistant'); }}>Ask AI about this product</button><button className="secondary" onClick={close}>Continue browsing</button></div></div></article></div>; }

function HistoryView({ history, openResult, nav, clear }: { history: StoredInspection[]; openResult: (result: Diagnosis) => void; nav: (view: View) => void; clear: () => void }) { return <section className="workspace"><PageTitle eyebrow="Saved on this device" title="Inspection history" text="Review previous assessments and the catalog matches returned at that time." />{history.length ? <><div className="history-tools"><span>{history.length} saved inspection{history.length > 1 ? 's' : ''}</span><button onClick={clear}>Clear history</button></div><div className="history-list">{history.map((item) => <article className="history-item" key={item.id}><div className="history-date">{new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div><span className="crop-avatar">⌁</span><div><small>{item.crop}</small><h3>{item.issue}</h3><p>{item.summary}</p></div><span className="history-confidence">{Math.round(item.confidence * 100)}%</span><button onClick={() => openResult(item.result)}>Open →</button></article>)}</div></> : <div className="empty-state history-empty"><span>⌁</span><h3>No inspections yet</h3><p>Your completed crop assessments will appear here automatically.</p><button onClick={() => nav('inspect')}>Start an inspection</button></div>}</section>; }

function ProfileModal({ profile, save, close }: { profile: Profile; save: (profile: Profile) => void; close: () => void }) { const [draft, setDraft] = useState(profile); return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="profile-modal" onSubmit={(event) => { event.preventDefault(); save(draft); }}><button type="button" className="modal-close" onClick={close}>×</button><span className="profile-avatar">{initials(draft.name)}</span><h2>Farmer profile</h2><p>Saved privately on this device for the current prototype.</p><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label><label>Location<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="District, State" /></label><label>Preferred language<select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value })}><option>English</option><option>Hindi</option><option>Gujarati</option><option>Marathi</option><option>Punjabi</option></select></label><button className="primary-button">Save profile</button></form></div>; }

function MobileNav({ view, nav }: { view: View; nav: (view: View) => void }) { return <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => nav('home')}><span>⌂</span>Home</button><button className={view === 'assistant' ? 'active' : ''} onClick={() => nav('assistant')}><span>✦</span>Assistant</button><button className="camera" onClick={() => nav('inspect')}><span>＋</span></button><button className={view === 'products' ? 'active' : ''} onClick={() => nav('products')}><span>◫</span>Products</button><button className={view === 'history' ? 'active' : ''} onClick={() => nav('history')}><span>◎</span>History</button></nav>; }
