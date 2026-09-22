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
  
  // Filters
  const [dateFilter, setDateFilter] = useState('');
  const [dealerCodeFilter, setDealerCodeFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (dealerCodeFilter) params.append('dealer_code', dealerCodeFilter);
      if (roleFilter) params.append('role', roleFilter);
      params.set('limit', String(pageSize));
      params.set('offset', String(pageSize === 0 ? 0 : (page - 1) * pageSize));
      
      const response = await fetch(`/api/admin/portal/login-audit?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch login audit logs');
      const data: unknown = await response.json();
      const items = isObject(data) && Array.isArray(data.items) ? data.items as AuditLog[] : [];
      setLogs(items);
      setTotal(isObject(data) && typeof data.total === 'number' ? data.total : items.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [dateFilter, dealerCodeFilter, roleFilter, page, pageSize]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);
  useEffect(() => setPage(1), [dateFilter, dealerCodeFilter, roleFilter, pageSize]);

  return (
    <div className="admin-content">
      <div className="admin-list-toolbar">
        <div>
          <p className="admin-overline">Analytics</p>
          <h2>Login Audit</h2>
          <p>View public portal login sessions by date, dealer code, or role.</p>
        </div>
      </div>
      
      <div className="admin-catalogue-filters" style={{ marginBottom: '20px' }}>
        <label className="admin-search">
          <span>Date</span>
          <input type="date" value={dateFilter} onChange={(e)=>setDateFilter(e.target.value)} />
        </label>
        <label className="admin-search">
          <span>Role / Activity Type</span>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            <option value="farmer">Farmer</option>
            <option value="dealer">Dealer</option>
            <option value="guest">Guest</option>
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
