import { NextResponse } from 'next/server';

const BACKEND_URL = process.env.PUBLIC_AUTH_BACKEND_URL || process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export const runtime = 'nodejs';

async function proxy(request: Request, path: string[]) {
  const endpoint = path.join('/');
  const url = new URL(request.url);
  const backendUrl = `${BACKEND_URL}/api/v1/dealers/${endpoint}${url.search}`;
  try {
    const body = request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined;
    const response = await fetch(backendUrl, {
      method: request.method,
      headers: {
        'content-type': 'application/json',
        authorization: request.headers.get('authorization') || '',
        'user-agent': request.headers.get('user-agent') || '',
        'x-forwarded-for': request.headers.get('x-forwarded-for') || '127.0.0.1',
      },
      body: body || undefined,
      cache: 'no-store',
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ detail: 'The dealer service is temporarily unavailable.' }, { status: 502 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  return proxy(request, path);
}
