'use client';

import { useState, useEffect, useCallback } from 'react';

type Dealer = {
  id: string;
  dealer_code: string;
  name: string;
  sales_executive: string;
  sales_area: string;
  sales_region: string;
  sales_territory: string;
  state: string;
  status: string;
};

type ReferralResponse = { token?: string; download_url?: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isDealer(value: unknown): value is Dealer {
  return isObject(value)
    && typeof value.id === 'string'
    && typeof value.dealer_code === 'string'
    && typeof value.name === 'string';
}

export default function Dealerships() {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [stateFilter, setStateFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [territoryFilter, setTerritoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [referralToken, setReferralToken] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchDealers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stateFilter) params.append('state', stateFilter);
      if (areaFilter) params.append('area', areaFilter);
      if (territoryFilter) params.append('territory', territoryFilter);
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await fetch(`/api/admin/portal/dealers?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch dealers');
      const data: unknown = await response.json();
      const items = isObject(data) && Array.isArray(data.items) ? data.items.filter(isDealer) : [];
      setDealers(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [areaFilter, stateFilter, statusFilter, territoryFilter]);

  useEffect(() => {
    void Promise.resolve().then(fetchDealers);
  }, [fetchDealers]);

  async function generateReferral(dealerId: string) {
    setGenerating(true);
    setReferralToken(null);
    setDownloadUrl(null);
    try {
      const response = await fetch(`/api/admin/portal/dealers/${dealerId}/referral`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error('Failed to generate referral link');
      const data: unknown = await response.json();
      const referral: ReferralResponse = isObject(data)
        ? { token: typeof data.token === 'string' ? data.token : undefined, download_url: typeof data.download_url === 'string' ? data.download_url : undefined }
        : {};
      if (!referral.token || !referral.download_url) throw new Error('The server returned an invalid referral link.');
      setReferralToken(referral.token);
      setDownloadUrl(referral.download_url);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setGenerating(false);
    }
  }

  // Unique values for filter dropdowns based on current data (for simplicity, ideally from backend)
  const areas = Array.from(new Set(dealers.map(d => d.sales_area).filter(Boolean))).sort();
  const territories = Array.from(new Set(dealers.map(d => d.sales_territory).filter(Boolean))).sort();

  return (
    <div className="admin-content">
      <div className="admin-list-toolbar">
        <div>
          <p className="admin-overline">Partner Management</p>
          <h2>Dealership Network</h2>
          <p>Manage dealers, generate referral links, and view performance.</p>
        </div>
      </div>
      
      <div className="admin-catalogue-filters" style={{ marginBottom: '20px' }}>
        <label className="admin-search">
          <span>State</span>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All States</option>
            <option value="Gujarat">Gujarat</option>
            <option value="Maharashtra">Maharashtra</option>
            <option value="Madhya Pradesh">Madhya Pradesh</option>
            {/* Add more states dynamically based on data if needed */}
          </select>
        </label>
        
        <label className="admin-search">
          <span>Area</span>
          <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
            <option value="">All Areas</option>
            {areas.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        
        <label className="admin-search">
          <span>Territory</span>
          <select value={territoryFilter} onChange={(e) => setTerritoryFilter(e.target.value)}>
            <option value="">All Territories</option>
            {territories.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        
        <label className="admin-status-filter">
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      {loading ? (
        <p>Loading dealers...</p>
      ) : error ? (
        <p className="admin-empty" style={{ color: 'red' }}>{error}</p>
      ) : (
        <div className="admin-table-wrap" style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Dealer Code</th>
                  <th>Name</th>
                  <th>State / Territory</th>
                  <th>Sales Executive</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dealers.map(dealer => (
                  <tr key={dealer.id} style={{ background: selectedDealer?.id === dealer.id ? '#f3f4f6' : 'transparent' }}>
                    <td>{dealer.dealer_code}</td>
                    <td><b>{dealer.name}</b></td>
                    <td>{dealer.state} <br/> <small>{dealer.sales_territory}</small></td>
                    <td>{dealer.sales_executive}</td>
                    <td>
                      <button 
                        className="admin-secondary"
                        onClick={() => {
                          setSelectedDealer(dealer);
                          setReferralToken(null);
                          setDownloadUrl(null);
                        }}
                      >
                        Select
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!dealers.length && <p className="admin-empty">No dealers found.</p>}
          </div>
          
          {selectedDealer && (
            <div className="admin-panel" style={{ width: '350px', position: 'sticky', top: '20px' }}>
              <p className="admin-overline">Dealer Actions</p>
              <h3>{selectedDealer.name}</h3>
              <p style={{ marginBottom: '16px' }}>Code: {selectedDealer.dealer_code}</p>
              
              <button 
                className="admin-primary" 
                style={{ width: '100%', marginBottom: '20px' }}
                onClick={() => generateReferral(selectedDealer.id)}
                disabled={generating}
              >
                {generating ? 'Generating...' : 'Generate secure referral link'}
              </button>
              
              {downloadUrl && (
                <div style={{ textAlign: 'center', background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <p style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>Referral Token: {referralToken}</p>
                  <p style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280' }}>
                    Copy this secure CLSL referral link. A locally generated QR image will be added before the public launch.
                  </p>
                  <button type="button" className="admin-secondary" onClick={() => void navigator.clipboard.writeText(downloadUrl)}>
                    Copy referral link
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
