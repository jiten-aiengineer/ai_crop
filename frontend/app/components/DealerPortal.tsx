'use client';
import '../dealer-portal.css';

import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
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
            <p className="dp-inspect-eyebrow">CLSL AI · Powered by Gemini</p>
            <h3>AI Crop Doctor</h3>
            <p className="dp-inspect-desc">Use the CLSL AI crop inspection tool to help farmers identify crop diseases and get product recommendations.</p>
          </div>
        </div>
        <a href="/?open=inspect" className="dp-primary-btn dp-inspect-open-btn" target="_self">
          ⌾ Open Crop Inspection Tool
        </a>
        <p className="dp-inspect-note">
          The full CLSL AI crop inspection with Gemini AI analysis, product recommendations, and inspection history is available in the main app.
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
  const [listLoading, setListLoading] = useState(true);
  const qrInput = useRef<HTMLInputElement>(null);

  const loadRedemptions = useCallback(async () => {
    setListLoading(true);
    try {
      const data = await dealerApi<{ items: Redemption[] }>('me/redemptions?per_page=10', token);
      setRedemptions(data.items || []);
    } catch { /* non-critical */ }
    finally { setListLoading(false); }
  }, [token]);

  useEffect(() => { void loadRedemptions(); }, [loadRedemptions]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const code = couponCode.trim().toUpperCase();
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
  };

  const scanQr = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      type BarcodeResult = { rawValue: string };
      type BarcodeDetectorCtor = new (options: { formats: string[] }) => { detect(source: ImageBitmap): Promise<BarcodeResult[]> };
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
      if (!Detector) throw new Error('QR scanning is not supported on this device. Please enter the code manually.');
      const bitmap = await createImageBitmap(file);
      const codes = await new Detector({ formats: ['qr_code'] }).detect(bitmap);
      bitmap.close();
      if (!codes[0]?.rawValue) throw new Error('No QR code found in this image. Please try again.');
      let value = codes[0].rawValue;
      try {
        const url = new URL(value);
        value = url.searchParams.get('code') || url.searchParams.get('coupon') || url.pathname.split('/').filter(Boolean).pop() || value;
      } catch { /* plain code token */ }
      setCouponCode(value.toUpperCase());
    } catch (e) { setError(e instanceof Error ? e.message : 'QR scan failed.'); }
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
                onClick={() => qrInput.current?.click()}
                title="Scan QR code from farmer's phone"
              >
                <span aria-hidden="true">▣</span> Scan QR
              </button>
            </div>
            <input ref={qrInput} hidden type="file" accept="image/*" capture="environment" onChange={(e) => void scanQr(e)} />

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
          <div className="dp-section-label">HISTORY</div>
          <h3 className="dp-section-title">Recent Redemptions</h3>
          {listLoading ? (
            <div className="dp-loading"><span className="dp-spinner" />Loading…</div>
          ) : redemptions.length === 0 ? (
            <p className="dp-empty">No coupons redeemed yet. Redeem your first coupon above.</p>
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
                    <small>{r.redeemed_at ? new Date(r.redeemed_at).toLocaleDateString('en-IN') : '—'}</small>
                  </div>
                </article>
              ))}
            </div>
          )}
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
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await dealerApi<DealerReferral>('me/referral', token, { method: 'GET' })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load referral.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const copyLink = async () => {
    if (!data?.referral_url) return;
    try { await navigator.clipboard.writeText(data.referral_url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard may be unavailable */ }
  };

  const shareWhatsApp = () => {
    if (!data?.referral_url) return;
    const text = `Namaste! I am your CLSL Dealer. Register on CLSL AI for free crop care guidance: ${data.referral_url}`;
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
              <p className="dp-help-text">Share your referral link or let farmers scan your QR code. Each registration counts toward your monthly target.</p>

              {data.qr_data_url ? (
                <div className="dp-qr-card">
                  <img src={data.qr_data_url} alt={`Referral QR code for ${data.dealer_name}`} className="dp-qr-image" />
                  <p><small>Farmers scan this with their phone camera</small></p>
                </div>
              ) : (
                <div className="dp-qr-card dp-qr-unavailable">
                  <span>▣</span>
                  <p><small>QR generation unavailable on this server. Use the link below.</small></p>
                </div>
              )}

              <div className="dp-referral-link-box">
                <code className="dp-referral-link">{data.referral_url}</code>
                <div className="dp-referral-actions">
                  <button type="button" className="dp-copy-btn" onClick={() => void copyLink()}>
                    {copied ? '✓ Copied!' : '⎘ Copy link'}
                  </button>
                  <button type="button" className="dp-whatsapp-btn" onClick={shareWhatsApp}>
                    ◉ Share via WhatsApp
                  </button>
                </div>
              </div>

              <button type="button" className="dp-secondary-btn" onClick={() => void load()} disabled={loading}>
                ↻ Refresh code
              </button>
            </div>

            <div className="dp-section dp-how-section">
              <h3 className="dp-section-title">How it works</h3>
              <ol className="dp-how-list">
                <li><b>Share your link or QR</b> with farmers in your area.</li>
                <li><b>Farmer registers</b> on CLSL AI using your link — they get free crop care.</li>
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
