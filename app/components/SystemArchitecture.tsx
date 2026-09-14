'use client';

import { useState } from 'react';

function Arrow() { return <span className="architecture-arrow" aria-hidden="true">→</span>; }

export default function SystemArchitecture() {
  const [view, setView] = useState<'simple' | 'technical'>('simple');
  return <div className="admin-content architecture-page">
    <div className="admin-list-toolbar"><div><p className="admin-overline">Crop Life AI system map</p><h2>How the platform works</h2><p>Switch between a plain-language business explanation and the technical production architecture.</p></div><div className="architecture-view-switch" role="group" aria-label="Architecture detail"><button className={view === 'simple' ? 'selected' : ''} onClick={() => setView('simple')}>Simple view</button><button className={view === 'technical' ? 'selected' : ''} onClick={() => setView('technical')}>Technical view</button></div></div>

    {view === 'simple' ? <div className="architecture-simple">
      <section className="architecture-journey" aria-label="Simple crop inspection flow">
        <article><i>1</i><div><b>Employee photographs the crop</b><p>The crop name and field photos are submitted from a phone or computer.</p></div></article><Arrow />
        <article><i>2</i><div><b>Gemma and Flash-Lite examine the problem</b><p>Gemma is preferred; Flash-Lite automatically supplies the live result when Gemma is weak.</p></div></article><Arrow />
        <article><i>3</i><div><b>Approved CLSL products are matched</b><p>Only active, approved products registered for that crop and issue can appear.</p></div></article><Arrow />
        <article><i>4</i><div><b>The field result is shown</b><p>The employee receives the assessment, next steps and relevant company products.</p></div></article>
      </section>
      <section className="architecture-simple-grid">
        <article><span>Automatic evaluation</span><h3>Two independent models check every case</h3><p>Gemini 3.5 Flash-Lite evaluates in the background, while Qwen processes the same retained evidence whenever the private GPU is reachable.</p></article>
        <article><span>Continuous improvement</span><h3>The strongest available teacher label is retained</h3><p>The system chooses 3/3 agreement first, 2/3 agreement second, and Gemini Flash-Lite when evaluators disagree or cannot complete. No expert approval queue is required.</p></article>
        <article><span>Controlled deployment</span><h3>The existing Qwen model is fine-tuned</h3><p>The system trains a versioned adapter for the current Qwen base model—not a new foundation model. It must pass validation accuracy, macro F1 and issue accuracy gates without regression before promotion.</p></article>
        <article><span>Company knowledge</span><h3>Catalogue changes stay governed</h3><p>Only finally published product records become available to crop inspection, catalogue search and Crop Life Mitra.</p></article>
      </section>
      <aside className="architecture-safety"><b>Important safety rule</b><p>AI can assess visible crop evidence and improve the private diagnostic model. It cannot invent products, doses or crop registrations, and it cannot bypass the approved CLSL catalogue engine.</p></aside>
    </div> : <div className="architecture-technical">
      <section className="architecture-tech-flow" aria-label="Technical request and evaluation architecture">
        <div className="architecture-layer"><span>CLIENT</span><article><b>Responsive PWA</b><small>Camera, gallery upload, field session, multilingual UI and Crop Life Mitra</small></article></div><Arrow />
        <div className="architecture-layer"><span>EDGE</span><article><b>Nginx + HTTPS</b><small>DuckDNS TLS endpoint, public application routing and protected admin route</small></article></div><Arrow />
        <div className="architecture-layer"><span>APPLICATION</span><article><b>Next.js / Vinext</b><small>Session BFF, image validation, S3 upload and field response</small></article></div><Arrow />
        <div className="architecture-layer"><span>CORE API</span><article><b>FastAPI + PostgreSQL</b><small>Persistence, RBAC, catalogue governance, queueing and model telemetry</small></article></div>
      </section>

      <div className="architecture-tech-grid">
        <section><header><span>LIVE INFERENCE</span><h3>Immediate field response</h3></header><div className="architecture-stack"><article><b>Gemma → Flash-Lite fallback</b><small>Both inspect the image; the stronger usable result becomes farmer-facing</small></article><Arrow /><article><b>Evidence confidence gate</b><small>Prevents uncertain diagnosis from triggering category matching</small></article><Arrow /><article><b>Deterministic CLSL RAG</b><small>Active + approved product, crop and issue mappings only</small></article></div></section>
        <section><header><span>AUTOMATIC EVALUATION</span><h3>Teacher-label hierarchy</h3></header><div className="architecture-stack"><article><b>Gemma + Flash-Lite + Qwen</b><small>Independent crop, disease/pest, severity and confidence outputs</small></article><Arrow /><article><b>3/3 → 2/3 → Flash-Lite</b><small>Consensus gets the highest weight; fallback data is retained at a lower weight</small></article><Arrow /><article><b>Versioned dataset manifest</b><small>Records the label source, confidence, image references and training weight</small></article></div></section>
        <section><header><span>CONTINUOUS MODEL DELIVERY</span><h3>Dataset → Qwen fine-tune → validate → promote</h3></header><div className="architecture-stack"><article><b>Private multimodal examples</b><small>Crop + disease labels reference retained S3 images without exposing them publicly</small></article><Arrow /><article><b>Existing-Qwen adapter tuning</b><small>Improves qwen3.5:9b for crop and disease classification; no foundation model is trained from scratch</small></article><Arrow /><article><b>Metric-gated Qwen version</b><small>Crop accuracy, issue accuracy and macro F1 must pass before deployment</small></article></div></section>
      </div>

      <section className="architecture-security"><div><span>NETWORK BOUNDARY</span><b>PostgreSQL, FastAPI, application ports, Ollama and training endpoints are private services.</b></div><div><span>DATA BOUNDARY</span><b>Photos remain in private S3; the training manifest stores controlled object references and an auditable dataset version. Quality reviewers can delete unsuitable evidence.</b></div><div><span>MODEL BOUNDARY</span><b>Only the existing Qwen model is adapter-fine-tuned. Automatic evaluation never bypasses CLSL product approval or dosage rules.</b></div></section>
    </div>}
  </div>;
}
