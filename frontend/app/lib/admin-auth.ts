import { createHash, createHmac, createPublicKey, randomBytes, scryptSync, timingSafeEqual, verify as verifySignature, type JsonWebKey as NodeJsonWebKey } from 'node:crypto';
import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'clsl_admin_session';
const OAUTH_COOKIE = 'clsl_admin_oauth';
const PASSWORD_ATTEMPT_LIMIT = 5;
const PASSWORD_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const passwordAttempts = new Map<string, { count: number; until: number }>();

type SignedPayload = Record<string, unknown> & { exp: number };
export type AdminSession = { email: string; name: string; exp: number };
type AuthMode = 'password' | 'microsoft' | 'none';
type TemporaryAccount = { username: string; email: string; name: string; passwordHash: string };

function environment(name: string) { return (process.env[name] || '').trim(); }

function temporaryAccounts() {
  const legacy: TemporaryAccount[] = [];
  const legacyUsername = environment('TEMP_ADMIN_USERNAME').toLowerCase();
  const legacyEmail = environment('TEMP_ADMIN_EMAIL').toLowerCase();
  const legacyPasswordHash = environment('TEMP_ADMIN_PASSWORD_HASH');
  if (legacyUsername && legacyEmail && legacyPasswordHash) {
    legacy.push({ username: legacyUsername, email: legacyEmail, name: 'Jiten Advani', passwordHash: legacyPasswordHash });
  }

  const configured = environment('TEMP_DEMO_ACCOUNTS_JSON');
  if (!configured) return legacy;
  try {
    const parsed = JSON.parse(configured) as unknown;
    if (!Array.isArray(parsed)) return legacy;
    const demos = parsed.flatMap((item): TemporaryAccount[] => {
      if (!item || typeof item !== 'object') return [];
      const value = item as Record<string, unknown>;
      const username = typeof value.username === 'string' ? value.username.trim().toLowerCase() : '';
      const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : '';
      const name = typeof value.name === 'string' ? value.name.trim().slice(0, 180) : '';
      const passwordHash = typeof value.passwordHash === 'string' ? value.passwordHash.trim() : '';
      if (!/^[a-z0-9._-]{2,64}$/.test(username) || !/^[-a-z0-9._+]+@[-a-z0-9.]+\.[a-z]{2,}$/i.test(email) || !name || !passwordHash.startsWith('scrypt$')) return [];
      return [{ username, email, name, passwordHash }];
    });
    const seen = new Set(legacy.map((account) => account.username));
    const uniqueDemos: TemporaryAccount[] = [];
    for (const account of demos) {
      if (seen.has(account.username)) continue;
      seen.add(account.username);
      uniqueDemos.push(account);
    }
    return [...legacy, ...uniqueDemos];
  } catch {
    return legacy;
  }
}

export function adminConfiguration() {
  const hostname = environment('ADMIN_PORTAL_HOSTNAME').toLowerCase();
  const origin = environment('ADMIN_PORTAL_ORIGIN').replace(/\/$/, '');
  const tenantId = environment('ENTRA_TENANT_ID');
  const clientId = environment('ENTRA_CLIENT_ID');
  const clientSecret = environment('ENTRA_CLIENT_SECRET');
  const sessionSecret = environment('ADMIN_PORTAL_SESSION_SECRET');
  const backendUrl = environment('ADMIN_BACKEND_URL').replace(/\/$/, '');
  const gatewayToken = environment('ADMIN_GATEWAY_TOKEN');
  const tempAccounts = temporaryAccounts();
  const baseConfigured = Boolean(hostname && origin && sessionSecret.length >= 32 && backendUrl && gatewayToken);
  const microsoftConfigured = Boolean(baseConfigured && tenantId && clientId && clientSecret);
  const temporaryPasswordConfigured = Boolean(baseConfigured && tempAccounts.length);
  const authMode: AuthMode = microsoftConfigured ? 'microsoft' : temporaryPasswordConfigured ? 'password' : 'none';
  return {
    hostname, origin, tenantId, clientId, clientSecret, sessionSecret, backendUrl, gatewayToken,
    tempAccounts,
    microsoftConfigured, temporaryPasswordConfigured, authMode, configured: authMode !== 'none',
  };
}

export function assertAdminHost(request: Request) {
  const configuration = adminConfiguration();
  if (!configuration.configured) return configuration;
  const host = new URL(request.url).hostname.toLowerCase();
  if (host !== configuration.hostname) throw new Error('This route is available only on the configured administration hostname.');
  return configuration;
}

function b64url(value: Buffer | Uint8Array | string) { return Buffer.from(value).toString('base64url'); }
function decodeB64url(value: string) { return Buffer.from(value, 'base64url'); }
function secret() {
  const value = environment('ADMIN_PORTAL_SESSION_SECRET');
  if (value.length < 32) throw new Error('The administrator session secret must be at least 32 characters.');
  return value;
}
function sign(payload: SignedPayload) {
  const encoded = b64url(JSON.stringify(payload));
  const signature = createHmac('sha256', secret()).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}
function readSigned<T extends SignedPayload>(value: string | undefined): T | null {
  if (!value) return null;
  const [encoded, received] = value.split('.');
  if (!encoded || !received) return null;
  const expected = createHmac('sha256', secret()).update(encoded).digest();
  let receivedBytes: Buffer;
  try { receivedBytes = decodeB64url(received); } catch { return null; }
  if (receivedBytes.length !== expected.length || !timingSafeEqual(receivedBytes, expected)) return null;
  try {
    const payload = JSON.parse(decodeB64url(encoded).toString('utf8')) as T;
    return typeof payload.exp === 'number' && payload.exp > Math.floor(Date.now() / 1000) ? payload : null;
  } catch { return null; }
}
function cookieOptions(maxAge: number) { return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge }; }
function sha256(value: string) { return createHash('sha256').update(value).digest('base64url'); }
function randomUrlToken() { return randomBytes(32).toString('base64url'); }
function tenantIssuer(tenantId: string) { return `https://login.microsoftonline.com/${tenantId}/v2.0`; }
function cookieValue(request: Request, name: string) { return request.headers.get('cookie')?.match(new RegExp(`(?:^|; )${name}=([^;]+)`))?.[1]; }
function equalText(a: string, b: string) {
  const aBytes = Buffer.from(a); const bBytes = Buffer.from(b);
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}
function requestIsHttps(request: Request) {
  const forwarded = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  return forwarded === 'https' || new URL(request.url).protocol === 'https:';
}
function verifyTemporaryPassword(password: string, encoded: string) {
  const [scheme, logN, r, p, saltValue, expectedValue] = encoded.split('$');
  if (scheme !== 'scrypt' || logN !== '16384' || r !== '8' || p !== '1' || !saltValue || !expectedValue) return false;
  try {
    const expected = Buffer.from(expectedValue, 'base64url');
    const derived = scryptSync(password, Buffer.from(saltValue, 'base64url'), expected.length, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch { return false; }
}
function passwordAttemptKey(request: Request) { return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'; }
function passwordRateLimited(key: string) {
  const current = passwordAttempts.get(key);
  if (!current) return false;
  if (current.until <= Date.now()) { passwordAttempts.delete(key); return false; }
  return current.count >= PASSWORD_ATTEMPT_LIMIT;
}
function registerFailedPasswordAttempt(key: string) {
  const current = passwordAttempts.get(key);
  const until = current && current.until > Date.now() ? current.until : Date.now() + PASSWORD_ATTEMPT_WINDOW_MS;
  passwordAttempts.set(key, { count: (current?.until && current.until > Date.now() ? current.count : 0) + 1, until });
}

function microsoftAuthorizeUrl(configuration: ReturnType<typeof adminConfiguration>, state: string, nonce: string, verifier: string) {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: configuration.clientId, response_type: 'code', redirect_uri: `${configuration.origin}/api/admin/auth/callback`, response_mode: 'query', scope: 'openid profile email', state, nonce, code_challenge: sha256(verifier), code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  return url.toString();
}
type IdTokenClaims = { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; nonce?: string; preferred_username?: string; email?: string; name?: string };
async function verifyMicrosoftIdToken(idToken: string, configuration: ReturnType<typeof adminConfiguration>, expectedNonce: string): Promise<IdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Microsoft did not return a valid ID token.');
  let header: { alg?: string; kid?: string }; let claims: IdTokenClaims;
  try { header = JSON.parse(decodeB64url(parts[0]).toString('utf8')); claims = JSON.parse(decodeB64url(parts[1]).toString('utf8')); } catch { throw new Error('Microsoft returned an unreadable ID token.'); }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Microsoft returned an unsupported ID token signature.');
  const jwksResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}/discovery/v2.0/keys`, { cache: 'force-cache' });
  if (!jwksResponse.ok) throw new Error('Microsoft signing keys could not be verified.');
  const jwks = await jwksResponse.json() as { keys?: Array<NodeJsonWebKey & { kid?: string }> };
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
  if (!key) throw new Error('Microsoft signing key was not recognised.');
  const valid = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), decodeB64url(parts[2]));
  if (!valid) throw new Error('Microsoft ID token signature validation failed.');
  const now = Math.floor(Date.now() / 1000); const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(configuration.clientId) || claims.iss !== tenantIssuer(configuration.tenantId) || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now + 60) || claims.nonce !== expectedNonce) throw new Error('Microsoft ID token claims validation failed.');
  return claims;
}

export function loginResponse(request: Request) {
  const configuration = assertAdminHost(request);
  if (!configuration.microsoftConfigured) return NextResponse.json({ error: 'Microsoft sign-in is not configured yet.' }, { status: 503 });
  const state = randomUrlToken(); const nonce = randomUrlToken(); const verifier = randomUrlToken();
  const response = NextResponse.redirect(microsoftAuthorizeUrl(configuration, state, nonce, verifier));
  response.cookies.set(OAUTH_COOKIE, sign({ state, nonce, verifier, exp: Math.floor(Date.now() / 1000) + 600 }), cookieOptions(600));
  return response;
}

export async function passwordLoginResponse(request: Request, username: string, password: string) {
  const configuration = assertAdminHost(request); const key = passwordAttemptKey(request);
  if (!configuration.temporaryPasswordConfigured) return NextResponse.json({ error: 'Temporary password sign-in is not configured.' }, { status: 503 });
  if (!requestIsHttps(request)) return NextResponse.json({ error: 'Password sign-in requires the secure HTTPS address.' }, { status: 400 });
  if (passwordRateLimited(key)) return NextResponse.json({ error: 'Too many unsuccessful attempts. Please wait 15 minutes and try again.' }, { status: 429 });
  const login = username.trim().toLowerCase();
  const account = configuration.tempAccounts.find((candidate) => equalText(login, candidate.username) || equalText(login, candidate.email));
  let authenticated = account && verifyTemporaryPassword(password, account.passwordHash)
    ? { email: account.email, name: account.name }
    : null;
  if (!authenticated) {
    try {
      const backend = await fetch(`${configuration.backendUrl}/api/v1/admin/auth/password`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CLSL-Admin-Gateway-Token': configuration.gatewayToken },
        body: JSON.stringify({ email: login, password }), cache: 'no-store', signal: AbortSignal.timeout(8_000),
      });
      const body = await backend.json().catch(() => ({})) as { email?: string; name?: string };
      if (backend.ok && body.email && body.name) authenticated = { email: body.email, name: body.name };
    } catch { /* A failed private lookup is handled as an invalid login. */ }
  }
  if (!authenticated) { registerFailedPasswordAttempt(key); return NextResponse.json({ error: 'The email or password is incorrect.' }, { status: 401 }); }
  passwordAttempts.delete(key);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, sign({ email: authenticated.email, name: authenticated.name, exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 }), cookieOptions(8 * 60 * 60));
  return response;
}

export async function callbackResponse(request: Request) {
  const configuration = assertAdminHost(request);
  if (!configuration.microsoftConfigured) return NextResponse.json({ error: 'Microsoft sign-in is not configured yet.' }, { status: 503 });
  const url = new URL(request.url); const providerError = url.searchParams.get('error'); const code = url.searchParams.get('code'); const state = url.searchParams.get('state');
  const oauth = readSigned<{ state: string; nonce: string; verifier: string; exp: number }>(cookieValue(request, OAUTH_COOKIE));
  const stateBytes = Buffer.from(state || ''); const expectedStateBytes = Buffer.from(oauth?.state || '');
  if (providerError || !code || !state || !oauth || stateBytes.length !== expectedStateBytes.length || !timingSafeEqual(stateBytes, expectedStateBytes)) return NextResponse.redirect(new URL('/admin/portal?sign_in=failed', configuration.origin));
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}/oauth2/v2.0/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: configuration.clientId, client_secret: configuration.clientSecret, grant_type: 'authorization_code', code, redirect_uri: `${configuration.origin}/api/admin/auth/callback`, code_verifier: oauth.verifier }) });
  const token = await tokenResponse.json() as { id_token?: string };
  if (!tokenResponse.ok || !token.id_token) return NextResponse.redirect(new URL('/admin/portal?sign_in=failed', configuration.origin));
  try {
    const claims = await verifyMicrosoftIdToken(token.id_token, configuration, oauth.nonce); const email = (claims.preferred_username || claims.email || '').trim().toLowerCase(); const allowedDomain = environment('ADMIN_ALLOWED_EMAIL_DOMAIN').toLowerCase() || 'croplifescience.com';
    if (!email || !email.endsWith(`@${allowedDomain}`)) throw new Error('Use your Crop Life Microsoft account.');
    const response = NextResponse.redirect(new URL('/admin/portal', configuration.origin));
    response.cookies.set(SESSION_COOKIE, sign({ email, name: (claims.name || email).slice(0, 180), exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 }), cookieOptions(8 * 60 * 60)); response.cookies.set(OAUTH_COOKIE, '', { ...cookieOptions(0), maxAge: 0 }); return response;
  } catch { return NextResponse.redirect(new URL('/admin/portal?sign_in=failed', configuration.origin)); }
}

export function sessionForRequest(request: Request): AdminSession | null {
  if (!adminConfiguration().configured) return null;
  const session = readSigned<AdminSession>(cookieValue(request, SESSION_COOKIE));
  return session && typeof session.email === 'string' && typeof session.name === 'string' ? session : null;
}
export function sessionResponse(request: Request) {
  const configuration = assertAdminHost(request); const session = sessionForRequest(request);
  return NextResponse.json({ configured: configuration.configured, authenticated: Boolean(session), auth_mode: configuration.authMode, session: session ? { email: session.email, name: session.name } : null }, { headers: { 'Cache-Control': 'no-store' } });
}
export function logoutResponse(request: Request) {
  const configuration = assertAdminHost(request); const destination = configuration.configured ? configuration.origin : new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/admin/portal', destination));
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(0), maxAge: 0 }); response.cookies.set(OAUTH_COOKIE, '', { ...cookieOptions(0), maxAge: 0 }); return response;
}
