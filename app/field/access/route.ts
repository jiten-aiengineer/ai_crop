import { NextResponse } from 'next/server';
import { FIELD_COOKIE, resolveFieldToken } from '../../lib/field-access';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  try {
    await resolveFieldToken(token);
    const origin = process.env.ADMIN_PORTAL_ORIGIN || new URL(request.url).origin;
    const response = NextResponse.redirect(new URL('/', origin));
    response.cookies.set(FIELD_COOKIE, token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid field access link.' }, { status: 401, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
  }
}
