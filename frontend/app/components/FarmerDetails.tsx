'use client';

import { useState, useEffect, useCallback } from 'react';

type Farmer = {
  id: string;
  first_name: string;
  last_name: string;
  mobile_number: string;
  role: string;
  city: string;
  state: string;
  district: string;
  village: string;
  created_at: string;
  last_login_at: string;
  is_verified: boolean;
  dealer_code: string;
  dealer_name: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export default function FarmerDetails() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [facets, setFacets] = useState<{states:string[]}>({states:[]});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [dealerCodeFilter, setDealerCodeFilter] = useState('');

  const fetchFarmers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (stateFilter) params.append('state', stateFilter);
      if (dealerCodeFilter) params.append('dealer_code', dealerCodeFilter);
      
      const response = await fetch(`/api/admin/portal/farmers?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch farmers');
      const data: unknown = await response.json();
      const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
      setFarmers(items as Farmer[]);
      const facets = isObject(data) && isObject(data.facets) ? data.facets : null;
      if (facets && Array.isArray(facets.states)) setFacets({ states: facets.states.filter((value): value is string => typeof value === 'string') });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [search, stateFilter, dealerCodeFilter]);

  useEffect(() => {
    fetchFarmers();
  }, [fetchFarmers]);

  return (
    <div className="admin-content">
      <div className="admin-list-toolbar">
        <div>
          <p className="admin-overline">Analytics</p>
          <h2>Farmer Details</h2>
          <p>View registered farmers, their details, and verified dealer codes.</p>
        </div>
      </div>
      
      <div className="admin-catalogue-filters" style={{ marginBottom: '20px' }}>
        <label className="admin-search">
          <span>Search</span>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Name or mobile" />
        </label>
        <label className="admin-search">
          <span>State</span>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All States</option>
            {facets.states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="admin-search">
          <span>Dealer Code</span>
          <input value={dealerCodeFilter} onChange={(e)=>setDealerCodeFilter(e.target.value)} placeholder="Filter by dealer code" />
        </label>
      </div>

      {loading ? (
        <p>Loading farmers...</p>
      ) : error ? (
        <p className="admin-empty" style={{ color: 'red' }}>{error}</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Farmer Name</th>
                <th>Mobile Number</th>
                <th>Location</th>
                <th>Role</th>
                <th>Dealer Name / Code</th>
                <th>Verified</th>
                <th>Joined At</th>
              </tr>
            </thead>
            <tbody>
              {farmers.map(farmer => (
                <tr key={farmer.id}>
                  <td><b>{farmer.first_name || ''} {farmer.last_name || ''}</b></td>
                  <td>{farmer.mobile_number}</td>
                  <td>{farmer.village || farmer.city}, {farmer.district}, {farmer.state}</td>
                  <td>{farmer.role || 'farmer'}</td>
                  <td>{farmer.dealer_name ? `${farmer.dealer_name} (${farmer.dealer_code})` : '—'}</td>
                  <td>{farmer.is_verified ? 'Yes' : 'No'}</td>
                  <td>{new Date(farmer.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!farmers.length && <p className="admin-empty">No farmers found.</p>}
        </div>
      )}
    </div>
  );
}
