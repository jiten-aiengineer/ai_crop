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
        <article><i>2</i><div><b>Gemma examines the problem</b><p>The live model provides the immediate probable crop assessment.</p></div></article><Arrow />
        <article><i>3</i><div><b>Approved CLSL products are matched</b><p>Only active, approved products registered for that crop and issue can appear.</p></div></article><Arrow />
        <article><i>4</i><div><b>The field result is shown</b><p>The employee receives the assessment, next steps and relevant company products.</p></div></article>
      </section>
      <section className="architecture-simple-grid">
        <article><span>Automatic evaluation</span><h3>Two independent models check every case</h3><p>Gemini 3.5 Flash-Lite evaluates in the background, while Qwen processes the same retained evidence whenever the private GPU is reachable.</p></article>
        <article><span>Continuous improvement</span><h3>Two of three must agree</h3><p>After all three results exist, a high-confidence 2-of-3 or 3-of-3 majority can create the training label. Conflicting cases remain excluded.</p></article>
        <article><span>Controlled deployment</span><h3>Only a better model is released</h3><p>The candidate must pass validation accuracy, macro F1 and issue accuracy gates without regression before automatic promotion.</p></article>
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
        <section><header><span>LIVE INFERENCE</span><h3>Immediate field response</h3></header><div className="architecture-stack"><article><b>Gemma 4 26B</b><small>Primary multimodal crop diagnosis through the configured Google API</small></article><Arrow /><article><b>Confidence and evidence gate</b><small>Blocks uncertain catalogue matching</small></article><Arrow /><article><b>Deterministic CLSL engine</b><small>Active + approved product, crop and issue mappings only</small></article></div></section>
        <section><header><span>AUTOMATIC EVALUATION</span><h3>Three independent diagnoses</h3></header><div className="architecture-stack"><article><b>Gemini 3.5 Flash-Lite</b><small>Fast background evaluator using the same retained evidence</small></article><Arrow /><article><b>Qwen 3.5 9B</b><small>Private Ollama GPU evaluator through the VPC</small></article><Arrow /><article><b>2-of-3 majority gate</b><small>Waits for Gemma, Flash-Lite and Qwen; checks confidence, category, issue similarity and severity</small></article></div></section>
        <section><header><span>CONTINUOUS MODEL DELIVERY</span><h3>Dataset → tune → validate → promote</h3></header><div className="architecture-stack"><article><b>Private S3 manifest</b><small>Eligible labels reference retained crop images without exposing them publicly</small></article><Arrow /><article><b>GPU training connector</b><small>Starts a new version when the batch threshold is reached</small></article><Arrow /><article><b>Metric-gated deployment</b><small>Promotes only when validation gates pass and no production regression is detected</small></article></div></section>
      </div>

      <section className="architecture-security"><div><span>NETWORK BOUNDARY</span><b>PostgreSQL, FastAPI, application ports, Ollama and training endpoints are private services.</b></div><div><span>DATA BOUNDARY</span><b>Photos remain in private S3; the training manifest stores controlled object references and an auditable dataset version.</b></div><div><span>MODEL BOUNDARY</span><b>Automatic evaluation and fine-tuning never bypass CLSL product approval or dosage rules.</b></div></section>
    </div>}
  </div>;
}
