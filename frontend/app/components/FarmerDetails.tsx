'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminPager, AdminPageSize } from './AdminPagination';

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
  date_of_birth: string | null;
  land_acres: number | null;
};

function getAge(dateString: string | null) {
  if (!dateString || !dateString.trim()) return null;
  const birthDate = new Date(dateString);
  if (isNaN(birthDate.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

export default function FarmerDetails() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [facets, setFacets] = useState<{states:string[], cities:string[], villages:string[]}>({states:[], cities:[], villages:[]});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<AdminPageSize>(25);
  const [total, setTotal] = useState(0);
  
  // Filters
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [villageFilter, setVillageFilter] = useState('');
  const [dealerCodeFilter, setDealerCodeFilter] = useState('');

  const fetchFarmers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.append('search', search.trim());
      if (stateFilter) params.append('state', stateFilter);
      if (cityFilter) params.append('city', cityFilter);
      if (villageFilter) params.append('village', villageFilter);
      if (dealerCodeFilter) params.append('dealer_code', dealerCodeFilter);
      params.set('limit', String(pageSize));
      params.set('offset', String(pageSize === 0 ? 0 : (page - 1) * pageSize));
      
      const response = await fetch(`/api/admin/portal/farmers?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch farmers');
      const data: unknown = await response.json();
      const items = isObject(data) && Array.isArray(data.items) ? data.items : [];
      setFarmers(items as Farmer[]);
      setTotal(isObject(data) && typeof data.total === 'number' ? data.total : items.length);
      const facets = isObject(data) && isObject(data.facets) ? data.facets : null;
      if (facets && Array.isArray(facets.states)) {
        setFacets({ 
          states: facets.states.filter((value): value is string => typeof value === 'string'),
          cities: Array.isArray(facets.cities) ? facets.cities.filter((value): value is string => typeof value === 'string') : [],
          villages: Array.isArray(facets.villages) ? facets.villages.filter((value): value is string => typeof value === 'string') : []
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [search, stateFilter, cityFilter, villageFilter, dealerCodeFilter, page, pageSize]);

  useEffect(() => {
    fetchFarmers();
  }, [fetchFarmers]);
  useEffect(() => setPage(1), [search, stateFilter, cityFilter, villageFilter, dealerCodeFilter, pageSize]);
  const whatsappNumber = (value: string) => {
    const digits = value.replace(/\D/g, '');
    return digits.length === 10 ? `91${digits}` : digits;
  };

  return (
    <div className="admin-content farmer-details">
      <div className="admin-list-toolbar">
        <div>
          <p className="admin-overline">Analytics</p>
          <h2>Farmer Details</h2>
          <p>View registered farmers, their details, and verified dealer codes.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="admin-secondary" onClick={() => alert('Airtel SMS integration pending for bulk messages.')}>
            Send Bulk SMS
          </button>
          <button className="admin-primary" onClick={() => alert('Airtel SMS integration pending for birthday wishes.')}>
            Send Birthday Wishes
          </button>
        </div>
      </div>
      
      <div className="dealer-filters">
        <label>
          <span>Search</span>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Name or mobile" />
        </label>
        <label>
          <span>State</span>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All States</option>
            {facets.states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span>City</span>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
            <option value="">All Cities</option>
            {facets.cities.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          <span>Village</span>
          <select value={villageFilter} onChange={(e) => setVillageFilter(e.target.value)}>
            <option value="">All Villages</option>
            {facets.villages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
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
                <th>Age / DOB</th>
                <th>Land (Acres)</th>
                <th>Location</th>
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
                  <td>
                    {farmer.date_of_birth && getAge(farmer.date_of_birth) !== null ? (
                      <>
                        <b>{getAge(farmer.date_of_birth)} yrs</b>
                        <small>{new Date(farmer.date_of_birth).toLocaleDateString()}</small>
                      </>
                    ) : '—'}
                  </td>
                  <td>{farmer.land_acres != null ? farmer.land_acres : '—'}</td>
                  <td>
                    <b>{farmer.village || 'Unknown Village'}</b>
                    <small>{[farmer.city, farmer.district, farmer.state].filter(Boolean).join(', ')}</small>
                  </td>
                  <td>{farmer.dealer_name ? `${farmer.dealer_name} (${farmer.dealer_code})` : '—'}</td>
                  <td>{farmer.is_verified ? 'Yes' : 'No'}</td>
                  <td>{new Date(farmer.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!farmers.length && <p className="admin-empty">No farmers found.</p>}
          <AdminPager page={page} pageSize={pageSize} total={total} shown={farmers.length} onPage={setPage} onPageSize={setPageSize} />
        </div>
      )}
    </div>
  );
}
