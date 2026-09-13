'use client';

/* eslint-disable @typescript-eslint/no-explicit-any, @next/next/no-img-element -- The review workspace renders capability-shaped API records and authenticated S3 image routes. */

import { FormEvent, useMemo, useState } from 'react';

type ReviewPayload = {
  review_outcome: 'correct' | 'partially_correct' | 'incorrect' | 'corrected' | 'rejected_unusable';
  expert_crop: string;
  expert_issue_type: string;
  expert_issue_name: string;
  expert_severity: string;
  notes: string;
  image_quality_sufficient: boolean;
  privacy_cleared: boolean;
  training_eligible: boolean;
};

type Props = {
  items: any[];
  crops: string[];
  canReview: boolean;
  canValidate: boolean;
  canFinalApprove: boolean;
  onReview: (inspectionId: string, payload: ReviewPayload) => Promise<void>;
  onDecision: (inspectionId: string, decision: 'validate' | 'reject' | 'final_approve', note: string) => Promise<void>;
};

const issueTypes = [
  ['none', 'Healthy / no issue'], ['insect_pest', 'Insect pest'], ['fungal_disease', 'Fungal disease'],
  ['bacterial_disease', 'Bacterial disease'], ['viral_disease', 'Viral disease'], ['weed_problem', 'Weed problem'],
  ['nutrient_deficiency', 'Nutrient deficiency'], ['abiotic_stress', 'Weather / abiotic stress'], ['unknown', 'Unknown'],
] as const;
const severities = ['early', 'mild', 'moderate', 'severe', 'unknown'];
const workflowLabel: Record<string, string> = {
  pending_expert_review: 'Pending expert review', expert_reviewed: 'Awaiting senior validation',
  senior_validated: 'Awaiting final approval', final_approved: 'Training dataset approved', rejected: 'Rejected',
};
const displayDate = (value?: string) => value ? new Date(value).toLocaleString() : 'Not completed';
const statusFor = (item: any) => item.workflow_status || 'pending_expert_review';
const toneFor = (status: string) => status === 'final_approved' ? 'approved' : status === 'rejected' ? 'rejected' : status === 'pending_expert_review' ? 'pending' : 'reviewing';

function initialDraft(item: any): ReviewPayload {
  const predictions = Array.isArray(item.model_predictions) ? item.model_predictions : [];
  const primary = predictions.find((prediction: any) => prediction.provider === 'gemma') || {};
  const issueType = item.expert_issue_type || primary.issue_type || item.issue_type || 'unknown';
  return {
    review_outcome: item.review_outcome || 'correct',
    expert_crop: item.expert_crop_text || item.declared_crop_text || primary.crop || item.detected_crop || '',
    expert_issue_type: issueType,
    expert_issue_name: item.expert_issue_name || primary.issue_name || item.probable_issue || (issueType === 'none' ? 'Healthy / no issue' : ''),
    expert_severity: item.expert_severity || primary.severity || item.severity || 'unknown',
    notes: item.reviewer_notes || '',
    image_quality_sufficient: Boolean(item.image_quality_sufficient),
    privacy_cleared: Boolean(item.privacy_cleared),
    training_eligible: Boolean(item.requested_for_training || item.expert_training_eligible),
  };
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`review-status ${toneFor(status)}`}>{workflowLabel[status] || status.replaceAll('_', ' ')}</span>;
}

function ModelCard({ provider, prediction }: { provider: 'gemma' | 'gemini' | 'qwen'; prediction?: any }) {
  const labels = { gemma: 'Primary diagnosis', gemini: 'Flash-Lite shadow', qwen: 'Private GPU shadow' };
  const providerNames = { gemma: 'Gemma', gemini: 'Gemini 3.5 Flash-Lite', qwen: 'Qwen' };
  return <article className={`review-model-card ${provider}`}>
    <header><span>{labels[provider]}</span><b>{providerNames[provider]}</b></header>
    {prediction ? <>
      <h4>{prediction.issue_name || 'No issue name returned'}</h4>
      <dl>
        <div><dt>Crop</dt><dd>{prediction.crop || '—'}</dd></div>
        <div><dt>Category</dt><dd>{String(prediction.issue_type || 'unknown').replaceAll('_', ' ')}</dd></div>
        <div><dt>Severity</dt><dd>{prediction.severity || '—'}</dd></div>
        <div><dt>Confidence</dt><dd>{prediction.confidence != null ? `${Math.round(Number(prediction.confidence) * 100)}%` : '—'}</dd></div>
        <div><dt>Time</dt><dd>{prediction.latency_ms ? `${(Number(prediction.latency_ms) / 1000).toFixed(1)}s` : '—'}</dd></div>
      </dl>
      <p>{prediction.summary || 'No model summary recorded.'}</p>
    </> : <p className="review-empty-model">No result recorded yet.</p>}
  </article>;
}

export default function ExpertReview({ items, crops, canReview, canValidate, canFinalApprove, onReview, onDecision }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReviewPayload | null>(null);
  const [workflowNote, setWorkflowNote] = useState('');
  const [busy, setBusy] = useState('');
  const selected = items.find((item) => item.id === selectedId) || null;
  const counts = useMemo(() => ({
    pending: items.filter((item) => statusFor(item) === 'pending_expert_review').length,
    validation: items.filter((item) => statusFor(item) === 'expert_reviewed').length,
    final: items.filter((item) => statusFor(item) === 'senior_validated').length,
    approved: items.filter((item) => statusFor(item) === 'final_approved').length,
  }), [items]);
  const visible = useMemo(() => items.filter((item) => {
    const matchesStatus = filter === 'all' || statusFor(item) === filter;
    const haystack = `${item.employee_name || ''} ${item.employee_code || ''} ${item.declared_crop_text || ''} ${item.detected_crop || ''} ${item.probable_issue || ''} ${item.location_text || ''}`.toLowerCase();
    return matchesStatus && haystack.includes(query.toLowerCase());
  }), [filter, items, query]);

  const open = (item: any) => { setSelectedId(item.id); setDraft(initialDraft(item)); setWorkflowNote(''); };
  const close = () => { setSelectedId(null); setDraft(null); setWorkflowNote(''); };
  const change = <K extends keyof ReviewPayload>(key: K, value: ReviewPayload[K]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!selected || !draft) return; setBusy('review');
    try { await onReview(selected.id, draft); setDraft(null); setWorkflowNote(''); }
    catch { /* The portal-level banner contains the backend validation message. */ }
    finally { setBusy(''); }
  };
  const decide = async (decision: 'validate' | 'reject' | 'final_approve') => {
    if (!selected) return;
    if (decision === 'reject' && !workflowNote.trim()) return;
    setBusy(decision);
    try { await onDecision(selected.id, decision, workflowNote); setWorkflowNote(''); }
    catch { /* The portal-level banner contains the backend validation message. */ }
    finally { setBusy(''); }
  };

  if (selected) {
    const status = statusFor(selected);
    const predictions = Array.isArray(selected.model_predictions) ? selected.model_predictions : [];
    const byProvider = Object.fromEntries(predictions.map((prediction: any) => [prediction.provider, prediction]));
    const orders = Array.isArray(selected.image_orders) ? selected.image_orders : [];
    const candidateReady = Boolean(draft?.expert_crop && draft?.expert_issue_type && draft?.expert_issue_name && draft?.expert_severity && draft?.image_quality_sufficient && draft?.privacy_cleared && draft?.training_eligible && draft.review_outcome !== 'rejected_unusable');
    const steps = [
      { key: 'evidence', label: 'Field evidence', complete: true, meta: `${selected.photo_count || 0} photos received` },
      { key: 'expert', label: 'Expert review', complete: ['expert_reviewed', 'senior_validated', 'final_approved'].includes(status), meta: selected.reviewed_by_name ? `${selected.reviewed_by_name} · ${displayDate(selected.reviewed_at)}` : 'Awaiting reviewer' },
      { key: 'senior', label: 'Senior validation', complete: ['senior_validated', 'final_approved'].includes(status), meta: selected.validated_by_name ? `${selected.validated_by_name} · ${displayDate(selected.validated_at)}` : 'Not completed' },
      { key: 'final', label: 'Final dataset approval', complete: status === 'final_approved', meta: selected.final_approved_by_name ? `${selected.final_approved_by_name} · ${displayDate(selected.final_approved_at)}` : 'Super Administrator only' },
    ];
    return <div className="admin-content expert-review-workspace">
      <button className="admin-back" onClick={close}>← Review queue</button>
      <header className="review-case-header"><div><p className="admin-overline">Expert evidence review</p><h2>{selected.declared_crop_text || selected.detected_crop || 'Crop inspection'} <span>· {String(selected.id).slice(0, 8)}</span></h2><p>{selected.employee_name || 'General user'} · {displayDate(selected.created_at)} · {selected.location_text || 'Location not supplied'}</p></div><StatusBadge status={status} /></header>

      <section className="review-workflow" aria-label="Review workflow">
        {steps.map((step, index) => <div key={step.key} className={step.complete ? 'complete' : index === steps.findIndex((item) => !item.complete) ? 'current' : ''}><i>{step.complete ? '✓' : index + 1}</i><span><b>{step.label}</b><small>{step.meta}</small></span></div>)}
      </section>

      {status === 'rejected' && <div className="review-rejection"><b>Case rejected</b><span>{selected.rejection_note || 'No rejection reason was recorded.'}</span></div>}
      <section className="review-photo-panel"><header><div><p className="admin-overline">Private S3 evidence</p><h3>{orders.length} retained field photo{orders.length === 1 ? '' : 's'}</h3></div><span>Authenticated access only</span></header>{orders.length ? <div className="review-photo-grid">{orders.map((order: number) => <figure key={order}><a href={`/api/admin/inspection-images/${selected.id}/${order}`} target="_blank" rel="noreferrer"><img src={`/api/admin/inspection-images/${selected.id}/${order}`} alt={`Crop inspection evidence ${order}`} /></a><figcaption>Evidence {order}{order === 1 ? ' · whole crop' : order === 2 ? ' · affected part' : order === 3 ? ' · close-up' : order === 4 ? ' · alternate angle' : ''}</figcaption></figure>)}</div> : <p className="admin-empty">No retained photo is available for this inspection.</p>}</section>

      <section className="review-model-comparison"><div className="review-section-heading"><div><p className="admin-overline">Same photos · independent predictions</p><h3>Three-model comparison</h3></div><span>{selected.consensus_status ? String(selected.consensus_status).replaceAll('_', ' ') : 'Awaiting comparison'}</span></div><div className="review-model-grid"><ModelCard provider="gemma" prediction={byProvider.gemma} /><ModelCard provider="gemini" prediction={byProvider.gemini} /><ModelCard provider="qwen" prediction={byProvider.qwen} /></div><p className="review-governance-note">Model agreement is an evaluation signal only. The expert label below is the human reference; the active approved CLSL catalogue remains the only product authority.</p></section>

      {draft && <form className="review-form" onSubmit={submit}><header><div><p className="admin-overline">Human ground truth</p><h3>Record or correct the diagnosis</h3></div><span className={candidateReady ? 'candidate-ready' : ''}>{candidateReady ? 'Dataset candidate complete' : 'Dataset requirements incomplete'}</span></header><div className="review-form-grid">
        <label><span>Review outcome *</span><select value={draft.review_outcome} onChange={(event) => change('review_outcome', event.target.value as ReviewPayload['review_outcome'])}><option value="correct">Primary result correct</option><option value="partially_correct">Partially correct</option><option value="incorrect">Incorrect</option><option value="corrected">Corrected label supplied</option><option value="rejected_unusable">Reject — unusable evidence</option></select></label>
        <label><span>Verified crop *</span><input list="expert-review-crops" value={draft.expert_crop} onChange={(event) => change('expert_crop', event.target.value)} /><datalist id="expert-review-crops">{crops.map((crop) => <option key={crop} value={crop} />)}</datalist></label>
        <label><span>Verified issue category *</span><select value={draft.expert_issue_type} onChange={(event) => change('expert_issue_type', event.target.value)}>{issueTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Verified issue name *</span><input value={draft.expert_issue_name} onChange={(event) => change('expert_issue_name', event.target.value)} placeholder="For example: brown planthopper" /></label>
        <label><span>Verified severity *</span><select value={draft.expert_severity} onChange={(event) => change('expert_severity', event.target.value)}>{severities.map((severity) => <option key={severity}>{severity}</option>)}</select></label>
        <label className="review-notes"><span>Expert observations</span><textarea rows={4} value={draft.notes} onChange={(event) => change('notes', event.target.value)} placeholder="Visible symptoms, correction reason and evidence quality notes" /></label>
      </div><div className="review-checks"><label><input type="checkbox" checked={draft.image_quality_sufficient} onChange={(event) => change('image_quality_sufficient', event.target.checked)} /><span><b>Image quality sufficient</b><small>The photos clearly support this human label.</small></span></label><label><input type="checkbox" checked={draft.privacy_cleared} onChange={(event) => change('privacy_cleared', event.target.checked)} /><span><b>Privacy and permitted training use confirmed</b><small>No unsuitable personal information is visible.</small></span></label><label><input type="checkbox" checked={draft.training_eligible} onChange={(event) => change('training_eligible', event.target.checked)} /><span><b>Request inclusion in training dataset</b><small>Final inclusion still needs senior validation and Super Administrator approval.</small></span></label></div><footer><button type="button" className="admin-secondary" onClick={() => setDraft(null)}>Cancel editing</button><button type="submit" className="admin-primary" disabled={!canReview || busy === 'review'}>{busy === 'review' ? 'Saving review…' : status === 'pending_expert_review' ? 'Save expert review →' : 'Save revised review & restart approval'}</button></footer></form>}

      {!draft && canReview && <button className="admin-primary review-reopen" onClick={() => setDraft(initialDraft(selected))}>{status === 'pending_expert_review' ? 'Start expert review' : 'Edit expert label'}</button>}

      {['expert_reviewed', 'senior_validated'].includes(status) && <section className="review-decision-panel"><div><p className="admin-overline">Approval decision</p><h3>{status === 'expert_reviewed' ? 'Senior validation required' : 'Final dataset release required'}</h3><p>{status === 'expert_reviewed' ? 'Confirm that the expert label and evidence are suitable for final review.' : 'This final action marks the case training eligible and records retained photos as approved for the dataset.'}</p></div><label><span>Decision note {status === 'expert_reviewed' ? '(recommended)' : '(optional)'}</span><textarea rows={3} value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} placeholder="Record validation or rejection reasoning" /></label><footer>{(canValidate || canFinalApprove) && <button className="admin-secondary danger" disabled={!workflowNote.trim() || Boolean(busy)} onClick={() => void decide('reject')}>{busy === 'reject' ? 'Rejecting…' : 'Reject case'}</button>}{status === 'expert_reviewed' && canValidate && <button className="admin-primary" disabled={Boolean(busy)} onClick={() => void decide('validate')}>{busy === 'validate' ? 'Validating…' : 'Validate & send for final approval →'}</button>}{status === 'senior_validated' && canFinalApprove && <button className="admin-primary" disabled={Boolean(busy)} onClick={() => void decide('final_approve')}>{busy === 'final_approve' ? 'Approving…' : 'Approve for training dataset'}</button>}</footer></section>}
    </div>;
  }

  return <div className="admin-content expert-review-queue">
    <div className="admin-list-toolbar"><div><p className="admin-overline">Human verification & dataset governance</p><h2>Expert review queue</h2><p>Verify model diagnoses against private field evidence, then move suitable cases through senior validation and final dataset approval.</p></div><span className="review-role-note">Role-controlled workflow</span></div>
    <div className="admin-metric-grid"><article className="admin-metric amber"><p>Pending expert review</p><strong>{counts.pending}</strong><small>Needs human diagnosis</small></article><article className="admin-metric"><p>Awaiting validation</p><strong>{counts.validation}</strong><small>Senior reviewer action</small></article><article className="admin-metric"><p>Awaiting final approval</p><strong>{counts.final}</strong><small>Super Administrator action</small></article><article className="admin-metric green"><p>Dataset approved</p><strong>{counts.approved}</strong><small>Eligible for future training</small></article></div>
    <div className="admin-catalogue-filters"><label className="admin-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee, crop, issue or location" /></label><label className="admin-status-filter"><span>Review stage</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All stages</option><option value="pending_expert_review">Pending expert review</option><option value="expert_reviewed">Awaiting senior validation</option><option value="senior_validated">Awaiting final approval</option><option value="final_approved">Dataset approved</option><option value="rejected">Rejected</option></select></label></div>
    <div className="admin-table-wrap"><table className="admin-table review-queue-table"><thead><tr><th>Inspection</th><th>Declared crop / model issue</th><th>Evidence</th><th>Model comparison</th><th>Review stage</th><th>Action</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><b>{item.employee_name || 'General user'}</b><small>{item.employee_code || String(item.id).slice(0, 8)} · {displayDate(item.created_at)}</small><small>{item.location_text || 'Location not supplied'}</small></td><td><b>{item.declared_crop_text || item.detected_crop || 'Not supplied'}</b><small>{item.probable_issue || 'No probable issue recorded'}</small></td><td><b>{item.retained_images || 0} private photos</b><small>{item.photo_requirements_met ? 'Collection complete' : 'Partial evidence set'}</small></td><td><b>{Array.isArray(item.model_predictions) ? item.model_predictions.length : 0}/3 results</b><small>{item.consensus_status ? String(item.consensus_status).replaceAll('_', ' ') : 'Consensus pending'}</small></td><td><StatusBadge status={statusFor(item)} /></td><td><button className="admin-secondary" onClick={() => open(item)}>Open review →</button></td></tr>)}</tbody></table></div>
    {!visible.length && <p className="admin-empty">No inspections match this review filter.</p>}
  </div>;
}

export type { ReviewPayload };
