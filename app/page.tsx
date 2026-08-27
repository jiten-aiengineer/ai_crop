'use client';

import { FormEvent, RefObject, useRef, useState } from 'react';

type View = 'home' | 'inspect' | 'assistant' | 'products' | 'history';
type Diagnosis = {
  crop: string;
  crop_confidence: number;
  issue_detected: boolean;
  issue_type: string;
  likely_issue: string;
  confidence: number;
  observed_symptoms: string[];
  alternative_possibilities: string[];
  additional_information_required: boolean;
  recommended_next_action: string;
  summary: string;
};

const products = [
  { name: 'CLS Safeguard', type: 'Insecticide', target: 'Sucking pests', crops: 'Cotton · Chilli', tone: 'gold' },
  { name: 'CLS Protect', type: 'Fungicide', target: 'Fungal diseases', crops: 'Tomato · Potato', tone: 'blue' },
  { name: 'CLS Growth+', type: 'Crop Nutrition', target: 'Nutrient support', crops: 'Multiple crops', tone: 'green' },
];

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [view, setView] = useState<View>('home');
  const [result, setResult] = useState<Diagnosis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chat, setChat] = useState('');
  const [messages, setMessages] = useState<string[]>([]);

  const nav = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const send = () => { if (chat.trim()) { setMessages([...messages, chat.trim()]); setChat(''); } };
  const analyse = async (form: HTMLFormElement) => {
    setLoading(true); setError('');
    const body = new FormData(form);
    files.forEach((file) => body.append('images', file));
    try {
      const response = await fetch('/api/inspect', { method: 'POST', body });
      const data = await response.json() as Diagnosis & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Unable to analyse these images.');
      setResult(data);
    } catch (problem) { setError(problem instanceof Error ? problem.message : 'Unable to analyse these images.'); }
    finally { setLoading(false); }
  };

  return <main className="app-shell">
    <Header view={view} nav={nav} />
    {view === 'home' && <HomeView nav={nav} />}
    {view === 'inspect' && <section className="workspace">
      <PageTitle eyebrow="AI Crop Doctor" title="Inspect your crop" text="Add clear photos from different angles. Gemini analyses visible evidence and returns a cautious, probable assessment." />
      <div className="inspection-layout"><div className="inspect-card large"><InspectionForm inputRef={inputRef} files={files} setFiles={setFiles} onAnalyse={analyse} loading={loading} error={error} /></div><Tips /></div>
      {result && <Result result={result} onClose={() => setResult(null)} nav={nav} />}
    </section>}
    {view === 'assistant' && <Assistant chat={chat} setChat={setChat} messages={messages} send={send} />}
    {view === 'products' && <Products />}
    {view === 'history' && <HistoryView />}
    <MobileNav view={view} nav={nav} />
    <footer><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><div><b>A product of Crop Life Science Limited</b><p>Enrich your growth · Responsible crop care, supported by intelligence.</p></div><button onClick={() => nav('home')}>Home ↑</button></footer>
  </main>;
}

function Header({ view, nav }: { view: View; nav: (view: View) => void }) {
  return <header className="topbar"><button className="brand plain" onClick={() => nav('home')}><img src="/clsl-logo.png" alt="CLSL" /><span><strong>Crop Life AI</strong><small>A Crop Life Science product</small></span></button><nav className="topnav" aria-label="Main navigation"><NavButton label="AI Inspection" target="inspect" view={view} nav={nav} /><NavButton label="AI Assistant" target="assistant" view={view} nav={nav} /><NavButton label="Products" target="products" view={view} nav={nav} /><NavButton label="My Inspections" target="history" view={view} nav={nav} /></nav><button className="profile-button" aria-label="Open farmer profile">RK</button></header>;
}
function NavButton({ label, target, view, nav }: { label: string; target: View; view: View; nav: (view: View) => void }) { return <button className={view === target ? 'active' : ''} onClick={() => nav(target)}>{label}</button>; }

function HomeView({ nav }: { nav: (view: View) => void }) {
  return <><section className="hero"><div className="hero-copy"><div className="endorsed"><img src="/clsl-logo.png" alt="Crop Life Science Limited" /><span>Developed for farmers by<br /><b>Crop Life Science Limited</b></span></div><p className="eyebrow"><span /> Your crop companion</p><h1>Understand your crop.<br /><em>Act with confidence.</em></h1><p>Take clear photos and describe what you see. Crop Life AI helps identify possible issues and guides you toward company-approved crop solutions.</p><div className="trust-row"><span>✓ Gemini image analysis</span><span>✓ Probable assessment</span><span>✓ Approved products only</span></div></div><div className="home-panel"><span className="leaf-shape">⌁</span><small>AI-assisted crop care</small><h2>See something unusual?</h2><p>Photo → probable assessment → Crop Life solution</p><button onClick={() => nav('inspect')}>Take crop pictures <span>→</span></button><div className="panel-stats"><span><b>3</b> simple steps</span><span><b>5</b> photos supported</span></div></div></section>
    <section className="quick-section"><div className="section-label"><span>Start here</span><p>Everything you need for a healthier crop</p></div><div className="quick-grid"><Quick featured icon="⌁" label="Gemini powered" title="AI Crop Inspection" text="Add crop photos and analyse visible symptoms." onClick={() => nav('inspect')} /><Quick icon="✦" label="Ask anything" title="Farmer Assistant" text="Get practical help with crops and cultivation." onClick={() => nav('assistant')} /><Quick icon="◫" label="Company range" title="Crop Life Products" text="Find approved solutions by crop or problem." onClick={() => nav('products')} /></div></section>
    <section className="assistant-strip"><div><span className="assistant-orb">✦</span><div><p>Crop Life AI Assistant</p><h2>What would you like to know about your crop?</h2></div></div><button onClick={() => nav('assistant')}>Ask the assistant <span>→</span></button></section></>;
}

function Quick(props: { featured?: boolean; icon: string; label: string; title: string; text: string; onClick: () => void }) { return <button onClick={props.onClick} className={`quick-card ${props.featured ? 'featured' : ''}`}><span className="quick-icon">{props.icon}</span><div><small>{props.label}</small><h3>{props.title}</h3><p>{props.text}</p></div><b>→</b></button>; }
function PageTitle({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) { return <div className="page-title"><p className="eyebrow"><span />{eyebrow}</p><h1>{title}</h1><p>{text}</p></div>; }

function InspectionForm({ inputRef, files, setFiles, onAnalyse, loading, error }: { inputRef: RefObject<HTMLInputElement | null>; files: File[]; setFiles: (files: File[]) => void; onAnalyse: (form: HTMLFormElement) => Promise<void>; loading: boolean; error: string }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onAnalyse(event.currentTarget); };
  return <form onSubmit={submit}><div className="card-heading"><span className="step-badge">01</span><div><h2>Add crop photos</h2><p>Up to 5 images · JPG, PNG, WebP or HEIC</p></div></div><button type="button" className={`upload-zone ${files.length ? 'has-files' : ''}`} onClick={() => inputRef.current?.click()}><input ref={inputRef} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple onChange={(event) => setFiles(Array.from(event.target.files || []).slice(0, 5))} /><span className="upload-icon">↑</span><strong>{files.length ? `${files.length} photo${files.length > 1 ? 's' : ''} ready` : 'Take or upload crop photos'}</strong><small>{files.length ? files.map((file) => file.name).join(' · ') : 'Whole plant, affected area and leaf underside work best'}</small></button><div className="form-row"><label><span>Crop <small>optional</small></span><select name="crop" defaultValue=""><option value="">Select your crop</option><option>Cotton</option><option>Tomato</option><option>Chilli</option><option>Wheat</option><option>Rice</option></select></label><label><span>Location <small>optional</small></span><input name="location" placeholder="e.g. Ahmedabad, Gujarat" /></label></div><label className="full-field"><span>What do you notice? <small>optional</small></span><textarea name="description" placeholder="Describe colour changes, spots, insects or when the problem started..." /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={!files.length || loading}>{loading ? 'Gemini is analysing…' : 'Analyse my crop'} <span>{loading ? '◌' : '→'}</span></button><p className="safety-note">AI results are probable assessments, not guaranteed diagnoses. Always follow approved product labels and local expert advice.</p></form>;
}

function Tips() { return <aside className="tips"><h3>Photos that help</h3><ol><li><b>Whole plant</b><span>Show the plant and its surroundings</span></li><li><b>Affected area</b><span>Take a clear close-up of symptoms</span></li><li><b>Leaf underside</b><span>Capture insects or growth underneath</span></li></ol><div className="privacy-box"><b>Your crop data</b><p>Inspection images are analysed for this result. Model-training reuse requires separate consent.</p></div><div className="powered-by"><img src="/clsl-logo.png" alt="CLSL" /><span>Crop Life AI<br /><b>by Crop Life Science Limited</b></span></div></aside>; }

function Result({ result, onClose, nav }: { result: Diagnosis; onClose: () => void; nav: (view: View) => void }) {
  const confidence = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Crop assessment"><div className="result-modal"><button className="modal-close" onClick={onClose}>×</button><p className="eyebrow"><span /> Gemini probable assessment</p><div className="result-head"><div><small>Crop identified</small><h2>{result.crop || 'Uncertain'}</h2></div><span className="confidence"><b>{confidence}%</b> confidence</span></div><div className="issue-box"><small>{result.additional_information_required ? 'MORE INFORMATION REQUIRED' : `POSSIBLE ISSUE · ${result.issue_type || 'UNCLASSIFIED'}`}</small><h3>{result.likely_issue || 'No clear issue identified'}</h3><p>{result.summary}</p></div><div className="symptoms"><b>Visible signs</b>{result.observed_symptoms.map((symptom) => <span key={symptom}>{symptom}</span>)}</div>{result.alternative_possibilities.length > 0 && <p className="alternatives"><b>Other possibilities:</b> {result.alternative_possibilities.join(', ')}</p>}<div className="next-action"><b>Recommended next step</b><p>{result.recommended_next_action}</p></div><div className="result-actions"><button onClick={() => nav('products')}>Search approved products</button><button className="secondary" onClick={() => nav('assistant')}>Ask a follow-up</button></div><p className="demo-disclaimer">AI output is informational. Product recommendations must come only from Crop Life Science’s verified database.</p></div></div>;
}

function Assistant({ chat, setChat, messages, send }: { chat: string; setChat: (value: string) => void; messages: string[]; send: () => void }) { return <section className="workspace"><PageTitle eyebrow="Farmer Assistant" title="Ask in your own words" text="Get practical help with crops, visible symptoms, cultivation and Crop Life products." /><div className="chat-shell"><div className="chat-head"><span className="assistant-orb">✦</span><div><b>Crop Life AI</b><small>By Crop Life Science Limited · English</small></div></div><div className="chat-body"><div className="ai-message">Namaste! Tell me which crop you grow. How can I help today?</div>{messages.map((message, index) => <div key={index} className="user-message">{message}</div>)}{messages.length > 0 && <div className="ai-message">Please share the crop, growth stage, location and a clear photo if symptoms are visible. The full conversational Gemini assistant will be connected in the next backend step.</div>}<div className="suggestions"><button onClick={() => setChat('My cotton leaves are curling')}>Cotton leaves are curling</button><button onClick={() => setChat('Help me find a product')}>Find a product</button></div></div><div className="chat-input"><button aria-label="Attach image">＋</button><input value={chat} onChange={(event) => setChat(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && send()} placeholder="Ask about your crop..." /><button className="send" onClick={send}>↑</button></div></div></section>; }

function Products() { return <section className="workspace"><PageTitle eyebrow="Crop Life portfolio" title="Find a company solution" text="Product information must be reviewed and managed by Crop Life Science. Always follow the approved label." /><div className="searchbar"><span>⌕</span><input placeholder="Search by crop, pest, disease or product" /><button>Search</button></div><div className="filter-row"><button className="selected">All products</button><button>Insecticides</button><button>Fungicides</button><button>Crop nutrition</button></div><div className="product-grid">{products.map((product) => <article className="product-card" key={product.name}><div className={`product-art ${product.tone}`}><span>CROP LIFE SCIENCE</span><b>{product.name.split(' ')[1]}</b></div><small>{product.type}</small><h2>{product.name}</h2><dl><div><dt>For</dt><dd>{product.target}</dd></div><div><dt>Crops</dt><dd>{product.crops}</dd></div></dl><button>View approved details →</button></article>)}</div><p className="demo-disclaimer">Demonstration records only. Please supply the verified CLSL product catalog before production use.</p></section>; }

function HistoryView() { return <section className="workspace"><PageTitle eyebrow="My records" title="Inspection history" text="Return to previous inspections, review assessments and continue the conversation." /><div className="history-list"><History date="27 Aug 2026" crop="Cotton" issue="Possible whitefly activity" confidence="87%" /><History date="20 Aug 2026" crop="Cotton" issue="No visible issue detected" confidence="82%" /><History date="11 Aug 2026" crop="Tomato" issue="Possible nutrient stress" confidence="71%" /></div></section>; }
function History(props: { date: string; crop: string; issue: string; confidence: string }) { return <article className="history-item"><div className="history-date">{props.date}</div><span className="crop-avatar">⌁</span><div><small>{props.crop}</small><h3>{props.issue}</h3></div><span className="history-confidence">{props.confidence}</span><button>Open →</button></article>; }

function MobileNav({ view, nav }: { view: View; nav: (view: View) => void }) { return <nav className="mobile-nav" aria-label="Mobile navigation"><button className={view === 'home' ? 'active' : ''} onClick={() => nav('home')}><span>⌂</span>Home</button><button className={view === 'inspect' ? 'active' : ''} onClick={() => nav('inspect')}><span>▣</span>Inspect</button><button className="camera" onClick={() => nav('inspect')}><span>＋</span></button><button className={view === 'products' ? 'active' : ''} onClick={() => nav('products')}><span>◫</span>Products</button><button className={view === 'history' ? 'active' : ''} onClick={() => nav('history')}><span>◎</span>History</button></nav>; }
