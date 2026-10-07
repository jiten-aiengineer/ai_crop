import { NextResponse } from 'next/server';
import { assertAdminHost, sessionForRequest } from '../../../../../lib/admin-auth';

export const runtime = 'nodejs';

// Proxies multipart/form-data CSV uploads to the backend employee import endpoint
export async function POST(request: Request) {
  try {
    const configuration = assertAdminHost(request);
    if (!configuration.configured) return NextResponse.json({ error: 'Portal not configured.' }, { status: 503 });
    const session = sessionForRequest(request);
    if (!session) return NextResponse.json({ error: 'Sign in to the administration portal.' }, { status: 401 });

    // Forward the raw multipart body as-is, including the Content-Type boundary
    const contentType = request.headers.get('content-type') || 'multipart/form-data';
    const body = await request.arrayBuffer();
    const backend = await fetch(`${configuration.backendUrl}/api/v1/admin/employees/import-csv`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'X-CLSL-Admin-Email': session.email,
        'X-CLSL-Admin-Gateway-Token': configuration.gatewayToken,
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(60_000),
    });
    const responseBody = await backend.text();
    return new Response(responseBody, {
      status: backend.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import request failed.' }, { status: 502 });
  }
}
