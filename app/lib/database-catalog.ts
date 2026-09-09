import { catalogRecommendations, type CatalogProduct } from './catalog';

type DiagnosisForCatalogue = Parameters<typeof catalogRecommendations>[0];

function serviceUrl() {
  const base = (process.env.CATALOG_RECOMMENDATION_URL || '').trim();
  if (!base) return '';
  try {
    const url = new URL(base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function serviceToken() {
  return (process.env.INTERNAL_SERVICE_TOKEN || process.env.INSPECTION_PERSISTENCE_TOKEN || '').trim();
}

export async function approvedCatalogueRecommendations(diagnosis: DiagnosisForCatalogue): Promise<{
  recommendations: CatalogProduct[];
  source: 'approved_postgresql_catalogue' | 'static_fallback' | 'catalogue_unavailable';
}> {
  const url = serviceUrl();
  const token = serviceToken();

  // The public Vercel demonstration has no route into the private database.
  // Its fallback is retained only until it is pointed to the secured AWS API.
  if (!url || !token) {
    return { recommendations: catalogRecommendations(diagnosis), source: 'static_fallback' };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inspection-Persistence-Token': token },
      body: JSON.stringify(diagnosis),
      signal: AbortSignal.timeout(4_500),
      cache: 'no-store',
    });
    if (!response.ok) return { recommendations: [], source: 'catalogue_unavailable' };
    const data = await response.json() as { items?: CatalogProduct[] };
    return { recommendations: Array.isArray(data.items) ? data.items : [], source: 'approved_postgresql_catalogue' };
  } catch {
    // Do not silently use stale records once the production service has been
    // configured. No product advice is safer than advice outside the governed
    // catalogue source of truth.
    return { recommendations: [], source: 'catalogue_unavailable' };
  }
}
