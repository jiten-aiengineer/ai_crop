import { NextResponse } from 'next/server';
import { FIELD_COOKIE, fieldIdentityFor } from '../../../lib/field-access';
export const runtime = 'nodejs';
export async function GET(request: Request) {
  try { return NextResponse.json({ employee: await fieldIdentityFor(request) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return NextResponse.json({ employee: null, error: 'Field access was revoked or is unavailable. Request a new access link.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== process.env.ADMIN_PORTAL_ORIGIN && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  const response = NextResponse.json({ employee: null });
  response.cookies.set(FIELD_COOKIE, '', { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 0 });
  return response;
}
