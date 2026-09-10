import { NextResponse } from 'next/server';
import { approvedCatalogueProducts } from '../../../lib/database-catalog';

export const runtime = 'nodejs';

/**
 * Farmer-safe read model. It exposes only active + fully approved catalogue
 * records; the authenticated portal remains the only place to edit data.
 */
export async function GET() {
  const result = await approvedCatalogueProducts();
  if (result.source !== 'approved_postgresql_catalogue') {
    return NextResponse.json({ error: 'The approved product catalogue is temporarily unavailable.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
  const crops = Array.from(new Set(result.products.flatMap((product) => product.approvedCrops || []))).sort((a, b) => a.localeCompare(b));
  const categories = Array.from(new Set(result.products.map((product) => product.category))).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ items: result.products, crops, categories, source: result.source }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
