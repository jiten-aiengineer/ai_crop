'use client';

import { useEffect, useMemo, useState } from 'react';

type Officer = {
  id: string; employee_id: string; employee_code: string; full_name: string; state: string; territory: string;
  location?: string; designation?: string; department?: string; reporting_manager_name?: string;
  office_email?: string; office_mobile?: string; personal_email?: string; personal_mobile?: string;
  hr_sync_state: 'new' | 'existing' | 'updated' | 'inactive'; employee_status: string;
  day_uploads: number; day_images: number; day_complete_sets: number;
  day_distinct_crops: number; day_distinct_problems: number; day_expert_approved: number; day_rejected: number;
  month_uploads: number; month_images: number; month_complete_sets: number; active_days_30: number; last_upload_at?: string;
  has_access_link: boolean; access_link_created_at?: string; access_link_last_used_at?: string;
};
type Report = { items: Officer[]; report_day?: string; anonymous_day_uploads: number };
type StateSummary = { state: string; officers: number; active: number; compliant: number; inspections: number; images: number; completeSets: number };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/admin/portal/${path}`, { ...init, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const result = await response.json().catch(() => ({})) as { detail?: string; error?: string };
  if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : result.error || 'Unable to load the field report.');
  return result as T;
}

function dailyStatus(item: Officer) {
  if (Number(item.day_complete_sets) >= 2) return { label: 'Daily target complete', tone: 'green' };
  if (Number(item.day_complete_sets) === 1) return { label: 'Below daily target', tone: 'amber' };
  return { label: 'No upload today', tone: 'red' };
}

function monthlyStatus(item: Officer) {
  if (Number(item.active_days_30) >= 20) return { label: '20-day target complete', tone: 'green' };
  if (Number(item.active_days_30) > 0) return { label: `${item.active_days_30}/20 active days`, tone: 'amber' };
  return { label: 'No activity in 30 days', tone: 'red' };
}

export default function FieldForce({ initialData, canManage = false }: { initialData?: Report; canManage?: boolean }) {
  const [data, setData] = useState<Report | undefined>(initialData);
  const [day, setDay] = useState(today); const [state, setState] = useState('');
  const [territory, setTerritory] = useState(''); const [mode, setMode] = useState('all');
  const [sort, setSort] = useState('most_active'); const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false);
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
  const stateSummary = useMemo(() => {
    const summaries = new Map<string, StateSummary>();
    for (const item of items) {
      const current = summaries.get(item.state) || { state: item.state, officers: 0, active: 0, compliant: 0, inspections: 0, images: 0, completeSets: 0 };
      current.officers += 1; current.active += Number(item.active_days_30) > 0 ? 1 : 0; current.compliant += Number(item.active_days_30) >= 20 ? 1 : 0;
      current.inspections += Number(item.month_uploads); current.images += Number(item.month_images); current.completeSets += Number(item.month_complete_sets);
      summaries.set(item.state, current);
    }
    return [...summaries.values()].sort((a, b) => b.inspections - a.inspections || a.state.localeCompare(b.state));
  }, [items]);
  const visible = items.filter((item) => (!state || item.state === state) && (!territory || item.territory === territory)
    && `${item.full_name} ${item.employee_code} ${item.office_email || ''} ${item.office_mobile || ''} ${item.state} ${item.territory}`.toLowerCase().includes(query.toLowerCase())
    && (mode === 'all' || mode === 'daily_complete' && Number(item.day_complete_sets) >= 2
      || mode === 'daily_below' && Number(item.day_complete_sets) === 1 || mode === 'daily_missing' && Number(item.day_complete_sets) === 0
      || mode === 'month_complete' && Number(item.active_days_30) >= 20
      || mode === 'month_below' && Number(item.active_days_30) > 0 && Number(item.active_days_30) < 20
      || mode === 'month_missing' && Number(item.active_days_30) === 0
      || mode === 'link_pending' && !item.has_access_link || mode === 'link_generated' && item.has_access_link
      || mode === 'active_collectors' && Boolean(item.access_link_last_used_at) || mode === item.hr_sync_state))
    .sort((a, b) => sort === 'least_active'
      ? Number(a.month_complete_sets) - Number(b.month_complete_sets) || a.full_name.localeCompare(b.full_name)
      : sort === 'name' ? a.full_name.localeCompare(b.full_name)
        : Number(b.month_complete_sets) - Number(a.month_complete_sets) || Number(b.active_days_30) - Number(a.active_days_30));
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
    <div className="admin-list-toolbar"><div><p className="admin-overline">Employees · Confirmed Sales Officers</p><h2>Field activity and personal app access</h2><p>Daily target: 2–3 four-photo inspections. Monthly compliance target: activity on at least 20 of the latest 30 days ending {data?.report_day || 'today'}.</p></div><button className="admin-secondary" disabled={busy} onClick={() => void refresh()}>{busy ? 'Loading…' : 'Refresh report'}</button></div>
    {error && <p className="admin-message error" role="alert">{error}</p>}
    {accessLink && <section className="admin-panel field-link-panel"><h3>Permanent personal field link · {accessLink.name}</h3><p>Send this privately to the named officer. It personalises the installed PWA and attributes inspections until rotated.</p><input className="field-link-input" aria-label="Personal field access link" readOnly value={accessLink.url} onFocus={(event) => event.target.select()} /><button className="admin-secondary" onClick={() => void navigator.clipboard.writeText(accessLink.url).catch(() => setError('Select the link above and copy it manually.'))}>Copy link</button><button className="admin-secondary" onClick={() => setAccessLink(null)}>Close</button></section>}
    <div className="admin-metric-grid">
      <article className="admin-metric"><p>Confirmed Sales Officers</p><strong>{items.length}</strong><small>{states.length} states · official employee identities</small></article>
      <article className="admin-metric green"><p>Monthly target complete</p><strong>{items.filter((item) => Number(item.active_days_30) >= 20).length}</strong><small>Active on at least 20 of the latest 30 days</small></article>
      <article className="admin-metric amber"><p>Active but below target</p><strong>{items.filter((item) => Number(item.active_days_30) > 0 && Number(item.active_days_30) < 20).length}</strong><small>Use “Least active first” for follow-up</small></article>
      <article className="admin-metric"><p>No 30-day activity</p><strong>{items.filter((item) => Number(item.active_days_30) === 0).length}</strong><small>{items.filter((item) => !item.has_access_link).length} links not generated</small></article>
    </div>
    <section className="admin-panel field-state-summary"><header><div><p className="admin-overline">State-wise performance · latest 30 days</p><h3>See where collection is active and where follow-up is needed</h3></div></header><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>State</th><th>Officers</th><th>Active officers</th><th>20-day compliant</th><th>Inspections</th><th>Images</th><th>Complete sets</th></tr></thead><tbody>{stateSummary.map((summary) => <tr key={summary.state} onClick={() => { setState(summary.state); setTerritory(''); }}><td><button className="admin-state-link">{summary.state}</button></td><td>{summary.officers}</td><td>{summary.active}</td><td>{summary.compliant}</td><td>{summary.inspections}</td><td>{summary.images}</td><td>{summary.completeSets}</td></tr>)}</tbody></table></div></section>
    <div className="field-report-filters">
      <label>Report end date (India)<input type="date" value={day} max={today()} onChange={(event) => { setDay(event.target.value); if (event.target.value) void refresh(event.target.value); }} /></label>
      <label>State<select value={state} onChange={(event) => { setState(event.target.value); setTerritory(''); }}><option value="">All states</option>{states.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Territory<select value={territory} onChange={(event) => setTerritory(event.target.value)}><option value="">All territories</option>{territories.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Performance<select value={mode} onChange={(event) => setMode(event.target.value)}><option value="all">All officers</option><option value="month_complete">Monthly target complete</option><option value="month_below">Monthly target below 20 days</option><option value="month_missing">No activity in 30 days</option><option value="daily_complete">Today: target complete</option><option value="daily_below">Today: below target</option><option value="daily_missing">Today: no upload</option><option value="link_pending">Link not generated</option><option value="link_generated">Link generated</option><option value="active_collectors">Link used</option><option value="new">New HR employee</option><option value="updated">Updated HR employee</option><option value="inactive">Inactive / left</option></select></label>
      <label>Order<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="most_active">Most active first</option><option value="least_active">Least active first</option><option value="name">Official name</option></select></label>
    </div>
    <label className="admin-search"><span>⌕</span><input placeholder="Search name, code, state, territory, email or phone" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    <div className="admin-table-wrap"><table className="admin-table field-force-table"><thead><tr><th>Official employee & app link</th><th>Territory & contact</th><th>Today</th><th>Latest 30 days</th><th>Review quality</th><th>Performance</th></tr></thead><tbody>
      {visible.map((item) => { const daily = dailyStatus(item); const monthly = monthlyStatus(item); return <tr key={item.id}><td><b>{item.full_name}</b><small>{item.employee_code} · {item.designation || 'Sales Officer'}</small><span className={`admin-badge ${item.has_access_link ? 'green' : 'amber'}`}>{item.has_access_link ? 'Personal link ready' : 'Link pending'}</span>{canManage && <button className="admin-primary field-link-action" onClick={() => void issueAccess(item)}>{item.has_access_link ? 'Rotate link' : 'Create field link'}</button>}<small>{item.access_link_last_used_at ? `Last opened ${new Date(item.access_link_last_used_at).toLocaleDateString('en-IN')}` : 'Not opened yet'}</small></td><td><b>{item.territory}</b><small>{item.state} · HR: {item.location || 'Not recorded'}</small><small>{item.office_email || 'Work email not recorded'}</small><small>{item.office_mobile || item.personal_mobile || 'Phone not recorded'}</small><small>Reports to: {item.reporting_manager_name || 'Not recorded'}</small></td><td><b>{item.day_uploads} inspections · {item.day_images} images</b><small>{item.day_complete_sets} complete sets</small><small>{item.day_distinct_crops} crops · {item.day_distinct_problems} problems</small><span className={`admin-badge ${daily.tone}`}>{daily.label}</span></td><td><b>{item.month_uploads} inspections · {item.month_images} images</b><small>{item.month_complete_sets} complete four-photo sets</small><small>{item.active_days_30}/30 active days · target 20</small><small>{item.last_upload_at ? `Last: ${new Date(item.last_upload_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'No inspection yet'}</small></td><td><b>{item.day_expert_approved} approved today</b><small>{item.day_rejected} rejected / needs follow-up</small></td><td><span className={`admin-badge ${monthly.tone}`}>{monthly.label}</span><span className={`admin-badge ${item.hr_sync_state === 'new' ? 'green' : item.hr_sync_state === 'updated' ? 'amber' : item.hr_sync_state === 'inactive' ? 'red' : ''}`}>{item.hr_sync_state}</span></td></tr>; })}
    </tbody></table></div>
    {!visible.length && <p className="admin-empty">No Sales Officers match the selected state, territory and performance filters.</p>}
    <p className="admin-muted">All names and contacts come directly from the official employee master. Temporary roster names are not displayed.</p>
  </div>;
}
