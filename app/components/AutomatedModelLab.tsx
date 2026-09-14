'use client';

/* eslint-disable @typescript-eslint/no-explicit-any -- Operational telemetry is returned as capability-shaped JSON. */

import { useMemo, useState, type ReactNode } from 'react';

type Action = 'dispatch' | 'retry_failed' | 'train_now' | 'refresh_metrics';
type Props = { data: any; canControl: boolean; onRefresh: () => Promise<void> };
type Series = { name: string; color: string; dashed?: boolean; values: Array<{ label: string; value: number }> };

const pct = (value: unknown) => value == null ? '—' : `${Number(value).toFixed(1)}%`;
const confidence = (value: unknown) => value == null ? '—' : `${Math.round(Number(value) * 100)}%`;
const duration = (value: unknown) => value ? `${(Number(value) / 1000).toFixed(1)}s` : '—';
const displayDate = (value?: string) => value ? new Date(value).toLocaleString() : 'Not recorded';
const label = (value: unknown) => String(value || 'unknown').replaceAll('_', ' ');
const clamp = (value: number) => Math.max(0, Math.min(100, value));

function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'slate' }) {
  return <span className={`admin-badge ${tone}`}>{children}</span>;
}

function Metric({ title, value, note, tone = '' }: { title: string; value: ReactNode; note: string; tone?: string }) {
  return <article className={`admin-metric ${tone}`}><p>{title}</p><strong>{value}</strong><small>{note}</small></article>;
}

function LineChart({ title, subtitle, series }: { title: string; subtitle: string; series: Series[] }) {
  const width = 760, height = 250, left = 48, right = 18, top = 24, bottom = 38;
  const labels = series.reduce<string[]>((all, item) => {
    item.values.forEach((point) => { if (!all.includes(point.label)) all.push(point.label); }); return all;
  }, []);
  const x = (index: number) => left + index * (width - left - right) / Math.max(1, labels.length - 1);
  const y = (value: number) => top + (100 - clamp(value)) * (height - top - bottom) / 100;
  return <section className="admin-panel automation-chart"><header><div><p className="admin-overline">Performance graph</p><h3>{title}</h3><p>{subtitle}</p></div><div className="chart-legend">{series.map((item) => <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>)}</div></header>
    {labels.length ? <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
      {[0, 25, 50, 75, 100].map((tick) => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="chart-grid" /><text x={left - 9} y={y(tick) + 4} textAnchor="end">{tick}%</text></g>)}
      {series.map((item) => {
        const points = item.values.map((point) => `${x(labels.indexOf(point.label))},${y(point.value)}`).join(' ');
        return <g key={item.name}><polyline points={points} fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={item.dashed ? '8 7' : undefined} />{item.values.map((point) => <circle key={`${item.name}-${point.label}`} cx={x(labels.indexOf(point.label))} cy={y(point.value)} r="4" fill={item.color}><title>{item.name}: {point.value.toFixed(1)}% on {point.label}</title></circle>)}</g>;
      })}
      {labels.map((item, index) => <text key={item} x={x(index)} y={height - 12} textAnchor="middle">{item}</text>)}
    </svg> : <p className="admin-empty">The first completed Qwen evaluations will create this graph.</p>}
  </section>;
}

function qwenForecast(history: any[]) {
  const actual = history.filter((item) => item.provider === 'qwen' && item.agreement_percent != null)
    .map((item) => ({ label: String(item.day).slice(5), value: Number(item.agreement_percent) }));
  if (!actual.length) return { actual, forecast: [] as Array<{ label: string; value: number }>, direction: 'Waiting for evaluation history' };
  const values = actual.map((point) => point.value); const n = values.length;
  const meanX = (n - 1) / 2; const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  const denominator = values.reduce((sum, _value, index) => sum + ((index - meanX) ** 2), 0);
  const slope = denominator ? values.reduce((sum, value, index) => sum + (index - meanX) * (value - meanY), 0) / denominator : 0;
  const lastDate = new Date(`${String(history.filter((item) => item.provider === 'qwen').at(-1)?.day).slice(0, 10)}T00:00:00Z`);
  const forecast = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(lastDate); day.setUTCDate(day.getUTCDate() + index + 1);
    return { label: day.toISOString().slice(5, 10), value: clamp(values.at(-1)! + slope * (index + 1)) };
  });
  return { actual, forecast, direction: n < 3 ? 'Early estimate—more days are required' : slope > 0.4 ? 'Improving trend' : slope < -0.4 ? 'Declining trend' : 'Stable trend' };
}

export default function AutomatedModelLab({ data, canControl, onRefresh }: Props) {
  const [tab, setTab] = useState<'operations' | 'cases' | 'training' | 'versions'>('operations');
  const [busy, setBusy] = useState<Action | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const qwen = data?.qwen || {}; const queue = qwen.queue || {}; const runtime = qwen.runtime || {};
  const gemini = data?.gemini || {}; const geminiQueue = gemini.queue || {}; const geminiRuntime = gemini.runtime || {};
  const automation = data?.automation || {}; const candidates = data?.candidate_summary || {};
  const dataset = data?.dataset || {}; const history = useMemo(() => data?.performance_history || [], [data?.performance_history]);
  const jobs = data?.qwen?.jobs || []; const runs = data?.training_runs || []; const events = data?.training_events || [];
  const versions = data?.model_versions || []; const pipeline = data?.pipeline || {};
  const forecast = useMemo(() => qwenForecast(history), [history]);
  const qwenOnline = qwen.health?.status === 'available';
  const runtimeAge = runtime.updated_at ? Date.now() - new Date(runtime.updated_at).getTime() : Number.POSITIVE_INFINITY;
  const qwenWorkerActive = ['warming', 'processing', 'idle'].includes(runtime.status) && runtimeAge < 120_000;
  const qwenStatusText = !qwenOnline
    ? 'GPU unavailable · queue retained'
    : qwenWorkerActive
      ? `GPU online · worker ${label(runtime.status)}`
      : Number(queue.waiting)
        ? 'GPU online · worker needs restart'
        : 'GPU online · worker heartbeat stale';
  const latestRun = runs[0]; const activeRun = runs.find((run: any) => ['queued', 'preparing', 'training', 'evaluating'].includes(run.status));
  const historyByProvider = (provider: string, field: string) => history.filter((item: any) => item.provider === provider && item[field] != null).map((item: any) => ({ label: String(item.day).slice(5), value: Number(item[field]) }));
  const execute = async (action: Action) => {
    setBusy(action); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/portal/models/automation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const body = await response.json().catch(() => ({})) as any;
      if (!response.ok) throw new Error(body.detail || body.error || 'Automation command failed.');
      const training = body.training || {};
      setMessage(action === 'dispatch' ? `${body.queue?.new_jobs || 0} missing inspections queued. The worker will send them as soon as the GPU answers.` : action === 'retry_failed' ? `${body.queue?.retried_jobs || 0} failed cases returned to the automatic queue.` : action === 'train_now' ? training.started ? `Training run ${training.dataset_version} started.` : `Training did not start: ${label(training.reason)}.` : 'Metrics and automatic candidates refreshed.');
      await onRefresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Automation command failed.'); }
    finally { setBusy(''); }
  };

  return <div className="admin-content automated-model-lab">
    <div className="admin-list-toolbar"><div><p className="admin-overline">Continuous model operations</p><h2>Three-model image intelligence pipeline</h2><p>Gemma gives the immediate field result. Gemini 3.5 Flash-Lite and private Qwen evaluate the same retained evidence independently. Only a 2-of-3 or 3-of-3 majority can create an automatic training label.</p></div><Badge tone={qwenOnline && qwenWorkerActive ? 'green' : 'amber'}>{qwenStatusText}</Badge></div>
    <section className="automation-policy"><b>Always-on processing policy</b><span>If the GPU is reachable, the queue runs immediately—even outside the scheduled 8 PM start. The schedule is only a fallback that starts the instance.</span></section>
    {(message || error) && <div className={`admin-message ${error ? 'error' : 'success'}`}><span>{error ? '!' : '✓'}</span>{error || message}</div>}
    <nav className="model-lab-tabs" aria-label="Model lab sections">{([['operations','Live operations'],['cases','Inspection comparison'],['training','Fine-tuning'],['versions','Versions & forecast']] as const).map(([key, text]) => <button key={key} className={tab === key ? 'selected' : ''} onClick={() => setTab(key)}>{text}</button>)}</nav>

    {tab === 'operations' && <>
      <div className="admin-metric-grid"><Metric title="Flash-Lite queue" value={geminiQueue.waiting || 0} note={`${geminiQueue.completed || 0} completed · ${geminiQueue.failed || 0} failed`} tone={Number(geminiQueue.waiting) ? 'amber' : 'green'} /><Metric title="Waiting for Qwen" value={queue.waiting || 0} note={qwenWorkerActive ? `${queue.processing || 0} processing now` : qwenOnline ? 'GPU reachable; worker is not active' : 'Retained until GPU returns'} tone={Number(queue.waiting) ? 'amber' : 'green'} /><Metric title="Qwen completed" value={queue.completed || 0} note={`${queue.failed || 0} failures`} /><Metric title="2-of-3 candidates" value={candidates.eligible || 0} note={`${candidates.waiting_models || 0} waiting for all models`} tone="green" /><Metric title="Training state" value={activeRun ? label(activeRun.status) : 'Watching'} note={activeRun ? `${activeRun.progress_percent || 0}% complete` : 'Starts at the batch threshold'} /></div>
      <section className="admin-panel automation-control"><header><div><p className="admin-overline">Queue controls</p><h3>Pass photos through the pipeline</h3><p>Automatic dispatch is active. {canControl ? 'These controls scan for missing Flash-Lite and Qwen jobs immediately.' : 'Immediate controls are restricted to the Super Administrator.'}</p></div>{canControl && <div className="automation-actions"><button className="admin-primary" disabled={Boolean(busy)} onClick={() => void execute('dispatch')}>{busy === 'dispatch' ? 'Scanning…' : 'Pass pending photos now'}</button><button className="admin-secondary" disabled={Boolean(busy)} onClick={() => void execute('retry_failed')}>{busy === 'retry_failed' ? 'Re-queuing…' : 'Retry failed cases'}</button><button className="admin-secondary" disabled={Boolean(busy)} onClick={() => void execute('refresh_metrics')}>Refresh quality metrics</button></div>}</header><div className="automation-stage-flow"><article className="complete"><i>1</i><b>Gemma live + S3</b><small>{dataset.retained_images || 0} retained images</small></article><span>→</span><article className={Number(geminiQueue.waiting) || Number(geminiQueue.processing) ? 'current' : 'complete'}><i>2</i><b>Flash-Lite shadow</b><small>{geminiQueue.waiting || 0} queued · {geminiQueue.processing || 0} active</small></article><span>→</span><article className={Number(queue.waiting) || Number(queue.processing) ? 'current' : 'complete'}><i>3</i><b>Qwen GPU shadow</b><small>{queue.waiting || 0} queued · {queue.processing || 0} active</small></article><span>→</span><article className={Number(candidates.eligible) ? 'complete' : ''}><i>4</i><b>2-of-3 majority</b><small>{candidates.eligible || 0} eligible · {candidates.excluded || 0} excluded</small></article><span>→</span><article className={activeRun ? 'current' : ''}><i>5</i><b>Tune & validate</b><small>{activeRun ? `${activeRun.progress_percent || 0}%` : `At ${automation.minimum_new_cases || 20} cases`}</small></article><span>→</span><article className={versions.some((item: any) => item.lifecycle_stage === 'production') ? 'complete' : ''}><i>6</i><b>Metric-gated deploy</b><small>No regression allowed</small></article></div></section>
      <div className="admin-two-column"><section className="admin-panel automation-runtime"><p className="admin-overline">Worker heartbeats</p><h3>Independent evaluators</h3><dl><div><dt>Flash-Lite</dt><dd>{label(geminiRuntime?.status || (gemini.enabled ? 'initialising' : 'disabled'))} · {displayDate(geminiRuntime?.updated_at)}</dd></div><div><dt>Qwen GPU</dt><dd>{label(runtime.status || 'initialising')} · {displayDate(runtime.updated_at)}</dd></div><div><dt>Queue policy</dt><dd>Run whenever reachable</dd></div><div><dt>Training connector</dt><dd>{automation.training_connector_configured ? 'Connected' : 'Not connected'}</dd></div></dl></section><section className="admin-panel automation-rules"><p className="admin-overline">Automatic dataset rules</p><h3>What enters fine-tuning</h3><ul><li>All three independent model results must be complete.</li><li>At least two models must agree on issue category, issue name and severity.</li><li>Issue-name similarity for the agreeing pair must be ≥ {Math.round(Number(automation.minimum_issue_similarity || .55) * 100)}%.</li><li>Both agreeing confidence values must be ≥ {Math.round(Number(automation.minimum_confidence || .7) * 100)}% and neither may request more information.</li><li>Declared crop and retained private S3 evidence are required.</li></ul></section></div>
      <LineChart title="Model confidence over time" subtitle="Self-reported confidence is shown for monitoring; it is not measured diagnostic accuracy." series={[{ name: 'Gemma live', color: '#064878', values: historyByProvider('gemma','confidence_percent') }, { name: 'Flash-Lite shadow', color: '#7c3aed', values: historyByProvider('gemini','confidence_percent') }, { name: 'Qwen GPU', color: '#f2994a', values: historyByProvider('qwen','confidence_percent') }]} />
    </>}

    {tab === 'cases' && <>
      <div className="admin-metric-grid"><Metric title="Total inspections" value={dataset.total_inspections || 0} note="Persisted cases" /><Metric title="Three-model results" value={dataset.three_model_evaluations || 0} note="Gemma + Flash-Lite + Qwen complete" /><Metric title="Passed 2-of-3 gate" value={dataset.automatic_training_cases || 0} note="Automatic training candidates" tone="green" /><Metric title="Rejected by gate" value={dataset.quality_gate_rejections || 0} note="Kept out of training" tone="amber" /></div>
      <section className="admin-panel model-case-table"><header><div><p className="admin-overline">Per-inspection model comparison</p><h3>Gemma + Flash-Lite + Qwen</h3></div><Badge>{jobs.length} recent cases</Badge></header><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Inspection</th><th>Gemma live</th><th>Flash-Lite shadow</th><th>Qwen GPU</th><th>Confidence G / F / Q</th><th>Majority result</th></tr></thead><tbody>{jobs.map((item: any) => <tr key={item.id}><td><b>{item.declared_crop || 'Crop not supplied'}</b><small>{item.employee_name || 'General user'} · {String(item.inspection_id).slice(0,8)}</small><small>{displayDate(item.created_at)}</small></td><td><b>{item.gemma_issue || '—'}</b><small>{label(item.gemma_issue_type)} · {item.gemma_model || '—'}</small></td><td><b>{item.gemini_issue || item.gemini_last_error || 'Pending'}</b><small>{label(item.gemini_issue_type)} · {item.gemini_model || label(item.gemini_status)}</small></td><td><b>{item.qwen_issue || item.last_error || 'Pending'}</b><small>{label(item.qwen_issue_type)} · {item.qwen_model || label(item.status)}</small></td><td><b>{confidence(item.gemma_confidence)} / {confidence(item.gemini_confidence)} / {confidence(item.qwen_confidence)}</b><small>{duration(item.gemini_latency_ms)} Flash · {duration(item.latency_ms)} Qwen</small></td><td><Badge tone={item.agreement_count >= 2 ? 'green' : item.consensus_status === 'all_disagree' ? 'red' : 'amber'}>{label(item.consensus_status || 'awaiting_models')}</Badge><small>{item.agreement_count >= 2 ? `${item.agreement_count}/3 · ${item.consensus_issue_name || item.consensus_issue_type || 'majority'}` : 'No automatic label yet'}</small></td></tr>)}</tbody></table></div>{!jobs.length && <p className="admin-empty">New persisted inspections will enter both evaluation queues automatically.</p>}</section>
      <section className="admin-panel model-case-table"><header><div><p className="admin-overline">Automatic training dataset</p><h3>2-of-3 quality-gated candidates</h3></div><Badge tone="green">No lengthy manual queue</Badge></header><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Case</th><th>Majority label</th><th>Confidence G / F / Q</th><th>Majority quality</th><th>Pipeline status</th></tr></thead><tbody>{(data.candidates || []).map((item: any) => <tr key={item.inspection_id}><td><b>{item.crop_text || '—'}</b><small>{item.employee_name || 'General user'} · {String(item.inspection_id).slice(0,8)}</small></td><td><b>{item.issue_name || 'Waiting for majority'}</b><small>{label(item.issue_type)} · {label(item.severity)}</small></td><td><b>{confidence(item.gemma_confidence)} / {confidence(item.gemini_confidence)} / {confidence(item.qwen_confidence)}</b><small>{Math.round(Number(item.issue_name_similarity || 0) * 100)}% pair similarity</small></td><td><b>{item.majority_count ? `${item.majority_count}/3` : '—'}</b><small>{(item.agreeing_providers || []).map(label).join(' + ') || 'Awaiting all models'} · {Math.round(Number(item.quality_score || 0) * 100)}%</small></td><td><Badge tone={item.candidate_status === 'eligible' || item.candidate_status === 'used' ? 'green' : item.candidate_status === 'excluded' ? 'red' : 'slate'}>{label(item.candidate_status)}</Badge><small>{item.exclusion_reason || 'Passed automatic majority gates'}</small></td></tr>)}</tbody></table></div></section>
    </>}

    {tab === 'training' && <>
      <section className="admin-panel training-command"><div><p className="admin-overline">Continuous fine-tuning</p><h3>{activeRun ? `${label(activeRun.status)} · ${activeRun.run_name}` : 'Pipeline watching for the next batch'}</h3><p>{automation.training_connector_configured ? 'The private GPU training connector is configured. New batches start automatically whenever the connector is healthy.' : 'Evaluation runs automatically, but real fine-tuning cannot start until the private GPU training service is connected.'}</p></div>{canControl && <button className="admin-primary" disabled={Boolean(busy) || !automation.training_connector_configured} onClick={() => void execute('train_now')}>{busy === 'train_now' ? 'Starting…' : 'Start eligible batch now'}</button>}</section>
      <div className="admin-metric-grid"><Metric title="Current progress" value={`${Number(activeRun?.progress_percent || latestRun?.progress_percent || 0).toFixed(0)}%`} note={activeRun ? label(activeRun.status) : 'No active run'} /><Metric title="Train loss" value={activeRun?.train_loss ?? latestRun?.train_loss ?? '—'} note="Lower is normally better" /><Metric title="Validation accuracy" value={pct((activeRun?.validation_accuracy ?? latestRun?.validation_accuracy) != null ? Number(activeRun?.validation_accuracy ?? latestRun?.validation_accuracy) * 100 : null)} note={`Gate ≥ ${Math.round(Number(automation.promotion_gates?.validation_accuracy || .78) * 100)}%`} /><Metric title="Macro F1" value={pct((activeRun?.validation_macro_f1 ?? latestRun?.validation_macro_f1) != null ? Number(activeRun?.validation_macro_f1 ?? latestRun?.validation_macro_f1) * 100 : null)} note={`Gate ≥ ${Math.round(Number(automation.promotion_gates?.macro_f1 || .72) * 100)}%`} /></div>
      <section className="admin-panel training-progress-visual"><header><div><p className="admin-overline">Active run</p><h3>{activeRun?.run_name || latestRun?.run_name || 'No training run recorded'}</h3></div><Badge tone={activeRun ? 'amber' : latestRun?.deployment_status === 'deployed' ? 'green' : 'slate'}>{activeRun ? label(activeRun.status) : label(latestRun?.deployment_status || 'waiting')}</Badge></header><div className="training-progress-track"><i style={{ width: `${Math.min(100, Number(activeRun?.progress_percent || latestRun?.progress_percent || 0))}%` }} /></div><div className="training-stage-labels"><span>Dataset</span><span>LoRA tuning</span><span>Validation</span><span>Quality gate</span><span>Deploy</span></div></section>
      <section className="admin-panel admin-training-runs"><header><div><p className="admin-overline">Run history</p><h3>Fine-tuning and deployment ledger</h3></div><Badge>{runs.length} runs</Badge></header>{runs.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Run / dataset</th><th>Examples</th><th>Progress / loss</th><th>Validation</th><th>Promotion gates</th><th>Deployment</th></tr></thead><tbody>{runs.map((run: any) => <tr key={run.id}><td><b>{run.run_name}</b><small>{run.dataset_version || '—'} · {displayDate(run.created_at)}</small></td><td><b>{run.training_examples} train / {run.validation_examples} holdout</b><small>{run.training_images} images</small></td><td><b>{Number(run.progress_percent || 0).toFixed(0)}%</b><small>loss {run.train_loss ?? '—'} · validation {run.validation_loss ?? '—'}</small></td><td><b>{run.validation_accuracy != null ? `${Math.round(Number(run.validation_accuracy) * 100)}%` : '—'}</b><small>F1 {run.validation_macro_f1 != null ? Number(run.validation_macro_f1).toFixed(3) : '—'} · issue {run.issue_accuracy != null ? `${Math.round(Number(run.issue_accuracy) * 100)}%` : '—'}</small></td><td><Badge tone={run.promotion_status === 'passed' ? 'green' : run.promotion_status === 'failed' ? 'red' : 'slate'}>{label(run.promotion_status)}</Badge><small>{Object.entries(run.quality_gate_json || {}).filter(([,passed]) => !passed).map(([key]) => label(key)).join(', ') || 'Awaiting evaluation'}</small></td><td><Badge tone={run.deployment_status === 'deployed' ? 'green' : 'slate'}>{label(run.deployment_status)}</Badge><small>{run.candidate_model || run.error_message || 'No candidate yet'}</small></td></tr>)}</tbody></table></div> : <p className="admin-empty">No real training run has started. The dashboard will never display invented progress.</p>}</section>
      <section className="admin-panel training-events"><header><div><p className="admin-overline">Live event stream</p><h3>What happened during fine-tuning</h3></div><Badge>{events.length} events</Badge></header>{events.length ? <ol>{events.slice(0,40).map((event: any) => <li key={event.id}><i /><div><b>{label(event.event_type)} · {label(event.stage)}</b><p>{event.message || `Progress ${event.progress_percent ?? '—'}% · train loss ${event.train_loss ?? '—'} · validation loss ${event.validation_loss ?? '—'}`}</p><small>{displayDate(event.created_at)} · {event.run_name || 'pipeline'}</small></div></li>)}</ol> : <p className="admin-empty">Training events will appear as soon as the GPU training connector accepts a batch.</p>}</section>
    </>}

    {tab === 'versions' && <>
      <div className="admin-two-column"><section className="admin-panel version-summary"><p className="admin-overline">Qwen evolution</p><h3>Earlier → current → next</h3><div className="version-flow">{versions.length ? versions.slice().reverse().map((item: any, index: number) => <div key={item.id}><article><span>{label(item.lifecycle_stage)}</span><b>{item.model_name}</b><small>{item.version_label}</small><em>{item.metrics?.validation_accuracy != null ? `${Math.round(Number(item.metrics.validation_accuracy) * 100)}% validation` : index === 0 ? 'Initial baseline' : 'Metrics pending'}</em></article>{index < versions.length - 1 && <i>→</i>}</div>) : <p>No versions recorded.</p>}</div></section><section className="admin-panel promotion-rules"><p className="admin-overline">Automatic deployment guard</p><h3>Candidate promotion rules</h3><dl><div><dt>Validation accuracy</dt><dd>≥ {Math.round(Number(automation.promotion_gates?.validation_accuracy || .78) * 100)}%</dd></div><div><dt>Macro F1</dt><dd>≥ {Math.round(Number(automation.promotion_gates?.macro_f1 || .72) * 100)}%</dd></div><div><dt>Issue accuracy</dt><dd>≥ {Math.round(Number(automation.promotion_gates?.issue_accuracy || .75) * 100)}%</dd></div><div><dt>Regression</dt><dd>Must not be worse than production</dd></div></dl></section></div>
      <LineChart title="Qwen agreement history and seven-day projection" subtitle={`${forecast.direction}. The dashed line is a linear operational estimate, not guaranteed future accuracy.`} series={[{ name: 'Observed agreement', color: '#064878', values: forecast.actual }, { name: 'Projected trend', color: '#f2994a', dashed: true, values: forecast.forecast }]} />
      <LineChart title="Success-rate comparison" subtitle="Daily completion rate for all three independent diagnostic models." series={[{ name: 'Gemma live', color: '#064878', values: historyByProvider('gemma','success_rate_percent') }, { name: 'Flash-Lite shadow', color: '#7c3aed', values: historyByProvider('gemini','success_rate_percent') }, { name: 'Qwen GPU', color: '#f2994a', values: historyByProvider('qwen','success_rate_percent') }]} />
      <section className="admin-panel pipeline-state"><p className="admin-overline">Continuous integration / continuous deployment</p><h3>Latest orchestration state</h3><dl><div><dt>Worker</dt><dd>{label(pipeline.worker_status)}</dd></div><div><dt>GPU</dt><dd>{label(qwen.health?.status)}</dd></div><div><dt>Connector</dt><dd>{label(pipeline.connector_status)}</dd></div><div><dt>Last queue sync</dt><dd>{displayDate(pipeline.last_queue_sync_at)}</dd></div><div><dt>Last training check</dt><dd>{displayDate(pipeline.last_training_check_at)}</dd></div><div><dt>Active run</dt><dd>{pipeline.active_run_id ? String(pipeline.active_run_id).slice(0,8) : 'None'}</dd></div></dl></section>
    </>}
    <p className="admin-model-disclaimer">Safety boundary: the automatic model pipeline can evaluate crop images and improve the private model. It cannot activate a CLSL product, invent a dose, change a crop registration or bypass the approved catalogue engine.</p>
  </div>;
}
