import { catalogRecommendations, type CatalogProduct } from './catalog';

type DiagnosisForCatalogue = Parameters<typeof catalogRecommendations>[0];
type ApiProduct = {
  id?: unknown; name?: unknown; category?: unknown; common_name?: unknown;
  formulation?: unknown; dose?: unknown; use_benefits?: unknown; packing?: unknown;
  application_method?: unknown; safety_information?: unknown; image_path?: unknown;
  source_page?: unknown; approved_crops?: unknown;
};

function validUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url : null;
  } catch { return null; }
}

function recommendationServiceUrl() {
  const base = (process.env.CATALOG_RECOMMENDATION_URL || '').trim();
  return base && validUrl(base) ? base : '';
}

function catalogueProductsUrl() {
  const configured = (process.env.CATALOGUE_PRODUCTS_URL || '').trim();
  if (configured && validUrl(configured)) return configured;

  // Derive the list route from the secured AWS catalogue endpoint already
  // configured for inspections. Browsers never receive DB credentials.
  const recommendation = validUrl(recommendationServiceUrl());
  if (recommendation) {
    recommendation.pathname = recommendation.pathname.replace(/\/api\/v1\/catalog\/recommendations$/, '/api/v1/catalog/products');
    recommendation.search = '';
    return recommendation.toString();
  }
  return '';
}

function serviceToken() {
  return (process.env.INTERNAL_SERVICE_TOKEN || process.env.INSPECTION_PERSISTENCE_TOKEN || '').trim();
}

function asText(value: unknown) { return typeof value === 'string' ? value : ''; }
function asCrops(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())) : [];
}

function toCatalogProduct(row: ApiProduct, revealPrivateImageReference = false): CatalogProduct | null {
  const id = asText(row.id); const name = asText(row.name); const category = asText(row.category);
  if (!id || !name || !category) return null;
  const imagePath = asText(row.image_path);
  return {
    id, name, category,
    commonName: asText(row.common_name), formulation: asText(row.formulation),
    dose: asText(row.dose), useBenefits: asText(row.use_benefits), packing: asText(row.packing),
    applicationMethod: asText(row.application_method), safetyInformation: asText(row.safety_information),
    image: imagePath.startsWith('s3:') && !revealPrivateImageReference ? `/api/catalogue/product-image/${encodeURIComponent(id)}` : imagePath,
    sourcePage: typeof row.source_page === 'number' ? row.source_page : 0,
    approvedCrops: asCrops(row.approved_crops), cropMappingSource: 'Approved live CLSL catalogue',
  };
}

/** Product information used by the farmer product screen and Gemini chatbot. */
export async function approvedCatalogueProducts(options: { revealPrivateImageReference?: boolean } = {}): Promise<{
  products: CatalogProduct[];
  source: 'approved_postgresql_catalogue' | 'catalogue_unavailable';
}> {
  const url = catalogueProductsUrl();
  if (!url) return { products: [], source: 'catalogue_unavailable' };
  try {
    const request = new URL(url);
    request.searchParams.set('limit', '100');
    const token = serviceToken();
    const response = await fetch(request, {
      headers: token ? { 'X-Inspection-Persistence-Token': token } : undefined,
      signal: AbortSignal.timeout(4_500), cache: 'no-store',
    });
    if (!response.ok) return { products: [], source: 'catalogue_unavailable' };
    const data = await response.json() as { items?: ApiProduct[] };
    const products = Array.isArray(data.items) ? data.items.map((item) => toCatalogProduct(item, Boolean(options.revealPrivateImageReference))).filter((item): item is CatalogProduct => Boolean(item)) : [];
    return { products, source: 'approved_postgresql_catalogue' };
  } catch { return { products: [], source: 'catalogue_unavailable' }; }
}

export async function approvedCatalogueRecommendations(diagnosis: DiagnosisForCatalogue): Promise<{
  recommendations: CatalogProduct[];
  source: 'approved_postgresql_catalogue' | 'static_fallback' | 'catalogue_unavailable';
}> {
  const url = recommendationServiceUrl();
  const token = serviceToken();

  // The public Vercel demonstration has no route into the private database.
  // Its fallback is retained only until it is pointed to the secured AWS API.
  if (!url || !token) return { recommendations: catalogRecommendations(diagnosis), source: 'static_fallback' };

  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Inspection-Persistence-Token': token },
      body: JSON.stringify(diagnosis), signal: AbortSignal.timeout(4_500), cache: 'no-store',
    });
    if (!response.ok) return { recommendations: [], source: 'catalogue_unavailable' };
    const data = await response.json() as { items?: CatalogProduct[] };
    return { recommendations: Array.isArray(data.items) ? data.items.map((item) => ({ ...item, image: item.image?.startsWith('s3:') ? `/api/catalogue/product-image/${encodeURIComponent(item.id)}` : item.image })) : [], source: 'approved_postgresql_catalogue' };
  } catch {
    // Never silently use stale data once a production database is configured.
    return { recommendations: [], source: 'catalogue_unavailable' };
  }
}
