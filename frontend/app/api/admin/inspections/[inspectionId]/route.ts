import { NextResponse } from 'next/server';
import { assertAdminHost, sessionForRequest } from '../../../../lib/admin-auth';
import { deleteInspectionImage } from '../../../../lib/s3-storage';

export const runtime = 'nodejs';

export async function DELETE(request: Request, context: { params: Promise<{ inspectionId: string }> }) {
  try {
    const configuration = assertAdminHost(request);
    if (!configuration.configured) return NextResponse.json({ error: 'The private administration portal is not configured.' }, { status: 503 });
    const session = sessionForRequest(request);
    if (!session) return NextResponse.json({ error: 'Sign in to the Crop Life administration portal.' }, { status: 401 });
    const { inspectionId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(inspectionId)) return NextResponse.json({ error: 'Inspection identifier is invalid.' }, { status: 400 });
    const headers = { 'X-CLSL-Admin-Email': session.email, 'X-CLSL-Admin-Gateway-Token': configuration.gatewayToken, Accept: 'application/json' };
    const metadata = await fetch(`${configuration.backendUrl}/api/v1/admin/inspections/${inspectionId}/deletion`, { headers, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    const payload = await metadata.json().catch(() => ({})) as { images?: Array<{ bucket: string; key: string }>; detail?: string };
    if (!metadata.ok) return NextResponse.json({ error: payload.detail || 'Inspection could not be deleted.' }, { status: metadata.status });
    await Promise.all((payload.images || []).map((image) => deleteInspectionImage(image)));
    const removed = await fetch(`${configuration.backendUrl}/api/v1/admin/inspections/${inspectionId}`, { method: 'DELETE', headers, cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    const body = await removed.json().catch(() => ({}));
    return NextResponse.json(body, { status: removed.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Inspection deletion failed. No database record was removed.' }, { status: 502 });
  }
}
