'use client';

import { useEffect, useState } from 'react';

type Officer = {
  id: string; source_name: string; employee_code?: string; full_name?: string;
  state: string; territory: string; location?: string; designation?: string;
  department?: string; reporting_manager_name?: string; roles?: string[];
  office_email?: string; office_mobile?: string; personal_email?: string; personal_mobile?: string;
  employee_matched: boolean; day_uploads: number; week_uploads: number; last_upload_at?: string;
};
type Report = { items: Officer[]; report_day?: string; anonymous_day_uploads: number };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/portal/${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const result = await response.json().catch(() => ({})) as { detail?: string; error?: string };
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : result.error || 'Unable to load the field report.');
  return result as T;
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
    && `${item.source_name} ${item.full_name || ''} ${item.employee_code || ''} ${item.office_email || ''} ${item.office_mobile || ''}`.toLowerCase().includes(query.toLowerCase())
    && (mode === 'all' || mode === 'missing' && item.employee_matched && Number(item.day_uploads) === 0
      || mode === 'uploaded' && Number(item.day_uploads) > 0 || mode === 'unmatched' && !item.employee_matched));
  async function linkEmployee(item: Officer) {
    const code = window.prompt(`Employee code for ${item.source_name}, ${item.territory}. Check the Access & hierarchy directory first.`, item.employee_code || '');
    if (!code) return;
    try { await request(`sales-officers/${item.id}/employee`, { method: 'PUT', body: JSON.stringify({ employee_code: code.trim() }) }); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to link employee.'); }
  }
  async function issueAccess(item: Officer) {
    if (!window.confirm(`Create a 30-day personal field access link for ${item.full_name || item.source_name}? Any older link for this employee will stop working.`)) return;
    try {
      const result = await request<{ token: string; name: string }>(`sales-officers/${item.id}/access`, { method: 'POST' });
      setAccessLink({ name: result.name, url: `${window.location.origin}/field/access?token=${encodeURIComponent(result.token)}` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to create access link.'); }
  }
  return <div className="admin-content">
    <div className="admin-list-toolbar"><div><p className="admin-overline">Employees · Sales officers</p><h2>Daily field activity</h2><p>Review the supplied 67-officer roster by date, state and territory. Reporting day: {data?.report_day || 'today'} (India time).</p></div><button className="admin-secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'Loading…' : 'Refresh report'}</button></div>
    {error && <p className="admin-message error" role="alert">{error}</p>}
    {accessLink && <section className="admin-panel"><h3>Personal field link · {accessLink.name}</h3><p>Send this privately to this officer. Opening it identifies future photo uploads for 30 days. The link provides field access only.</p><input className="field-link-input" aria-label="Personal field access link" readOnly value={accessLink.url} onFocus={(event) => event.target.select()} /><button className="admin-secondary" onClick={() => void navigator.clipboard.writeText(accessLink.url).catch(() => setError('Select the link above and copy it manually.'))}>Copy link</button><button className="admin-secondary" onClick={() => setAccessLink(null)}>Close</button></section>}
    <div className="admin-metric-grid">
      <article className="admin-metric"><p>Sales officers</p><strong>{items.length}</strong><small>{states.length} states</small></article>
      <article className="admin-metric green"><p>Uploaded on selected day</p><strong>{items.filter((item) => Number(item.day_uploads) > 0).length}</strong><small>Employee-linked submissions</small></article>
      <article className="admin-metric amber"><p>No attributed upload</p><strong>{items.filter((item) => item.employee_matched && Number(item.day_uploads) === 0).length}</strong><small>Check leave, access and field schedule before follow-up</small></article>
      <article className="admin-metric"><p>Needs employee match</p><strong>{items.filter((item) => !item.employee_matched).length}</strong><small>{data?.anonymous_day_uploads || 0} anonymous submissions on selected day</small></article>
    </div>
    <div className="field-report-filters">
      <label>Date (India)<input type="date" value={day} max={today()} onChange={(event) => { setDay(event.target.value); if (event.target.value) void refresh(event.target.value); }} /></label>
      <label>State<select value={state} onChange={(event) => { setState(event.target.value); setTerritory(''); }}><option value="">All states</option>{states.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Territory<select value={territory} onChange={(event) => setTerritory(event.target.value)}><option value="">All territories</option>{territories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Activity<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="all">All officers</option><option value="uploaded">Uploaded</option><option value="missing">No attributed upload</option><option value="unmatched">Needs employee match</option></select></label>
    </div>
    <label className="admin-search"><span>⌕</span><input placeholder="Search name, employee code, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Officer</th><th>State / territory</th><th>Contact details</th><th>Organisation</th><th>Selected day</th><th>7 days ending on date</th><th>Last upload</th>{canManage && <th>Administrator</th>}</tr></thead><tbody>
      {visible.map((item) => <tr key={item.id}><td><b>{item.source_name}</b><small>{item.employee_code || 'Employee match required'}</small>{item.full_name && item.full_name !== item.source_name && <small>HR: {item.full_name}</small>}</td><td>{item.state}<small>{item.territory}</small>{item.location && <small>HR location: {item.location}</small>}</td><td><small>Work: {item.office_email || 'Not recorded'}</small><small>Work phone: {item.office_mobile || 'Not recorded'}</small>{item.personal_email && <small>Personal email: {item.personal_email}</small>}{item.personal_mobile && <small>Personal phone: {item.personal_mobile}</small>}</td><td>{item.designation || 'Sales officer (roster)'}<small>{item.department}</small><small>Reports to: {item.reporting_manager_name || 'Not recorded'}</small><small>{item.roles?.join(', ').replaceAll('_', ' ')}</small></td><td><span className={`admin-badge ${Number(item.day_uploads) > 0 ? 'green' : 'amber'}`}>{item.employee_matched ? `${item.day_uploads} inspections` : 'Unmatched'}</span></td><td>{item.week_uploads}</td><td>{item.last_upload_at ? new Date(item.last_upload_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'No linked inspection'}</td>{canManage && <td><button className="admin-secondary" onClick={() => void linkEmployee(item)}>Match employee</button>{item.employee_matched && <button className="admin-secondary" onClick={() => void issueAccess(item)}>Create field link</button>}</td>}</tr>)}
    </tbody></table></div>
    {!visible.length && <p className="admin-empty">No officers match the selected filters.</p>}
    <p className="admin-muted">Use each officer’s personal field link for new submissions. Earlier anonymous uploads cannot establish an officer’s daily activity. A field link identifies its holder; share it only with the named officer.</p>
  </div>;
}
