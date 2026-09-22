'use client';

import { useState, useEffect, useCallback, FormEvent, ChangeEvent } from 'react';
import QRCode from 'react-qr-code';

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
  portal_mobile_number?: string;
  owner_name?: string;
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

export default function Dealerships({ canManage, canManagePortalMobile, canArchive }: { canManage: boolean; canManagePortalMobile: boolean; canArchive: boolean }) {
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [facets,setFacets] = useState<{states:string[];areas:string[];territories:string[]}>({states:[],areas:[],territories:[]});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [stateFilter, setStateFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [territoryFilter, setTerritoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search,setSearch] = useState('');
  const [phoneFilter, setPhoneFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(25);
  const [totalDealers, setTotalDealers] = useState(0);
  
  const [selectedDealer, setSelectedDealer] = useState<Dealer | null>(null);
  const [referralToken, setReferralToken] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  // Editor
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<Partial<Dealer>>({});
  const [saving, setSaving] = useState(false);

  const fetchDealers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (stateFilter) params.append('state', stateFilter);
      if (areaFilter) params.append('area', areaFilter);
      if (territoryFilter) params.append('territory', territoryFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (search.trim()) params.append('search', search.trim());
      if (phoneFilter) params.append('phone', phoneFilter);
      if (pageSize !== 'all') {
        params.append('limit', pageSize.toString());
        params.append('offset', ((page - 1) * pageSize).toString());
      }
      
      const response = await fetch(`/api/admin/portal/dealers?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch dealers');
      const data: unknown = await response.json();
      const items = isObject(data) && Array.isArray(data.items) ? data.items.filter(isDealer) : [];
      setDealers(items);
      const count = isObject(data) && typeof data.total === 'number' ? data.total : 0;
      setTotalDealers(count);
      if (isObject(data) && isObject(data.facets)) setFacets({
        states:Array.isArray(data.facets.states)?data.facets.states.filter((item):item is string=>typeof item==='string'):[],
        areas:Array.isArray(data.facets.areas)?data.facets.areas.filter((item):item is string=>typeof item==='string'):[],
        territories:Array.isArray(data.facets.territories)?data.facets.territories.filter((item):item is string=>typeof item==='string'):[],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [areaFilter, search, stateFilter, statusFilter, territoryFilter, phoneFilter, page, pageSize]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [areaFilter, search, stateFilter, statusFilter, territoryFilter, phoneFilter, pageSize]);

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

  function handleEdit(dealer: Dealer | null) {
    if (dealer) {
      setDraft(dealer);
    } else {
      setDraft({ status: 'active' });
    }
    setEditorOpen(true);
  }

  async function saveDealer(e: FormEvent) {
    e.preventDefault();
    if (!draft.name?.trim()) {
      alert('Dealer name is required');
      return;
    }
    setSaving(true);
    try {
      const url = draft.id ? `/api/admin/portal/dealers/${draft.id}` : `/api/admin/portal/dealers`;
      const response = await fetch(url, {
        method: draft.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      });
      if (!response.ok) {
        const errData: unknown = await response.json().catch(() => ({}));
        throw new Error(isObject(errData) && typeof errData.detail === 'string' ? errData.detail : 'Failed to save dealer');
      }
      setEditorOpen(false);
      fetchDealers();
      if (selectedDealer && selectedDealer.id === draft.id) {
        setSelectedDealer({ ...selectedDealer, ...draft } as Dealer);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const response = await fetch('/api/admin/portal/dealers/import', {
        method: 'POST',
        body: formData,
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(isObject(data) && typeof data.detail === 'string' ? data.detail : 'Failed to import dealers');
      
      alert(isObject(data) && typeof data.message === 'string' ? data.message : 'Dealers imported.');
      fetchDealers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred during import');
      setLoading(false);
    }
    
    // Reset file input
    e.target.value = '';
  }

  async function deleteDealer(id: string) {
    if (!confirm('Are you sure you want to delete this dealer?')) return;
    try {
      const response = await fetch(`/api/admin/portal/dealers/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete dealer');
      if (selectedDealer?.id === id) setSelectedDealer(null);
      fetchDealers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    }
  }

  // Unique values for filter dropdowns based on current data (for simplicity, ideally from backend)
  const areas = facets.areas.length ? facets.areas : Array.from(new Set(dealers.map(d => d.sales_area).filter(Boolean))).sort();
  const territories = facets.territories.length ? facets.territories : Array.from(new Set(dealers.map(d => d.sales_territory).filter(Boolean))).sort();

  return (
    <div className="admin-content">
      <div className="admin-list-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p className="admin-overline">Partner Management</p>
          <h2>Dealership Network</h2>
          <p>Manage dealers, generate referral links, and view performance.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {canManage && <label className="admin-secondary" style={{ cursor: 'pointer', padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 0, borderRadius: '6px', fontWeight: 600 }}>
            Import Dealers (CSV)
            <input type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          </label>}
          {canManage && <button className="admin-primary" onClick={() => handleEdit(null)}>+ Add Dealer</button>}
        </div>
      </div>
      
      <div className="admin-catalogue-filters" style={{ marginBottom: '20px' }}>
        <label className="admin-search">
          <span>Dealer name or code</span>
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search dealer name, code or territory" />
        </label>
        <label className="admin-search">
          <span>Mobile number</span>
          <input value={phoneFilter} onChange={(e)=>setPhoneFilter(e.target.value)} placeholder="Search phone number" />
        </label>
        <label className="admin-search">
          <span>State</span>
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All States</option>
            {facets.states.map(state=><option key={state} value={state}>{state}</option>)}
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
                  <th>Name & Owner</th>
                  <th>State / Territory</th>
                  <th>Sales Executive</th>
                  <th>Mobile Number</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {dealers.map(dealer => (
                  <tr key={dealer.id} style={{ background: selectedDealer?.id === dealer.id ? '#f3f4f6' : 'transparent' }}>
                    <td>{dealer.dealer_code}</td>
                    <td><b>{dealer.name}</b><br/><small>{dealer.owner_name || '—'}</small></td>
                    <td>{dealer.state} <br/> <small>{dealer.sales_territory}</small></td>
                    <td>{dealer.sales_executive}</td>
                    <td>{dealer.portal_mobile_number || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px' }}>
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
                        {canManage && <button className="admin-secondary" onClick={() => handleEdit(dealer)}>Edit</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', padding: '16px', background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>
                  Showing {dealers.length} of {totalDealers} entries
                </span>
                <select 
                  value={pageSize} 
                  onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                  style={{ padding: '6px', borderRadius: '4px', border: '1px solid #d1d5db', fontSize: '14px' }}
                >
                  <option value={5}>5 per page</option>
                  <option value={25}>25 per page</option>
                  <option value={100}>100 per page</option>
                  <option value={200}>200 per page</option>
                </select>
              </div>
              
              {pageSize !== 'all' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    disabled={page === 1 || loading}
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    style={{ padding: '6px 12px', background: page === 1 ? '#f3f4f6' : 'white', border: '1px solid #d1d5db', borderRadius: '4px', cursor: page === 1 ? 'not-allowed' : 'pointer' }}
                  >
                    Previous
                  </button>
                  <span style={{ display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '14px', fontWeight: 'bold' }}>
                    Page {page}
                  </span>
                  <button 
                    disabled={dealers.length < pageSize || loading}
                    onClick={() => setPage(p => p + 1)}
                    style={{ padding: '6px 12px', background: dealers.length < pageSize ? '#f3f4f6' : 'white', border: '1px solid #d1d5db', borderRadius: '4px', cursor: dealers.length < pageSize ? 'not-allowed' : 'pointer' }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {selectedDealer && (
            <div className="admin-panel" style={{ width: '300px', flexShrink: 0, position: 'sticky', top: '100px' }}>
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
                <div style={{ textAlign: 'center', background: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e5e7eb', marginBottom: '20px' }}>
                  <p style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>Referral Token: {referralToken}</p>
                  
                  <div style={{ margin: '15px auto', background: 'white', padding: '10px', display: 'inline-block' }}>
                    <QRCode value={downloadUrl} size={150} />
                  </div>

                  <p style={{ marginTop: '10px', fontSize: '12px', color: '#6b7280' }}>
                    Copy this secure CLSL referral link or scan the QR code to use it.
                  </p>
                  <button type="button" className="admin-secondary" onClick={() => void navigator.clipboard.writeText(downloadUrl)}>
                    Copy referral link
                  </button>
                </div>
              )}

              {canArchive && <button className="admin-secondary" style={{ width: '100%', color: 'red', borderColor: '#ffcdcd' }} onClick={() => deleteDealer(selectedDealer.id)}>
                Archive dealer
              </button>}
            </div>
          )}
        </div>
      )}

      {editorOpen && (
        <div className="admin-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 }}>
          <form className="admin-panel" style={{ width: '500px', maxHeight: '90vh', overflow: 'auto' }} onSubmit={saveDealer}>
            <h2>{draft.id ? 'Edit Dealer' : 'New Dealer'}</h2>
            
            <label className="admin-field" style={{ marginTop: '16px' }}>
              <span>Dealer Code</span>
              <input value={draft.dealer_code || 'Generated securely after save'} readOnly aria-readonly="true" />
            </label>
            <label className="admin-field" style={{ marginTop: '12px' }}>
              <span>Dealer Name *</span>
              <input value={draft.name || ''} onChange={e => setDraft({...draft, name: e.target.value})} required />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <label className="admin-field">
                <span>Owner Name</span>
                <input value={draft.owner_name || ''} onChange={e => setDraft({...draft, owner_name: e.target.value})} />
              </label>
              {canManagePortalMobile && <label className="admin-field">
                <span>Portal Mobile Number</span>
                <input value={draft.portal_mobile_number || ''} onChange={e => setDraft({...draft, portal_mobile_number: e.target.value})} placeholder="e.g. 9876543210" />
              </label>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
              <label className="admin-field">
                <span>Sales Executive</span>
                <input value={draft.sales_executive || ''} onChange={e => setDraft({...draft, sales_executive: e.target.value})} />
              </label>
              <label className="admin-field">
                <span>State</span>
                <input value={draft.state || ''} onChange={e => setDraft({...draft, state: e.target.value})} />
              </label>
              <label className="admin-field">
                <span>Sales Area</span>
                <input value={draft.sales_area || ''} onChange={e => setDraft({...draft, sales_area: e.target.value})} />
              </label>
              <label className="admin-field">
                <span>Sales Territory</span>
                <input value={draft.sales_territory || ''} onChange={e => setDraft({...draft, sales_territory: e.target.value})} />
              </label>
            </div>

            <label className="admin-field" style={{ marginTop: '12px' }}>
              <span>Status</span>
              <select value={draft.status || 'active'} onChange={e => setDraft({...draft, status: e.target.value})}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
              <button type="button" className="admin-secondary" onClick={() => setEditorOpen(false)}>Cancel</button>
              <button type="submit" className="admin-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
