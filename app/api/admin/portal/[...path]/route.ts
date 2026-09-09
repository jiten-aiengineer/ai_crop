import { NextResponse } from 'next/server';
import { assertAdminHost, sessionForRequest } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';

async function proxy(request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const configuration = assertAdminHost(request);
    if (!configuration.configured) return NextResponse.json({ error: 'The private administration portal is not configured.' }, { status: 503 });
    const session = sessionForRequest(request);
    if (!session) return NextResponse.json({ error: 'Sign in to the Crop Life administration portal.' }, { status: 401 });
    const { path } = await context.params;
    if (!path.length || path.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) return NextResponse.json({ error: 'Invalid administration route.' }, { status: 400 });
    const incoming = new URL(request.url);
    const destination = new URL(`${configuration.backendUrl}/api/v1/admin/${path.join('/')}`);
    destination.search = incoming.search;
    const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) ? await request.text() : undefined;
    const backend = await fetch(destination, {
      method: request.method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': request.headers.get('content-type') || 'application/json',
        'X-CLSL-Admin-Email': session.email,
        'X-CLSL-Admin-Gateway-Token': configuration.gatewayToken,
      },
      body: body || undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    return new NextResponse(backend.body, { status: backend.status, headers: { 'Content-Type': backend.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Administration request failed.';
    const status = message.includes('hostname') ? 404 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export function GET(request: Request, context: { params: Promise<{ path: string[] }> }) { return proxy(request, context); }
export function POST(request: Request, context: { params: Promise<{ path: string[] }> }) { return proxy(request, context); }
