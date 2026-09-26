// API service layer — communicates with the CLSL AI backend
import { AUTH_API, ASSISTANT_API, CATALOG_API, FIELD_API, API_BASE, DEALER_API } from '../config/api';
import { getSessionToken } from './storage';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request<T>(
  url: string,
  method: HttpMethod = 'GET',
  body?: unknown,
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'accept': 'application/json',
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const raw = await response.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    /* non-JSON response */
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof data.detail === 'string' ? data.detail : 'Something went wrong. Please try again.',
    );
  }

  return data as T;
}

// ─── Auth Endpoints ──────────────────────────────────────────
export async function dealerMobileStatus(mobileNumber: string) {
  return request<{ is_registered_dealer: boolean }>(
    `${AUTH_API}/dealer-mobile-status`,
    'POST',
    { mobile_number: mobileNumber },
  );
}

export async function dealerLookup(dealerCode: string, mobileNumber: string) {
  return request<{ dealer: { dealer_code: string; name: string; owner_name?: string; state?: string; already_bound?: boolean; mobile_matches?: boolean } }>(
    `${AUTH_API}/dealer-lookup`,
    'POST',
    { dealer_code: dealerCode, mobile_number: mobileNumber },
  );
}

export async function referralLookup(referralCode: string) {
  return request<{ dealer: { name: string } }>(
    `${AUTH_API}/referral-lookup`,
    'POST',
    { referral_code: referralCode },
  );
}

export async function sendOtp(payload: {
  mobile_number: string;
  first_name: string;
  last_name?: string;
  preferred_language: string;
  dealer_code?: string;
}) {
  return request<{ status: string }>(
    `${AUTH_API}/send-otp`,
    'POST',
    payload,
  );
}

export async function verifyOtp(mobileNumber: string, otp: string) {
  return request<{ session_token: string; user: { id: string; first_name: string; mobile_number: string; role: string; preferred_language: string } }>(
    `${AUTH_API}/verify-otp`,
    'POST',
    { mobile_number: mobileNumber, otp },
  );
}

export async function updateProfile(token: string, profileData: Record<string, unknown>) {
  return request<{ user: Record<string, unknown> }>(
    `${AUTH_API}/profile`,
    'POST',
    profileData,
    token,
  );
}

export async function getMe(token: string) {
  return request<{ user: Record<string, unknown> }>(
    `${AUTH_API}/me`,
    'POST',
    {},
    token,
  );
}

export async function logout(token: string) {
  return request<{ status: string }>(
    `${AUTH_API}/logout`,
    'POST',
    {},
    token,
  );
}

export async function getMyCoupons(token: string) {
  return request<{ coupons: Array<Record<string, unknown>>, redemptions: Array<Record<string, unknown>> }>(
    `${AUTH_API}/me/coupons`,
    'POST',
    {},
    token,
  );
}

export async function getMyInspections(token: string) {
  return request<{ inspections: Array<Record<string, unknown>> }>(
    `${AUTH_API}/me/inspections`,
    'POST',
    {},
    token,
  );
}

// ─── Catalog Endpoints ───────────────────────────────────────
export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  commonName: string;
  formulation: string;
  dose: string;
  useBenefits: string;
  packing: string;
  image: string;
  approvedCrops: string[];
}

export async function getCatalogue(): Promise<{ items: CatalogProduct[]; crops?: string[]; categories?: string[] }> {
  const raw = await request<{ items: CatalogProduct[]; crops?: string[]; categories?: string[] }>(
    `${CATALOG_API}/live`,
    'GET',
  );
  return raw;
}

export async function getHomeStats(): Promise<{ productCount: number; cropCount: number; categories: string[] }> {
  try {
    const { items } = await getCatalogue();
    const crops = new Set<string>();
    const cats = new Set<string>();
    items.forEach(p => {
      (p.approvedCrops || []).forEach(c => crops.add(c.trim().toLowerCase()));
      if (p.category) cats.add(p.category);
    });
    return { productCount: items.length, cropCount: crops.size, categories: [...cats] };
  } catch {
    return { productCount: 73, cropCount: 25, categories: [] };
  }
}

// ─── Assistant / Crop Inspection ─────────────────────────────
export async function reserveInspection(token: string) {
  return request<{ request_id: string }>(
    `${ASSISTANT_API}/reserve`,
    'POST',
    {},
    token,
  );
}

export async function inspectCrop(payload: { token: string; crop: string; photos: string[]; latitude: number; longitude: number; language?: string; notes?: string }) {
  const form = new FormData();
  form.append('crop', payload.crop);
  form.append('latitude', String(payload.latitude));
  form.append('longitude', String(payload.longitude));
  form.append('language', payload.language || 'en');
  if (payload.notes) form.append('notes', payload.notes);
  payload.photos.forEach((uri, index) => form.append('images', { uri, name: `crop-${index + 1}.jpg`, type: 'image/jpeg' } as unknown as Blob));
  const response = await fetch(`${API_BASE}/api/inspect`, { method: 'POST', headers: { authorization: `Bearer ${payload.token}`, accept: 'application/json' }, body: form });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new ApiError(response.status, typeof data.error === 'string' ? data.error : 'Unable to analyse these photos.');
  return data;
}

export async function askMitra(question: string, history: Array<{ role: string; content: string }>, language = 'English') {
  return request<{ answer: string; products?: Array<Record<string, unknown>>; contacts?: Array<Record<string, unknown>> }>(
    `${API_BASE}/api/chat`, 'POST', { question, history, language }, await getSessionToken(),
  );
}

// ─── Field Identity ──────────────────────────────────────────
export async function getFieldIdentity(token: string) {
  return request<Record<string, unknown>>(
    `${FIELD_API}/identity`,
    'GET',
    undefined,
    token,
  );
}

export async function getDealerDashboard(token: string) {
  return request<{ dealer: { name: string; dealer_code: string; location?: string; state?: string }; targets: { monthly_referrals: number; total_referrals: number }; redemptions: { monthly_count: number; monthly_amount: number } }>(`${DEALER_API}/me/dashboard`, 'GET', undefined, token);
}

export async function getDealerReferral(token: string) {
  return request<{ dealer_name: string; token: string; qr_data_url?: string | null }>(`${DEALER_API}/me/referral`, 'GET', undefined, token);
}

// ─── i18n ─────────────────────────────────────────────────────────
export async function getI18nTranslations(lang: string) {
  try {
    const res = await fetch(`${API_BASE}/api/i18n/login?lang=${lang}`);
    return await res.json();
  } catch (e) {
    return null;
  }
}
