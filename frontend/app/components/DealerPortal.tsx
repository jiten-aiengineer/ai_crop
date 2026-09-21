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

type DealerPortalTab = 'dashboard' | 'redeem' | 'referral';

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

// ─── Target progress ring ───────────────────────────────────────────────────

function TargetRing({ count, target, tier }: { count: number; target: number; tier: 0 | 1 | 2 }) {
  const pct = Math.min(1, count / target);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - pct);
  const color = tier === 2 ? '#22c55e' : tier === 1 ? '#f59e0b' : '#6366f1';

  return (
    <svg className="dp-target-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="10" />
      <circle
        cx="50" cy="50" r={radius} fill="none"
        stroke={color} strokeWidth="10"
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 1s ease', transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}
      />
      <text x="50" y="46" textAnchor="middle" fill="#fff" fontSize="18" fontWeight="700">{count}</text>
      <text x="50" y="62" textAnchor="middle" fill="rgba(255,255,255,.6)" fontSize="10">of {target}</text>
    </svg>
  );
}

// ─── Dashboard tab ──────────────────────────────────────────────────────────

function DashboardTab({ token }: { token: string }) {
  const [data, setData] = useState<DealerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await dealerApi<DealerDashboard>('me/dashboard', token)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to load dashboard.'); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <div className="dp-loading"><span className="dp-spinner" />Loading your dashboard…</div>;
  if (error) return <div className="dp-error"><b>⚠ {error}</b><button type="button" onClick={() => void load()}>Retry</button></div>;
  if (!data) return null;

  const { dealer, targets, redemptions } = data;
  const tierBadge = targets.eligible_tier === 2
    ? { label: '🏆 Tier 2 Eligible', cls: 'dp-tier-2' }
    : targets.eligible_tier === 1
      ? { label: '🎁 Tier 1 Eligible', cls: 'dp-tier-1' }
      : { label: 'Keep going!', cls: 'dp-tier-none' };

  return (
    <div className="dp-dashboard">
      {/* Dealer identity card */}
      <section className="dp-identity-card">
        <div className="dp-identity-avatar">{dealer.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <small>CLSL DEALER PORTAL</small>
          <b>{dealer.name}</b>
          <p>{dealer.dealer_code}{dealer.sales_territory ? ` · ${dealer.sales_territory}` : ''}{dealer.state ? `, ${dealer.state}` : ''}</p>
        </div>
      </section>

      {/* Target section */}
      <section className="dp-section dp-targets-section">
        <header>
          <div>
            <small>THIS MONTH</small>
            <h2>Farmer Referral Target</h2>
          </div>
          <span className={`dp-tier-badge ${tierBadge.cls}`}>{tierBadge.label}</span>
        </header>

        <div className="dp-target-grid">
          {/* Tier 1 */}
          <article className={`dp-target-card ${targets.monthly_referrals >= targets.tier1_target ? 'achieved' : ''}`}>
            <TargetRing
              count={targets.monthly_referrals}
              target={targets.tier1_target}
              tier={targets.eligible_tier}
            />
            <div>
              <b>Tier 1 Target</b>
              <p>{targets.tier1_label}</p>
              <small>{targets.monthly_referrals} / {targets.tier1_target} farmers this month</small>
            </div>
          </article>

          {/* Tier 2 */}
          <article className={`dp-target-card dp-target-2 ${targets.monthly_referrals >= targets.tier2_target ? 'achieved' : ''}`}>
            <TargetRing
              count={targets.monthly_referrals}
              target={targets.tier2_target}
              tier={targets.eligible_tier === 2 ? 2 : 0}
            />
            <div>
              <b>Tier 2 Target</b>
              <p>{targets.tier2_label}</p>
              <small>{targets.monthly_referrals} / {targets.tier2_target} farmers this month</small>
            </div>
          </article>
        </div>

        <div className="dp-stats-row">
          <div className="dp-stat">
            <b>{targets.monthly_referrals}</b>
            <small>Farmers referred this month</small>
          </div>
          <div className="dp-stat">
            <b>{targets.total_referrals}</b>
            <small>Total farmers (all time)</small>
          </div>
        </div>
      </section>

      {/* Coupon redemption summary */}
      <section className="dp-section dp-coupon-summary">
        <header>
          <div>
            <small>COUPON REDEMPTIONS</small>
            <h2>{redemptions.month_label}</h2>
          </div>
        </header>
        <div className="dp-stats-row">
          <div className="dp-stat dp-stat-highlight">
            <b>₹ {redemptions.monthly_amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</b>
            <small>Total redeemed value this month</small>
          </div>
          <div className="dp-stat">
            <b>{redemptions.monthly_count}</b>
            <small>Coupons redeemed this month</small>
          </div>
          <div className="dp-stat">
            <b>{redemptions.alltime_count}</b>
            <small>Coupons redeemed (all time)</small>
          </div>
        </div>
        <p className="dp-credit-note-hint">
          ✓ CLSL will generate a credit note based on your monthly redemption total at month end.
        </p>
      </section>
    </div>
  );
}

// ─── Redeem coupon tab ──────────────────────────────────────────────────────

function RedeemTab({ token }: { token: string }) {
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
    } catch { /* non-critical, don't block redeem flow */ }
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
      // Extract code from URL or use raw value
      let value = codes[0].rawValue;
      try {
        const url = new URL(value);
        // If the QR contains a URL, extract the coupon code from query or last segment
        value = url.searchParams.get('code') || url.searchParams.get('coupon') || url.pathname.split('/').filter(Boolean).pop() || value;
      } catch { /* plain code token */ }
      setCouponCode(value.toUpperCase());
    } catch (e) { setError(e instanceof Error ? e.message : 'QR scan failed.'); }
  };

  return (
    <div className="dp-redeem">
      <section className="dp-section">
        <header>
          <div>
            <small>SCAN OR ENTER</small>
            <h2>Redeem Farmer Coupon</h2>
          </div>
        </header>
        <p className="dp-help-text">
          Ask the farmer to show you the coupon code from their CLSL AI app. Enter or scan the code below to redeem it.
        </p>

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
      </section>

      {/* Recent redemptions */}
      <section className="dp-section">
        <header>
          <div>
            <small>HISTORY</small>
            <h2>Recent Redemptions</h2>
          </div>
        </header>
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
      </section>
    </div>
  );
}

// ─── Referral tab ───────────────────────────────────────────────────────────

function ReferralTab({ token }: { token: string }) {
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

  if (loading) return <div className="dp-loading"><span className="dp-spinner" />Loading your referral code…</div>;
  if (error) return <div className="dp-error"><b>⚠ {error}</b><button type="button" onClick={() => void load()}>Retry</button></div>;

  return (
    <div className="dp-referral">
      <section className="dp-section">
        <header>
          <div>
            <small>YOUR REFERRAL TOOL</small>
            <h2>Invite Farmers</h2>
          </div>
        </header>
        <p className="dp-help-text">
          Share your referral link or let farmers scan your QR code with their phone camera.
          Farmers who register through your link are attributed to your dealership for the monthly target.
        </p>

        {data && (
          <>
            {/* QR code */}
            {data.qr_data_url ? (
              <div className="dp-qr-card">
                <img
                  src={data.qr_data_url}
                  alt={`Referral QR code for ${data.dealer_name}`}
                  className="dp-qr-image"
                />
                <p><small>Farmers scan this with their phone camera</small></p>
              </div>
            ) : (
              <div className="dp-qr-card dp-qr-unavailable">
                <span>▣</span>
                <p><small>QR generation unavailable on this server. Use the link below.</small></p>
              </div>
            )}

            {/* Link */}
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

            {/* Refresh button */}
            <button type="button" className="dp-secondary-btn" onClick={() => void load()} disabled={loading}>
              ↻ Refresh code
            </button>
          </>
        )}
      </section>

      <section className="dp-section dp-referral-info">
        <h3>How it works</h3>
        <ol className="dp-how-list">
          <li><b>Share your link or QR</b> with farmers in your area.</li>
          <li><b>Farmer registers</b> on CLSL AI using your link — they get free crop care.</li>
          <li><b>You get credit</b> — the farmer is counted toward your monthly referral target.</li>
          <li><b>Earn rewards</b> — reach your target to unlock CLSL gifts!</li>
        </ol>
      </section>
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
  const [tab, setTab] = useState<DealerPortalTab>('dashboard');

  return (
    <main className="dp-shell">
      {/* Top bar */}
      <header className="dp-topbar">
        <div className="dp-topbar-brand">
          <img src="/clsl-logo.png" alt="CLSL" />
          <span><strong>CLSL AI</strong><small>Dealer Portal</small></span>
        </div>
        <div className="dp-topbar-right">
          <span className="dp-user-chip">{user.first_name || 'Dealer'}</span>
          <button type="button" className="dp-logout-btn" onClick={() => void onLogout()}>
            ↪ Logout
          </button>
        </div>
      </header>

      {/* Navigation tabs */}
      <nav className="dp-tabs" aria-label="Dealer portal sections">
        <button
          className={tab === 'dashboard' ? 'active' : ''}
          onClick={() => setTab('dashboard')}
          aria-current={tab === 'dashboard' ? 'page' : undefined}
        >
          <span aria-hidden="true">⌂</span> Dashboard
        </button>
        <button
          className={tab === 'redeem' ? 'active' : ''}
          onClick={() => setTab('redeem')}
          aria-current={tab === 'redeem' ? 'page' : undefined}
        >
          <span aria-hidden="true">✓</span> Redeem Coupon
        </button>
        <button
          className={tab === 'referral' ? 'active' : ''}
          onClick={() => setTab('referral')}
          aria-current={tab === 'referral' ? 'page' : undefined}
        >
          <span aria-hidden="true">▣</span> Referral
        </button>
      </nav>

      {/* Tab content */}
      <div className="dp-content">
        {tab === 'dashboard' && <DashboardTab token={token} />}
        {tab === 'redeem' && <RedeemTab token={token} />}
        {tab === 'referral' && <ReferralTab token={token} />}
      </div>

      {/* Footer */}
      <footer className="dp-footer">
        <img src="/clsl-logo.png" alt="Crop Life Science Limited" />
        <div><b>Crop Life Science Limited</b><small>Dealer Partner Portal</small></div>
      </footer>
    </main>
  );
}
