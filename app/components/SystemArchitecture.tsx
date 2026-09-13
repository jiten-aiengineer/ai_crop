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
        <article><i>2</i><div><b>Crop Life AI examines the problem</b><p>Gemma provides the immediate probable diagnosis.</p></div></article><Arrow />
        <article><i>3</i><div><b>Approved CLSL products are matched</b><p>Only active, approved catalogue products registered for that crop and issue can appear.</p></div></article><Arrow />
        <article><i>4</i><div><b>The result is shown</b><p>The employee receives the assessment, next steps and relevant company products.</p></div></article>
      </section>
      <section className="architecture-simple-grid">
        <article><span>Behind the scenes</span><h3>Two more models check the same evidence</h3><p>Gemini 3.5 Flash-Lite and private Qwen evaluate the photos in the background. Their answers never silently change the result already shown.</p></article>
        <article><span>Human control</span><h3>Experts create the trusted answer</h3><p>A reviewer checks the photos and model outputs. A senior manager validates the label, and the Super Administrator decides whether it can enter the future training dataset.</p></article>
        <article><span>Company knowledge</span><h3>Catalogue changes stay controlled</h3><p>Product edits pass through approval. Once finally published, the same approved record becomes available to crop inspection, catalogue search and Crop Life Mitra.</p></article>
      </section>
      <aside className="architecture-safety"><b>Important safety rule</b><p>AI diagnoses the visible crop problem. AI does not invent or independently approve products, doses or crop registrations.</p></aside>
    </div> : <div className="architecture-technical">
      <section className="architecture-tech-flow" aria-label="Technical request and evaluation architecture">
        <div className="architecture-layer"><span>CLIENT</span><article><b>Responsive PWA</b><small>Camera, gallery upload, field session, multilingual UI and Crop Life Mitra</small></article></div><Arrow />
        <div className="architecture-layer"><span>EDGE</span><article><b>Nginx + HTTPS</b><small>DuckDNS TLS endpoint, public application routing and private admin route</small></article></div><Arrow />
        <div className="architecture-layer"><span>APPLICATION</span><article><b>Next.js / Vinext</b><small>Server routes, session BFF, image validation, S3 upload and farmer response</small></article></div><Arrow />
        <div className="architecture-layer"><span>CORE API</span><article><b>FastAPI</b><small>Persistence, catalogue governance, role checks, field reporting, review workflow and model metrics</small></article></div>
      </section>

      <div className="architecture-tech-grid">
        <section><header><span>LIVE INFERENCE</span><h3>Farmer response path</h3></header><div className="architecture-stack"><article><b>Gemma 4 26B</b><small>Primary multimodal diagnosis</small></article><Arrow /><article><b>Confidence and evidence gate</b><small>Blocks uncertain catalogue matching</small></article><Arrow /><article><b>Deterministic CLSL engine</b><small>Active + approved product, crop and issue mappings only</small></article></div></section>
        <section><header><span>SHADOW EVALUATION</span><h3>Independent comparison path</h3></header><div className="architecture-parallel"><article><b>Gemini 3.5 Flash-Lite</b><small>Fast asynchronous shadow worker</small></article><article><b>Qwen 3.5 9B</b><small>Ollama on private GPU through VPC port 11434</small></article></div><div className="architecture-down">↓</div><article className="architecture-centre-node"><b>Three-model consensus</b><small>Administrative evaluation only</small></article></section>
        <section><header><span>DATA & GOVERNANCE</span><h3>Private operational foundation</h3></header><div className="architecture-parallel"><article><b>PostgreSQL</b><small>Employees, products, inspections, predictions, workflow and audit records</small></article><article><b>Private S3</b><small>Retained crop evidence and product images through IAM</small></article></div><div className="architecture-down">↓</div><article className="architecture-centre-node"><b>Expert → Senior → Final approval</b><small>Only final-approved cases become training eligible</small></article></section>
      </div>

      <section className="architecture-security"><div><span>NETWORK BOUNDARY</span><b>PostgreSQL, FastAPI, application ports and Ollama are not public services.</b></div><div><span>IDENTITY BOUNDARY</span><b>The browser uses the admin BFF; backend admin calls require the trusted gateway and employee role.</b></div><div><span>MODEL BOUNDARY</span><b>Consensus, confidence and future training never bypass CLSL catalogue approval rules.</b></div></section>
    </div>}
  </div>;
}
