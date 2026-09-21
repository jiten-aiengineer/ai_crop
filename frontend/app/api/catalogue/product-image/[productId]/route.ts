import { NextResponse } from 'next/server';
import { approvedCatalogueProducts } from '../../../../lib/database-catalog';
import { readPrivateProductImage } from '../../../../lib/s3-storage';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ productId: string }> }) {
  try {
    const { productId } = await context.params;
    const catalogue = await approvedCatalogueProducts({ revealPrivateImageReference: true });
    const product = catalogue.products.find((item) => item.id === productId);
    if (!product || !product.image.startsWith('s3:')) return NextResponse.json({ error: 'Product image not found.' }, { status: 404 });
    const image = await readPrivateProductImage(product.image);
    return new NextResponse(Buffer.from(image.bytes), { headers: { 'Content-Type': image.mimeType, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } });
  } catch {
    return NextResponse.json({ error: 'Product image is temporarily unavailable.' }, { status: 502 });
  }
}
