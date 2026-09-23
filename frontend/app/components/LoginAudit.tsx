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
  
  // Filters
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, dealerCodeFilter, roleFilter, periodFilter, stateFilter, activityFilter, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  useEffect(() => setPage(1), [dateFilter, dealerCodeFilter, roleFilter, periodFilter, stateFilter, activityFilter, pageSize]);

  return (
    <div className="admin-content">
      <div className="admin-list-toolbar">
        <div>
          <p className="admin-overline">Analytics</p>
          <h2>Login Audit</h2>
          <p>View public portal login sessions by date, dealer code, or role.</p>
        </div>
      </div>
      <div className="dealer-kpis"><article><span>Sessions in view</span><b>{summary.total}</b></article><article><span>Currently active</span><b>{summary.active}</b></article><article><span>Farmer sessions</span><b>{summary.farmers}</b></article><article><span>Dealer sessions</span><b>{summary.dealers}</b><small>{summary.unique_users} unique users</small></article></div>
      
      <div className="admin-catalogue-filters" style={{ marginBottom: '20px' }}>
        <label className="admin-search"><span>Quick period</span><select value={periodFilter} onChange={e=>{setPeriodFilter(e.target.value);if(e.target.value)setDateFilter('')}}><option value="today">Today</option><option value="yesterday">Yesterday</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="">All time / exact date</option></select></label>
        <label className="admin-search">
          <span>Date</span>
          <input type="date" value={dateFilter} onChange={(e)=>setDateFilter(e.target.value)} />
        </label>
        <label className="admin-search"><span>State</span><select value={stateFilter} onChange={e=>setStateFilter(e.target.value)}><option value="">All states</option>{states.map(item=><option key={item}>{item}</option>)}</select></label>
        <label className="admin-search"><span>Session status</span><select value={activityFilter} onChange={e=>setActivityFilter(e.target.value)}><option value="">All sessions</option><option value="active">Active</option><option value="logged_out">Logged out / expired</option></select></label>
        <label className="admin-search">
          <span>Role / Activity Type</span>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="farmer">Farmer</option>
            <option value="dealer">Dealer</option>
            <option value="general_user">General user</option>
          </select>
        </label>
        <label className="admin-search">
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
                <th>Timestamp</th>
                <th>Name</th>
                <th>Mobile Number</th>
                <th>Role</th>
                <th>Dealer Code</th>
                <th>IP Address</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td><b>{log.first_name || ''} {log.last_name || ''}</b></td>
                  <td>{log.mobile_number}</td>
                  <td>{log.role || 'farmer'}</td>
                  <td>{log.dealer_name ? `${log.dealer_code} (${log.dealer_name})` : '—'}</td>
                  <td>{log.ip_address || '—'}</td>
                  <td>
                    {log.revoked_at ? (
                      <span className="admin-status-pill availability inactive">Logged Out</span>
                    ) : (
                      <span className="admin-status-pill availability active">Active</span>
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
