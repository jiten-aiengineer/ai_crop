import { createHash, createHmac, createPublicKey, randomBytes, timingSafeEqual, verify as verifySignature, type JsonWebKey as NodeJsonWebKey } from 'node:crypto';
import { NextResponse } from 'next/server';

const SESSION_COOKIE = 'clsl_admin_session';
const OAUTH_COOKIE = 'clsl_admin_oauth';
const encoder = new TextEncoder();

type SignedPayload = Record<string, unknown> & { exp: number };
export type AdminSession = { email: string; name: string; exp: number };

function environment(name: string) { return (process.env[name] || '').trim(); }

export function adminConfiguration() {
  const hostname = environment('ADMIN_PORTAL_HOSTNAME').toLowerCase();
  const origin = environment('ADMIN_PORTAL_ORIGIN').replace(/\/$/, '');
  const tenantId = environment('ENTRA_TENANT_ID');
  const clientId = environment('ENTRA_CLIENT_ID');
  const clientSecret = environment('ENTRA_CLIENT_SECRET');
  const sessionSecret = environment('ADMIN_PORTAL_SESSION_SECRET');
  const backendUrl = environment('ADMIN_BACKEND_URL').replace(/\/$/, '');
  const gatewayToken = environment('ADMIN_GATEWAY_TOKEN');
  return {
    hostname, origin, tenantId, clientId, clientSecret, sessionSecret, backendUrl, gatewayToken,
    configured: Boolean(hostname && origin && tenantId && clientId && clientSecret && sessionSecret.length >= 32 && backendUrl && gatewayToken),
  };
}

export function assertAdminHost(request: Request) {
  const configuration = adminConfiguration();
  if (!configuration.configured) return configuration;
  const host = new URL(request.url).hostname.toLowerCase();
  if (host !== configuration.hostname) throw new Error('This route is available only on the configured administration hostname.');
  return configuration;
}

function b64url(value: Buffer | Uint8Array | string) {
  return Buffer.from(value).toString('base64url');
}

function decodeB64url(value: string) {
  return Buffer.from(value, 'base64url');
}

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

function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge };
}

function sha256(value: string) { return createHash('sha256').update(value).digest('base64url'); }

function randomUrlToken() { return randomBytes(32).toString('base64url'); }

function tenantIssuer(tenantId: string) { return `https://login.microsoftonline.com/${tenantId}/v2.0`; }

function microsoftAuthorizeUrl(configuration: ReturnType<typeof adminConfiguration>, state: string, nonce: string, verifier: string) {
  const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({
    client_id: configuration.clientId,
    response_type: 'code',
    redirect_uri: `${configuration.origin}/api/admin/auth/callback`,
    response_mode: 'query',
    scope: 'openid profile email',
    state,
    nonce,
    code_challenge: sha256(verifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString();
  return url.toString();
}

type IdTokenClaims = { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; nonce?: string; preferred_username?: string; email?: string; name?: string };

async function verifyMicrosoftIdToken(idToken: string, configuration: ReturnType<typeof adminConfiguration>, expectedNonce: string): Promise<IdTokenClaims> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Microsoft did not return a valid ID token.');
  let header: { alg?: string; kid?: string };
  let claims: IdTokenClaims;
  try {
    header = JSON.parse(decodeB64url(parts[0]).toString('utf8'));
    claims = JSON.parse(decodeB64url(parts[1]).toString('utf8'));
  } catch { throw new Error('Microsoft returned an unreadable ID token.'); }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Microsoft returned an unsupported ID token signature.');
  const jwksResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}/discovery/v2.0/keys`, { cache: 'force-cache' });
  if (!jwksResponse.ok) throw new Error('Microsoft signing keys could not be verified.');
  const jwks = await jwksResponse.json() as { keys?: Array<NodeJsonWebKey & { kid?: string }> };
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA');
  if (!key) throw new Error('Microsoft signing key was not recognised.');
  const valid = verifySignature('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), decodeB64url(parts[2]));
  if (!valid) throw new Error('Microsoft ID token signature validation failed.');
  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(configuration.clientId) || claims.iss !== tenantIssuer(configuration.tenantId) || !claims.exp || claims.exp <= now || (claims.nbf && claims.nbf > now + 60) || claims.nonce !== expectedNonce) {
    throw new Error('Microsoft ID token claims validation failed.');
  }
  return claims;
}

export function loginResponse(request: Request) {
  const configuration = assertAdminHost(request);
  if (!configuration.configured) return NextResponse.json({ error: 'The private administration portal is not configured.' }, { status: 503 });
  const state = randomUrlToken();
  const nonce = randomUrlToken();
  const verifier = randomUrlToken();
  const response = NextResponse.redirect(microsoftAuthorizeUrl(configuration, state, nonce, verifier));
  response.cookies.set(OAUTH_COOKIE, sign({ state, nonce, verifier, exp: Math.floor(Date.now() / 1000) + 600 }), cookieOptions(600));
  return response;
}

export async function callbackResponse(request: Request) {
  const configuration = assertAdminHost(request);
  if (!configuration.configured) return NextResponse.json({ error: 'The private administration portal is not configured.' }, { status: 503 });
  const url = new URL(request.url);
  const providerError = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauth = readSigned<{ state: string; nonce: string; verifier: string; exp: number }>(request.headers.get('cookie')?.match(new RegExp(`(?:^|; )${OAUTH_COOKIE}=([^;]+)`))?.[1]);
  const stateBytes = Buffer.from(state || '');
  const expectedStateBytes = Buffer.from(oauth?.state || '');
  if (providerError || !code || !state || !oauth || stateBytes.length !== expectedStateBytes.length || !timingSafeEqual(stateBytes, expectedStateBytes)) {
    return NextResponse.redirect(new URL('/admin/portal?sign_in=failed', configuration.origin));
  }
  const tokenResponse = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(configuration.tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      grant_type: 'authorization_code', code,
      redirect_uri: `${configuration.origin}/api/admin/auth/callback`,
      code_verifier: oauth.verifier,
    }),
  });
  const token = await tokenResponse.json() as { id_token?: string };
  if (!tokenResponse.ok || !token.id_token) return NextResponse.redirect(new URL('/admin/portal?sign_in=failed', configuration.origin));
  try {
    const claims = await verifyMicrosoftIdToken(token.id_token, configuration, oauth.nonce);
    const email = (claims.preferred_username || claims.email || '').trim().toLowerCase();
    const allowedDomain = environment('ADMIN_ALLOWED_EMAIL_DOMAIN').toLowerCase() || 'croplifescience.com';
    if (!email || !email.endsWith(`@${allowedDomain}`)) throw new Error('Use your Crop Life Microsoft account.');
    const response = NextResponse.redirect(new URL('/admin/portal', configuration.origin));
    response.cookies.set(SESSION_COOKIE, sign({ email, name: (claims.name || email).slice(0, 180), exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 }), cookieOptions(8 * 60 * 60));
    response.cookies.set(OAUTH_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
    return response;
  } catch {
    return NextResponse.redirect(new URL('/admin/portal?sign_in=failed', configuration.origin));
  }
}

export function sessionForRequest(request: Request): AdminSession | null {
  if (!adminConfiguration().configured) return null;
  const value = request.headers.get('cookie')?.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`))?.[1];
  const session = readSigned<AdminSession>(value);
  return session && typeof session.email === 'string' && typeof session.name === 'string' ? session : null;
}

export function sessionResponse(request: Request) {
  const configuration = assertAdminHost(request);
  const session = sessionForRequest(request);
  return NextResponse.json({ configured: configuration.configured, authenticated: Boolean(session), session: session ? { email: session.email, name: session.name } : null }, { headers: { 'Cache-Control': 'no-store' } });
}

export function logoutResponse(request: Request) {
  const configuration = assertAdminHost(request);
  const destination = configuration.configured ? configuration.origin : new URL(request.url).origin;
  const response = NextResponse.redirect(new URL('/admin/portal', destination));
  response.cookies.set(SESSION_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
  response.cookies.set(OAUTH_COOKIE, '', { ...cookieOptions(0), maxAge: 0 });
  return response;
}
