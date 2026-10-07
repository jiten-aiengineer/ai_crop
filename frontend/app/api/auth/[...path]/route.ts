import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.PUBLIC_AUTH_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  if (!['check-phone', 'send-otp', 'verify-otp', 'profile', 'me', 'me/coupons', 'me/rewards', 'me/rewards/log', 'me/inspections', 'logout', 'dealer-mobile-status', 'dealer-lookup', 'dealer-referral', 'referral-lookup'].includes(endpoint) && !endpoint.startsWith('me/rewards/redeem/')) {
    return NextResponse.json({ detail: 'Unknown authentication action.' }, { status: 404 });
  }
  try {
    const body = await request.text();
    const response = await fetch(`${BACKEND_URL}/api/v1/public/auth/${endpoint}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: request.headers.get('authorization') || '',
        'user-agent': request.headers.get('user-agent') || '',
        'x-forwarded-for': request.headers.get('x-forwarded-for') || '127.0.0.1',
      },
      body: body || '{}',
      cache: 'no-store',
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ detail: 'The sign-in service is temporarily unavailable.' }, { status: 502 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join('/');
  const ALLOWED_GET = ['me', 'me/coupons', 'me/rewards', 'me/inspections'];
  if (!ALLOWED_GET.includes(endpoint)) {
    return NextResponse.json({ detail: 'Unknown action.' }, { status: 404 });
  }
  try {
    const response = await fetch(`${BACKEND_URL}/api/v1/public/auth/${endpoint}`, {
      method: 'GET',
      headers: {
        authorization: request.headers.get('authorization') || '',
        'user-agent': request.headers.get('user-agent') || '',
      },
      cache: 'no-store',
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ detail: 'Service unavailable.' }, { status: 502 });
  }
}
