'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminPager, AdminPageSize } from './AdminPagination';

type AuditLog = {
  id: string;
  created_at: string;
  ip_address: string;
  user_agent: string;
  revoked_at: string | null;
  first_name: string;
  last_name: string;
  mobile_number: string;
  role: string;
  dealer_code: string;
  dealer_name: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export default function LoginAudit() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminPageSize>(25);
  const [total, setTotal] = useState(0);
  const [summary,setSummary]=useState({total:0,active:0,farmers:0,dealers:0,unique_users:0});
  const [states,setStates]=useState<string[]>([]);
  const [chartData, setChartData] = useState<{date:string, count:number}[]>([]);
  
  // Filters
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [dealerCodeFilter, setDealerCodeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [periodFilter,setPeriodFilter]=useState('30d');
  const [stateFilter,setStateFilter]=useState('');
  const [activityFilter,setActivityFilter]=useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (dateFilter) params.append('date', dateFilter);
      if (dealerCodeFilter) params.append('dealer_code', dealerCodeFilter);
      if (roleFilter) params.append('role', roleFilter);
      if (periodFilter&&!dateFilter) params.append('period',periodFilter);
      if (stateFilter) params.append('state',stateFilter);
      if (activityFilter) params.append('activity',activityFilter);
      params.set('limit', String(pageSize));
      params.set('offset', String(pageSize === 0 ? 0 : (page - 1) * pageSize));
      
      const response = await fetch(`/api/admin/portal/login-audit?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch login audit logs');
      const data: unknown = await response.json();
      const items = isObject(data) && Array.isArray(data.items) ? data.items as AuditLog[] : [];
      setLogs(items);
      setTotal(isObject(data) && typeof data.total === 'number' ? data.total : items.length);
      if(isObject(data)&&isObject(data.summary))setSummary(data.summary as typeof summary);
      if(isObject(data)&&Array.isArray(data.states))setStates(data.states as string[]);
      if(isObject(data)&&Array.isArray(data.chart_data))setChartData(data.chart_data as any[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [search, dateFilter, dealerCodeFilter, roleFilter, periodFilter, stateFilter, activityFilter, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  useEffect(() => setPage(1), [search, dateFilter, dealerCodeFilter, roleFilter, periodFilter, stateFilter, activityFilter, pageSize]);

  return (
    <div className="admin-content">
      <div className="admin-list-toolbar">
        <div>
          <p className="admin-overline">Analytics</p>
          <h2>Login Audit</h2>
          <p>View public portal login sessions by date, dealer code, or role.</p>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
        <div className="dealer-kpis" style={{ flex: 2, marginBottom: 0, gap: '10px' }}>
          <article><span>Sessions in view</span><b>{summary.total}</b></article>
          <article><span>Currently active</span><b>{summary.active}</b></article>
          <article>
            <span>User Distribution</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
              <div style={{ flex: 1, background: '#e1e8ed', height: '8px', borderRadius: '4px', overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: summary.total ? `${(summary.farmers / summary.total) * 100}%` : '0%', background: '#0a8043' }} title="Farmers" />
                <div style={{ width: summary.total ? `${(summary.dealers / summary.total) * 100}%` : '0%', background: '#1c4e80' }} title="Dealers" />
              </div>
              <small style={{ whiteSpace: 'nowrap' }}>{summary.farmers} F / {summary.dealers} D</small>
            </div>
          </article>
        </div>
        
        <div style={{ flex: 1, background: '#fff', borderRadius: '16px', padding: '15px', border: '1px solid #d7e3eb', display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '11px', fontWeight: 800, color: '#36566d', marginBottom: '8px', textTransform: 'uppercase' }}>Login Volume (Daily)</span>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: '3px', height: '50px', borderBottom: '1px solid #e1e8ed', paddingBottom: '2px' }}>
            {chartData.length === 0 ? <p style={{ fontSize: '11px', color: '#999', margin: 'auto' }}>No data in this period</p> : chartData.map((d, i) => {
              const max = Math.max(...chartData.map(c => c.count));
              const h = max === 0 ? 0 : (d.count / max) * 100;
              return (
                <div key={i} title={`${d.date}: ${d.count} logins`} style={{ flex: 1, background: '#0a8043', height: `${h}%`, minHeight: h > 0 ? '2px' : '0', borderRadius: '2px 2px 0 0', opacity: 0.85, transition: 'height 0.3s ease' }} />
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="dealer-filters">
        <label>
          <span>Search</span>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Name, mobile or session ID" />
        </label>
        <label>
          <span>Quick period</span>
          <select value={periodFilter} onChange={e=>{setPeriodFilter(e.target.value);if(e.target.value)setDateFilter('')}}>
            <option value="today">Today</option><option value="yesterday">Yesterday</option>
            <option value="7d">Last 7 days</option><option value="30d">Last 30 days</option>
            <option value="">All time / exact date</option>
          </select>
        </label>
        <label>
          <span>Date</span>
          <input type="date" value={dateFilter} onChange={(e)=>setDateFilter(e.target.value)} />
        </label>
        <label>
          <span>State</span>
          <select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}>
            <option value="">All states</option>
            {states.map(item=><option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Session status</span>
          <select value={activityFilter} onChange={e=>setActivityFilter(e.target.value)}>
            <option value="">All sessions</option>
            <option value="active">Active</option>
            <option value="logged_out">Logged out / expired</option>
          </select>
        </label>
        <label>
          <span>Role / Activity Type</span>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="farmer">Farmer</option>
            <option value="dealer">Dealer</option>
            <option value="general_user">General user</option>
          </select>
        </label>
        <label>
          <span>Dealer Code</span>
          <input value={dealerCodeFilter} onChange={(e)=>setDealerCodeFilter(e.target.value)} placeholder="Filter by dealer code" />
        </label>
      </div>

      {loading ? (
        <p>Loading logs...</p>
      ) : error ? (
        <p className="admin-empty" style={{ color: 'red' }}>{error}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Session Time & ID</th>
                <th>User Details</th>
                <th>Role & Dealership</th>
                <th>Connection Info</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td>
                    <b>{new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })}</b>
                    <small style={{ fontFamily: 'monospace', opacity: 0.7, marginTop: '4px' }}>{log.id}</small>
                  </td>
                  <td>
                    <b>{log.first_name || ''} {log.last_name || ''}</b>
                    <small>{log.mobile_number}</small>
                  </td>
                  <td>
                    <span className="admin-badge">{log.role || 'farmer'}</span>
                    <small style={{ marginTop: '5px' }}>{log.dealer_name ? `${log.dealer_code} (${log.dealer_name})` : 'No dealer assigned'}</small>
                  </td>
                  <td>
                    <b>{log.ip_address || 'Unknown IP'}</b>
                    <small style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '4px' }} title={log.user_agent || 'Unknown device'}>
                      {log.user_agent || 'Unknown device'}
                    </small>
                  </td>
                  <td>
                    {log.revoked_at ? (
                      <span className="dealer-pill pending" style={{ background: '#f5f5f5', color: '#666' }}>Logged out</span>
                    ) : (
                      <span className="dealer-pill settled" style={{ background: '#e1f5e8', color: '#107a3c' }}>Active</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!logs.length && <p className="admin-empty">No login records found for these filters.</p>}
          <AdminPager page={page} pageSize={pageSize} total={total} shown={logs.length} onPage={setPage} onPageSize={setPageSize} />
        </div>
      )}
    </div>
  );
}
