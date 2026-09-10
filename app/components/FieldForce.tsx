'use client';

import { useEffect, useState } from 'react';

type Officer = {
  id: string; employee_code: string; full_name: string; state: string; territory: string;
  location?: string; designation?: string; department?: string; reporting_manager_name?: string;
  office_email?: string; office_mobile?: string; personal_email?: string; personal_mobile?: string;
  hr_sync_state: 'new' | 'existing' | 'updated' | 'inactive'; employee_status: string;
  day_uploads: number; day_images: number; day_complete_sets: number;
  day_distinct_crops: number; day_distinct_problems: number; day_expert_approved: number; day_rejected: number;
  week_uploads: number; week_complete_sets: number; active_days_7: number; last_upload_at?: string;
  has_access_link: boolean; access_link_created_at?: string; access_link_last_used_at?: string;
};
type Report = { items: Officer[]; report_day?: string; anonymous_day_uploads: number };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/portal/${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const result = await response.json().catch(() => ({})) as { detail?: string; error?: string };
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : result.error || 'Unable to load the field report.');
  return result as T;
}

function statusFor(item: Officer) {
  if (Number(item.day_complete_sets) >= 2) return { label: 'Complete', tone: 'green' };
  if (Number(item.day_complete_sets) === 1) return { label: 'Below target', tone: 'amber' };
  return { label: 'No upload', tone: 'red' };
}

export default function FieldForce({ initialData, canManage = false }: { initialData?: Report; canManage?: boolean }) {
  const [data, setData] = useState<Report | undefined>(initialData);
  const [day, setDay] = useState(today); const [state, setState] = useState('');
  const [territory, setTerritory] = useState(''); const [mode, setMode] = useState('all');
  const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [accessLink, setAccessLink] = useState<{ name: string; url: string } | null>(null);
  useEffect(() => { if (initialData) setData(initialData); }, [initialData]);
  async function refresh(reportDay = day) {
    setBusy(true); setError('');
    try { setData(await request<Report>(`sales-officers?day=${encodeURIComponent(reportDay)}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Report unavailable.'); }
    finally { setBusy(false); }
  }
  const items = data?.items || [];
  const states = [...new Set(items.map((item) => item.state))].sort();
  const territories = [...new Set(items.filter((item) => !state || item.state === state).map((item) => item.territory))].sort();
  const visible = items.filter((item) => (!state || item.state === state) && (!territory || item.territory === territory)
    && `${item.full_name} ${item.employee_code} ${item.office_email || ''} ${item.office_mobile || ''}`.toLowerCase().includes(query.toLowerCase())
    && (mode === 'all' || mode === 'complete' && Number(item.day_complete_sets) >= 2
      || mode === 'below' && Number(item.day_complete_sets) === 1 || mode === 'missing' && Number(item.day_complete_sets) === 0
      || mode === 'link_pending' && !item.has_access_link || mode === 'link_generated' && item.has_access_link
      || mode === 'active_collectors' && Boolean(item.access_link_last_used_at) || mode === item.hr_sync_state));
  async function issueAccess(item: Officer) {
    const action = item.has_access_link ? 'Rotate the permanent link' : 'Create a permanent personal link';
    if (!window.confirm(`${action} for ${item.full_name}? ${item.has_access_link ? 'The previous link will stop working.' : 'It remains valid until an administrator revokes or rotates it.'}`)) return;
    try {
      const result = await request<{ token: string; name: string }>(`sales-officers/${item.id}/access`, { method: 'POST' });
      setAccessLink({ name: result.name, url: `${window.location.origin}/field/access?token=${encodeURIComponent(result.token)}` });
      await refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create access link.'); }
  }
  return <div className="admin-content">
    <div className="admin-list-toolbar"><div><p className="admin-overline">Employees · Confirmed Sales Officers</p><h2>Structured field collection</h2><p>Official HR identities only. Daily target: 2–3 complete inspections with four guided photos each. Reporting day: {data?.report_day || 'today'} (India time).</p></div><button className="admin-secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'Loading…' : 'Refresh report'}</button></div>
    {error && <p className="admin-message error" role="alert">{error}</p>}
    {accessLink && <section className="admin-panel field-link-panel"><h3>Permanent personal field link · {accessLink.name}</h3><p>Send this privately to the named officer. It personalises the installed PWA and attributes every field inspection until the link is rotated or revoked.</p><input className="field-link-input" aria-label="Personal field access link" readOnly value={accessLink.url} onFocus={(event) => event.target.select()} /><button className="admin-secondary" onClick={() => void navigator.clipboard.writeText(accessLink.url).catch(() => setError('Select the link above and copy it manually.'))}>Copy link</button><button className="admin-secondary" onClick={() => setAccessLink(null)}>Close</button></section>}
    <div className="admin-metric-grid">
      <article className="admin-metric"><p>Confirmed Sales Officers</p><strong>{items.length}</strong><small>{states.length} states · official employee records</small></article>
      <article className="admin-metric green"><p>Daily target complete</p><strong>{items.filter((item) => Number(item.day_complete_sets) >= 2).length}</strong><small>At least 2 valid four-photo inspections</small></article>
      <article className="admin-metric amber"><p>Below target</p><strong>{items.filter((item) => Number(item.day_complete_sets) === 1).length}</strong><small>One complete inspection</small></article>
      <article className="admin-metric"><p>No complete set</p><strong>{items.filter((item) => Number(item.day_complete_sets) === 0).length}</strong><small>{items.filter((item) => !item.has_access_link).length} links not generated · {data?.anonymous_day_uploads || 0} anonymous inspections</small></article>
    </div>
    <div className="field-report-filters">
      <label>Date (India)<input type="date" value={day} max={today()} onChange={(event) => { setDay(event.target.value); if (event.target.value) void refresh(event.target.value); }} /></label>
      <label>State<select value={state} onChange={(event) => { setState(event.target.value); setTerritory(''); }}><option value="">All states</option>{states.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Territory<select value={territory} onChange={(event) => setTerritory(event.target.value)}><option value="">All territories</option>{territories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Status<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="all">All officers</option><option value="complete">Daily target complete</option><option value="below">Below daily target</option><option value="missing">No complete set</option><option value="link_pending">Link not generated</option><option value="link_generated">Link generated</option><option value="active_collectors">Link used</option><option value="new">New HR employee</option><option value="updated">Updated HR employee</option><option value="inactive">Inactive / left</option></select></label>
    </div>
    <label className="admin-search"><span>⌕</span><input placeholder="Search official name, employee code, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="admin-table-wrap"><table className="admin-table field-force-table"><thead><tr><th>Official employee</th><th>Territory</th><th>Contact</th><th>Personal app</th><th>Today</th><th>Dataset quality</th><th>7-day activity</th><th>Daily status</th>{canManage && <th>Administrator</th>}</tr></thead><tbody>
      {visible.map((item) => { const daily = statusFor(item); return <tr key={item.id}><td><b>{item.full_name}</b><small>{item.employee_code}</small><small>{item.designation || 'Sales Officer'} · {item.department}</small><span className={`admin-badge ${item.hr_sync_state === 'new' ? 'green' : item.hr_sync_state === 'updated' ? 'amber' : item.hr_sync_state === 'inactive' ? 'red' : ''}`}>{item.hr_sync_state}</span></td><td><b>{item.territory}</b><small>{item.state}</small><small>HR: {item.location || 'Not recorded'}</small></td><td><small>{item.office_email || 'Work email not recorded'}</small><small>{item.office_mobile || item.personal_mobile || 'Phone not recorded'}</small><small>Reports to: {item.reporting_manager_name || 'Not recorded'}</small></td><td><span className={`admin-badge ${item.has_access_link ? 'green' : 'amber'}`}>{item.has_access_link ? 'Link generated' : 'Link pending'}</span><small>{item.access_link_last_used_at ? `Last opened ${new Date(item.access_link_last_used_at).toLocaleDateString('en-IN')}` : 'Not opened yet'}</small></td><td><b>{item.day_uploads} inspections · {item.day_images} images</b><small>{item.day_complete_sets} complete four-photo sets</small><small>{item.day_distinct_crops} crops · {item.day_distinct_problems} problems</small></td><td><b>{item.day_expert_approved} expert approved</b><small>{item.day_rejected} rejected / poor quality</small></td><td><b>{item.week_complete_sets} complete sets</b><small>{item.active_days_7}/7 active days</small><small>{item.last_upload_at ? `Last: ${new Date(item.last_upload_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'No inspection yet'}</small></td><td><span className={`admin-badge ${daily.tone}`}>{daily.label}</span></td>{canManage && <td><button className="admin-secondary" onClick={() => void issueAccess(item)}>{item.has_access_link ? 'Rotate link' : 'Create field link'}</button></td>}</tr>; })}
    </tbody></table></div>
    {!visible.length && <p className="admin-empty">No Sales Officers match the selected filters.</p>}
    <p className="admin-muted">The Sales Officer list is linked to the HR employee master by employee ID. Names and contact details shown here are never copied from a temporary roster.</p>
  </div>;
}
