import { NextResponse } from 'next/server';
import { assertAdminHost } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';

// Public endpoint — exchanges a valid reset token for a new password
export async function POST(request: Request) {
  try {
    const configuration = assertAdminHost(request);
    if (!configuration.configured) return NextResponse.json({ error: 'Portal not configured.' }, { status: 503 });
    const body = await request.text();
    const backend = await fetch(`${configuration.backendUrl}/api/v1/admin/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CLSL-Admin-Gateway-Token': configuration.gatewayToken },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    const responseBody = await backend.text();
    return new Response(responseBody, {
      status: backend.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Request failed.' }, { status: 502 });
  }
}
