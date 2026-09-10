import { NextResponse } from 'next/server';
import { assertAdminHost, sessionForRequest } from '../../../lib/admin-auth';
import { readPrivateProductImage, storeProductImage } from '../../../lib/s3-storage';

export const runtime = 'nodejs';

async function authorised(request: Request, capability: string) {
  const configuration = assertAdminHost(request);
  if (!configuration.configured) throw new Error('The private administration portal is not configured.');
  const session = sessionForRequest(request);
  if (!session) return { configuration, session: null, denied: NextResponse.json({ error: 'Sign in to the Crop Life administration portal.' }, { status: 401 }) };
  const response = await fetch(`${configuration.backendUrl}/api/v1/admin/me`, {
    headers: { 'X-CLSL-Admin-Email': session.email, 'X-CLSL-Admin-Gateway-Token': configuration.gatewayToken, Accept: 'application/json' },
    cache: 'no-store', signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => ({})) as { capabilities?: Record<string, boolean>; detail?: string };
  if (!response.ok || !body.capabilities?.[capability]) return { configuration, session, denied: NextResponse.json({ error: body.detail || 'Your assigned role does not permit this action.' }, { status: response.status === 401 ? 401 : 403 }) };
  return { configuration, session, denied: null };
}

export async function POST(request: Request) {
  try {
    const access = await authorised(request, 'submit_catalogue_changes');
    if (access.denied) return access.denied;
    const form = await request.formData();
    const productId = typeof form.get('product_id') === 'string' ? String(form.get('product_id')).trim() : '';
    const image = form.get('image');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,98}$/.test(productId) || !(image instanceof File)) return NextResponse.json({ error: 'Choose a valid product ID and package image.' }, { status: 422 });
    const stored = await storeProductImage(productId, { bytes: new Uint8Array(await image.arrayBuffer()), mimeType: image.type });
    return NextResponse.json({ image_path: stored.imagePath, bytes: stored.fileSizeBytes }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not upload the product image.' }, { status: 502 });
  }
}

export async function GET(request: Request) {
  try {
    const access = await authorised(request, 'view_catalogue');
    if (access.denied) return access.denied;
    const key = new URL(request.url).searchParams.get('key') || '';
    const image = await readPrivateProductImage(key);
    return new NextResponse(Buffer.from(image.bytes), { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Product image is unavailable.' }, { status: 502 });
  }
}
