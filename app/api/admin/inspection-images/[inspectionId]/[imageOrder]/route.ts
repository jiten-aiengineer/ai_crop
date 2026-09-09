import { NextResponse } from 'next/server';
import { assertAdminHost, sessionForRequest } from '../../../../../lib/admin-auth';
import { readPrivateInspectionImage, type InspectionImageMimeType } from '../../../../../lib/s3-storage';

export const runtime = 'nodejs';

type ImageMetadata = { bucket?: unknown; key?: unknown; mime_type?: unknown; image_order?: unknown };

export async function GET(request: Request, context: { params: Promise<{ inspectionId: string; imageOrder: string }> }) {
  try {
    const configuration = assertAdminHost(request);
    const session = sessionForRequest(request);
    if (!configuration.configured || !session) return NextResponse.json({ error: 'Sign in to the Crop Life administration portal.' }, { status: 401 });
    const { inspectionId, imageOrder } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inspectionId) || !/^[1-5]$/.test(imageOrder)) {
      return NextResponse.json({ error: 'Invalid inspection image request.' }, { status: 400 });
    }
    const metadataResponse = await fetch(`${configuration.backendUrl}/api/v1/admin/inspections/${inspectionId}/images/${imageOrder}`, {
      headers: { 'Accept': 'application/json', 'X-CLSL-Admin-Email': session.email, 'X-CLSL-Admin-Gateway-Token': configuration.gatewayToken },
      cache: 'no-store', signal: AbortSignal.timeout(12_000),
    });
    if (!metadataResponse.ok) return NextResponse.json({ error: metadataResponse.status === 404 ? 'The retained image was not found.' : 'The private image could not be authorised.' }, { status: metadataResponse.status });
    const metadata = await metadataResponse.json() as ImageMetadata;
    if (typeof metadata.bucket !== 'string' || typeof metadata.key !== 'string' || typeof metadata.mime_type !== 'string') return NextResponse.json({ error: 'The stored image metadata is invalid.' }, { status: 502 });
    const image = await readPrivateInspectionImage({ bucket: metadata.bucket, key: metadata.key, mimeType: metadata.mime_type as InspectionImageMimeType });
    const body = new Uint8Array(image.bytes.byteLength);
    body.set(image.bytes);
    return new NextResponse(body.buffer, { headers: {
      'Content-Type': image.mimeType,
      'Content-Disposition': `inline; filename="inspection-${inspectionId.slice(0, 8)}-${imageOrder}.${image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg'}"`,
      'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:",
    } });
  } catch {
    return NextResponse.json({ error: 'The private inspection image could not be loaded.' }, { status: 502 });
  }
}
