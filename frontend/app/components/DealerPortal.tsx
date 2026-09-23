'use client';
import '../dealer-portal.css';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import type { PublicUser } from './AuthFlow';

// ─── Types ─────────────────────────────────────────────────────────────────

type DealerDashboard = {
  dealer: {
    id: string; name: string; dealer_code: string;
    location?: string; state?: string; sales_territory?: string;
  };
  targets: {
    tier1_target: number; tier1_label: string;
    tier2_target: number; tier2_label: string;
    monthly_referrals: number; total_referrals: number;
    eligible_tier: 0 | 1 | 2;
  };
  redemptions: {
    monthly_count: number; monthly_amount: number;
    alltime_count: number; alltime_amount: number;
    month_label: string;
  };
};

type Redemption = {
  id: string; redeemed_at: string | null; coupon_code: string;
  campaign_name: string; discount_type: string;
  discount_value: number; amount_redeemed: number;
  purchase_reference: string | null;
  settled?: boolean;
  rules?: { products?: string[]; packings?: string[] };
};

type RedemptionSummary = {
  summary: { today_count:number; today_amount:number; month_count:number; month_amount:number; all_count:number; all_amount:number; outstanding_count:number; outstanding_amount:number };
  daily: {day:string;count:number;amount:number}[];
  monthly: {month:string;count:number;amount:number}[];
  credit_notes: {id:string;note_number:string;period_start:string;period_end:string;redemption_count:number;total_amount:number;status:string;generated_at:string;settled_at?:string|null;settlement_reference?:string|null}[];
};

type DealerReferral = {
  dealer_name: string; token: string; referral_url: string;
  qr_data_url: string | null;
};

type DealerPortalTab = 'splash' | 'inspect' | 'redeem' | 'referral';

// ─── API helper ─────────────────────────────────────────────────────────────

async function dealerApi<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1/dealers/${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text) as Record<string, unknown>; } catch { /* handled below */ }
  if (!response.ok) {
    const msg = typeof data.detail === 'string' ? data.detail : 'Request failed. Please try again.';
    throw new Error(msg);
  }
  return data as T;
}

async function couponApi<T>(token: string, body: unknown): Promise<T> {
  const response = await fetch('/api/v1/coupons/redeem', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text) as Record<string, unknown>; } catch { /* handled below */ }
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not redeem coupon.');
  }
  return data as T;
}

// ─── Splash / Mode Select Screen ────────────────────────────────────────────

function SplashScreen({
  user,
  dashboard,
  onSelect,
  onLogout,
}: {
  user: PublicUser;
  dashboard: DealerDashboard | null;
  onSelect: (tab: Exclude<DealerPortalTab, 'splash'>) => void;
  onLogout: () => Promise<void>;
}) {
  const dealer = dashboard?.dealer;
  const targets = dashboard?.targets;

  return (
    <div className="dp-splash">
      {/* Header */}
      <header className="dp-splash-header">
        <div className="dp-splash-brand">
          <img src="/clsl-logo.png" alt="CLSL" />
          <div>
            <strong>CLSL AI</strong>
            <small>Dealer Portal</small>
          </div>
        </div>
        <button type="button" className="dp-logout-btn" onClick={() => void onLogout()}>
          ↪ Logout
        </button>
      </header>

      {/* Hero identity */}
      <div className="dp-splash-hero">
        <div className="dp-splash-avatar">{(dealer?.name || user.first_name || 'D').slice(0, 2).toUpperCase()}</div>
        <h1>{dealer?.name || user.first_name || 'Dealer'}</h1>
        {dealer && (
          <p className="dp-splash-meta">
            {dealer.dealer_code}
            {dealer.sales_territory ? ` · ${dealer.sales_territory}` : ''}
            {dealer.state ? `, ${dealer.state}` : ''}
          </p>
        )}
        {targets && (
          <div className="dp-splash-tier-badge">
            {targets.eligible_tier === 2
              ? <span className="dp-tier-pill dp-tier-2">🏆 Tier 2 Eligible</span>
              : targets.eligible_tier === 1
                ? <span className="dp-tier-pill dp-tier-1">🎁 Tier 1 Eligible</span>
                : <span className="dp-tier-pill dp-tier-none">{targets.monthly_referrals} / {targets.tier1_target} farmers this month</span>}
          </div>
        )}
      </div>

      {/* Mode cards */}
      <div className="dp-splash-grid">
        <button type="button" className="dp-mode-card dp-mode-inspect" onClick={() => onSelect('inspect')}>
          <div className="dp-mode-icon">⌾</div>
          <div className="dp-mode-body">
            <strong>Crop Inspection</strong>
            <p>AI-powered crop disease detection for farmers</p>
          </div>
          <span className="dp-mode-arrow">→</span>
        </button>

        <button type="button" className="dp-mode-card dp-mode-redeem" onClick={() => onSelect('redeem')}>
          <div className="dp-mode-icon">✓</div>
          <div className="dp-mode-body">
            <strong>Redeem Coupon</strong>
            <p>Scan or enter farmer coupon codes instantly</p>
          </div>
          {dashboard && dashboard.redemptions.monthly_count > 0 && (
            <span className="dp-mode-badge">{dashboard.redemptions.monthly_count} this month</span>
          )}
          <span className="dp-mode-arrow">→</span>
        </button>

        <button type="button" className="dp-mode-card dp-mode-referral" onClick={() => onSelect('referral')}>
          <div className="dp-mode-icon">▣</div>
          <div className="dp-mode-body">
            <strong>Farmer Referral</strong>
            <p>Share your QR code and grow your network</p>
          </div>
          {targets && (
            <span className="dp-mode-badge">{targets.total_referrals} total</span>
          )}
          <span className="dp-mode-arrow">→</span>
        </button>
      </div>

      {/* Quick stats */}
      {dashboard && (
        <div className="dp-splash-stats">
          <div className="dp-splash-stat">
            <b>{dashboard.targets.monthly_referrals}</b>
            <small>Farmers this month</small>
          </div>
          <div className="dp-splash-stat-divider" />
          <div className="dp-splash-stat">
            <b>{dashboard.redemptions.monthly_count}</b>
            <small>Coupons redeemed</small>
          </div>
          <div className="dp-splash-stat-divider" />
          <div className="dp-splash-stat">
            <b>₹{dashboard.redemptions.monthly_amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
            <small>Redemption value</small>
          </div>
        </div>
      )}

      <footer className="dp-splash-footer">
        <img src="/clsl-logo.png" alt="Crop Life Science Limited" />
        <span>Crop Life Science Limited · Dealer Partner Portal</span>
      </footer>
    </div>
  );
}

// ─── Crop Inspection mode (embedded) ────────────────────────────────────────

function InspectMode({ onBack }: { onBack: () => void }) {
  return (
    <div className="dp-inner-screen">
      <div className="dp-inner-head">
        <button type="button" className="dp-back-btn" onClick={onBack}>← Back</button>
        <h2>Crop Inspection</h2>
      </div>
      <div className="dp-inner-body dp-inspect-body">
        <div className="dp-inspect-hero">
          <img src="/crop-life-mitra-tomato-doctor.jpg" alt="Crop Life Mitra" className="dp-inspect-mascot" />
          <div>
            <p className="dp-inspect-eyebrow">CLSL AI · Crop care support</p>
            <h3>AI Crop Doctor</h3>
            <p className="dp-inspect-desc">Use the CLSL AI crop inspection tool to help farmers identify crop diseases and get product recommendations.</p>
          </div>
        </div>
        <a href="/?open=inspect" className="dp-primary-btn dp-inspect-open-btn" target="_self">
          ⌾ Open Crop Inspection Tool
        </a>
        <p className="dp-inspect-note">
          The full CLSL AI crop inspection, CLSL product guidance and inspection history are available in the main app.
        </p>
      </div>
    </div>
  );
}

// ─── Redeem coupon mode ──────────────────────────────────────────────────────

function RedeemMode({ token, onBack }: { token: string; onBack: () => void }) {
  const [couponCode, setCouponCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ coupon_code: string; campaign_name: string; discount_value: number; discount_type: string } | null>(null);
  const [error, setError] = useState('');
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [summary, setSummary] = useState<RedemptionSummary | null>(null);
  const [period, setPeriod] = useState<'today'|'month'|'all'>('month');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('Point the camera at the farmer coupon QR code.');
  const [listLoading, setListLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimer = useRef<number | null>(null);

  const loadRedemptions = useCallback(async () => {
    setListLoading(true);
    try {
      const [data, totals] = await Promise.all([
        dealerApi<{ items: Redemption[] }>(`me/redemptions?per_page=50&period=${period}`, token),
        dealerApi<RedemptionSummary>('me/redemption-summary', token),
      ]);
      setRedemptions(data.items || []);
      setSummary(totals);
    } catch { /* non-critical */ }
    finally { setListLoading(false); }
  }, [token, period]);

  useEffect(() => { void loadRedemptions(); }, [loadRedemptions]);

  const redeemCode = useCallback(async (rawCode: string) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) return;
    setLoading(true); setError(''); setSuccess(null);
    try {
      const result = await couponApi<{ coupon_code: string; campaign_name: string; discount_value: number; discount_type: string }>(
        token, { coupon_code: code }
      );
      setSuccess(result);
      setCouponCode('');
      void loadRedemptions();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not redeem coupon.'); }
    finally { setLoading(false); }
  }, [loadRedemptions, token]);

  const submit = async (event: FormEvent) => { event.preventDefault(); await redeemCode(couponCode); };
  const stopScanner = useCallback(() => {
    if (scanTimer.current) window.clearTimeout(scanTimer.current);
    scanTimer.current = null; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = null; setScannerOpen(false);
  }, []);
  useEffect(() => () => stopScanner(), [stopScanner]);
  const openScanner = async () => {
    setError(''); setScannerMessage('Point the camera at the farmer coupon QR code.'); setScannerOpen(true);
    try {
      type BarcodeResult={rawValue:string}; type Source=HTMLVideoElement;
      type DetectorCtor=new(options:{formats:string[]})=>{detect(source:Source):Promise<BarcodeResult[]>};
      const Detector=(window as unknown as {BarcodeDetector?:DetectorCtor}).BarcodeDetector;
      if(!Detector) throw new Error('Live QR scanning is not supported by this browser. Use Chrome on Android or enter the coupon code manually.');
      const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}); streamRef.current=stream;
      await new Promise<void>(resolve=>window.requestAnimationFrame(()=>resolve()));
      const video=videoRef.current; if(!video) throw new Error('Camera preview could not start.'); video.srcObject=stream; await video.play();
      const detector=new Detector({formats:['qr_code']}); let finished=false;
      const scan=async()=>{if(finished||!videoRef.current)return;try{const results=await detector.detect(videoRef.current);if(results[0]?.rawValue){finished=true;let value=results[0].rawValue;try{const url=new URL(value);value=url.searchParams.get('code')||url.searchParams.get('coupon')||url.pathname.split('/').filter(Boolean).pop()||value;}catch{} stopScanner();setCouponCode(value.toUpperCase());await redeemCode(value);return;}}catch{} scanTimer.current=window.setTimeout(scan,300)}; void scan();
    } catch(e){stopScanner();setError(e instanceof Error?e.message:'Camera could not start.');}
  };
  const downloadReport = async () => {
    setError('');
    try { const response=await fetch(`/api/v1/dealers/me/redemptions/report.pdf?period=${period}`,{headers:{authorization:`Bearer ${token}`}});if(!response.ok)throw new Error('The PDF statement could not be created.');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`CLSL-${period}-redemptions.pdf`;a.click();URL.revokeObjectURL(url); }
    catch(e){setError(e instanceof Error?e.message:'The PDF statement could not be downloaded.');}
  };

  return (
    <div className="dp-inner-screen">
      <div className="dp-inner-head">
        <button type="button" className="dp-back-btn" onClick={onBack}>← Back</button>
        <h2>Redeem Coupon</h2>
      </div>
      <div className="dp-inner-body">
        <div className="dp-section">
          <div className="dp-section-label">SCAN OR ENTER</div>
          <h3 className="dp-section-title">Redeem Farmer Coupon</h3>
          <p className="dp-help-text">Ask the farmer to show you the coupon code from their CLSL AI app. Enter or scan the code below to redeem it.</p>

          <form className="dp-redeem-form" onSubmit={(e) => void submit(e)}>
            <div className="dp-code-input-row">
              <input
                id="dp-coupon-code"
                type="text"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setSuccess(null); setError(''); }}
                placeholder="Enter coupon code (e.g. CLJ-2024-XXXX)"
                autoCapitalize="characters"
                autoComplete="off"
                className="dp-code-input"
              />
              <button
                type="button"
                className="dp-scan-btn"
                onClick={() => void openScanner()}
                title="Scan QR code from farmer's phone"
              >
                <span aria-hidden="true">▣</span> Scan QR
              </button>
            </div>
            {scannerOpen && <div className="dp-scanner-overlay" role="dialog" aria-modal="true"><div className="dp-scanner-sheet"><header><div><small>LIVE QR SCANNER</small><h3>Scan farmer coupon</h3></div><button type="button" onClick={stopScanner}>×</button></header><div className="dp-scanner-viewport"><video ref={videoRef} muted playsInline/><span/><i/><b/></div><p>{scannerMessage}</p><button type="button" className="dp-secondary-btn" onClick={stopScanner}>Cancel scanning</button></div></div>}

            {error && <p className="dp-error-msg" role="alert">⚠ {error}</p>}

            {success && (
              <div className="dp-success-card" role="status">
                <span className="dp-success-icon">✓</span>
                <div>
                  <b>Coupon Redeemed!</b>
                  <p>{success.coupon_code} · {success.campaign_name}</p>
                  <small>
                    Value: {success.discount_type === 'percentage'
                      ? `${success.discount_value}%`
                      : `₹${success.discount_value.toLocaleString('en-IN')}`}
                  </small>
                </div>
              </div>
            )}

            <button
              type="submit"
              className="dp-primary-btn"
              disabled={loading || !couponCode.trim()}
            >
              {loading ? <><span className="dp-spinner" /> Processing…</> : '✓ Redeem Coupon'}
            </button>
          </form>
        </div>

        <div className="dp-section">
          <div className="dp-section-label">RECONCILIATION LEDGER</div>
          <h3 className="dp-section-title">Coupon activity & credit</h3>
          {summary&&<><div className="dp-ledger-kpis"><article><small>Today</small><b>₹{Number(summary.summary.today_amount||0).toLocaleString('en-IN')}</b><span>{summary.summary.today_count||0} scans</span></article><article><small>This month</small><b>₹{Number(summary.summary.month_amount||0).toLocaleString('en-IN')}</b><span>{summary.summary.month_count||0} scans</span></article><article><small>Outstanding</small><b>₹{Number(summary.summary.outstanding_amount||0).toLocaleString('en-IN')}</b><span>{summary.summary.outstanding_count||0} coupons</span></article></div><div className="dp-ledger-trend">{summary.daily.slice(-14).map(item=>{const max=Math.max(...summary.daily.slice(-14).map(x=>Number(x.amount)),1);return <div key={item.day} title={`${item.day}: ₹${item.amount}`}><span style={{height:`${Math.max(8,Number(item.amount)/max*100)}%`}}/><small>{new Date(item.day).getDate()}</small></div>})}</div></>}
          <div className="dp-ledger-toolbar"><div>{(['today','month','all'] as const).map(item=><button type="button" className={period===item?'active':''} onClick={()=>setPeriod(item)} key={item}>{item==='today'?'Today':item==='month'?'This month':'All time'}</button>)}</div><button type="button" onClick={()=>void downloadReport()}>↓ Download PDF</button></div>
          {listLoading ? (
            <div className="dp-loading"><span className="dp-spinner" />Loading…</div>
          ) : redemptions.length === 0 ? (
            <p className="dp-empty">No coupons redeemed in this period.</p>
          ) : (
            <div className="dp-redemption-list">
              {redemptions.map((r) => (
                <article key={r.id} className="dp-redemption-row">
                  <span className="dp-redemption-icon">✓</span>
                  <div>
                    <b>{r.coupon_code}</b>
                    <small>{r.campaign_name}</small>
                  </div>
                  <div className="dp-redemption-amount">
                    <b>₹{r.amount_redeemed.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>
                    <small>{r.redeemed_at ? new Date(r.redeemed_at).toLocaleString('en-IN') : '—'} · {r.settled?'In credit note':'Outstanding'}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!!summary?.credit_notes.length&&<div className="dp-settlement-list"><h4>Settlement history</h4>{summary.credit_notes.map(note=><article key={note.id}><div><b>{note.note_number}</b><small>{note.period_start} – {note.period_end} · {note.redemption_count} coupons</small></div><div><b>₹{Number(note.total_amount).toLocaleString('en-IN')}</b><small>{note.status==='settled'?`Settled ${note.settled_at?new Date(note.settled_at).toLocaleDateString('en-IN'):''}`:'Awaiting CLSL settlement'}{note.settlement_reference?` · ${note.settlement_reference}`:''}</small></div></article>)}</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Referral mode ───────────────────────────────────────────────────────────

function ReferralMode({ token, onBack }: { token: string; onBack: () => void }) {
  const [data, setData] = useState<DealerReferral | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await dealerApi<DealerReferral>('me/referral', token, { method: 'GET' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load referral.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const shareWhatsApp = () => {
    if (!data?.token) return;
    const text = `Hi, use this ${data.token} referral code in the CLSL AI application to get rewards on CLSL products. Ask your nearest CLSL dealer if you need help.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  return (
    <div className="dp-inner-screen">
      <div className="dp-inner-head">
        <button type="button" className="dp-back-btn" onClick={onBack}>← Back</button>
        <h2>Farmer Referral</h2>
      </div>
      <div className="dp-inner-body">
        {loading && <div className="dp-loading"><span className="dp-spinner" />Loading your referral code…</div>}
        {error && (
          <div className="dp-error">
            <b>⚠ {error}</b>
            <button type="button" onClick={() => void load()}>Retry</button>
          </div>
        )}
        {data && (
          <>
            <div className="dp-section">
              <div className="dp-section-label">YOUR REFERRAL TOOL</div>
              <h3 className="dp-section-title">Invite Farmers</h3>
              <p className="dp-help-text">Let farmers scan this QR code or share the same seven-character code shown in the CLSL dashboard.</p>

              <div className="dp-qr-card">
                <div className="dp-qr-frame" aria-label={`Referral QR code for ${data.dealer_name}`}>
                  <QRCode value={data.token} size={220} level="M" bgColor="#ffffff" fgColor="#183326" />
                </div>
                <p>Farmers can scan this QR directly from your phone.</p>
              </div>

              <div className="dp-referral-code-box">
                <p>Farmer referral code</p>
                <code>{data.token}</code>
                <small>This is the same referral code stored in the CLSL dashboard.</small>
              </div>

              <button type="button" className="dp-whatsapp-btn dp-whatsapp-share" onClick={shareWhatsApp}>
                Send referral code on WhatsApp
              </button>
            </div>

            <div className="dp-section dp-how-section">
              <h3 className="dp-section-title">How it works</h3>
              <ol className="dp-how-list">
                <li><b>Show the QR or send the code</b> to farmers in your area.</li>
                <li><b>Farmer registers</b> on CLSL AI using your seven-character referral code.</li>
                <li><b>You get credit</b> — the farmer counts toward your monthly referral target.</li>
                <li><b>Earn rewards</b> — reach your target to unlock CLSL gifts!</li>
              </ol>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main DealerPortal component ─────────────────────────────────────────────

export function DealerPortal({
  token,
  user,
  onLogout,
}: {
  token: string;
  user: PublicUser;
  onLogout: () => Promise<void>;
}) {
  const [tab, setTab] = useState<DealerPortalTab>('splash');
  const [dashboard, setDashboard] = useState<DealerDashboard | null>(null);
  const [dashError, setDashError] = useState('');

  // Load dashboard data in background for the splash screen stats
  useEffect(() => {
    let active = true;
    dealerApi<DealerDashboard>('me/dashboard', token)
      .then((data) => { if (active) setDashboard(data); })
      .catch((e) => { if (active) setDashError(e instanceof Error ? e.message : 'Unable to load dashboard.'); });
    return () => { active = false; };
  }, [token]);

  const goBack = () => setTab('splash');

  if (tab === 'inspect') return <InspectMode onBack={goBack} />;
  if (tab === 'redeem') return <RedeemMode token={token} onBack={goBack} />;
  if (tab === 'referral') return <ReferralMode token={token} onBack={goBack} />;

  return (
    <div className="dp-shell">
      {dashError && !dashboard && (
        <div className="dp-top-error" role="alert">
          ⚠ {dashError} — some stats may be unavailable.
        </div>
      )}
      <SplashScreen
        user={user}
        dashboard={dashboard}
        onSelect={setTab}
        onLogout={onLogout}
      />
    </div>
  );
}
