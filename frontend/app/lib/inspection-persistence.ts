import type { CatalogProduct } from './catalog';
import type { InspectionInput, ProviderResult } from './inspection-ai';
import type { InspectionImageStorageResult } from './s3-storage';

export type InspectionPersistenceStatus = 'saved' | 'skipped' | 'failed';

type PersistInspectionInput = {
  employeeCode?: string;
  publicSessionToken?: string;
  collectionMode: 'general_employee' | 'sales_officer';
  inspectionId: string;
  input: InspectionInput;
  imageCount: number;
  storage: InspectionImageStorageResult;
  provider: ProviderResult;
  additionalProviders?: ProviderResult[];
  recommendations: CatalogProduct[];
};

function providerPayload(provider: ProviderResult) {
  return {
    provider: provider.provider,
    model: provider.model,
    success: provider.success,
    latency_ms: provider.latencyMs,
    raw_json: provider.rawResponse || {},
    error_message: provider.error || '',
    diagnosis: provider.diagnosis || null,
    input_tokens: provider.inputTokens ?? null,
    output_tokens: provider.outputTokens ?? null,
  };
}

function persistenceUrl() {
  const base = (process.env.INSPECTION_PERSISTENCE_URL || '').trim();
  if (!base) return '';
  try {
    const url = new URL(base);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function persistenceToken() {
  return (process.env.INSPECTION_PERSISTENCE_TOKEN || '').trim();
}

export function inspectionPersistenceIsConfigured() {
  return Boolean(persistenceUrl() && persistenceToken());
}

/**
 * Sends only server-side metadata to FastAPI. This endpoint is intentionally
 * disabled unless both its private URL and shared internal token are configured.
 */
export async function persistInspection(input: PersistInspectionInput): Promise<{ status: InspectionPersistenceStatus; shadowStatus?: string }> {
  const url = persistenceUrl();
  const token = persistenceToken();
  if (!url || !token) return { status: 'skipped' };

  const body = {
    inspection_id: input.inspectionId,
    public_session_token: input.publicSessionToken || '',
    photo_count: input.imageCount,
    context: { ...input.input.context, employee_code: input.employeeCode || '', collection_mode: input.collectionMode },
    storage: {
      status: input.storage.status,
      images: input.storage.images.map((image) => ({
        bucket: image.bucket,
        key: image.key,
        mime_type: image.mimeType,
        file_size_bytes: image.fileSizeBytes,
        image_order: image.imageOrder,
      })),
      failures: input.storage.failures.map((failure) => ({ image_order: failure.imageOrder, code: failure.code })),
    },
    provider: providerPayload(input.provider),
    additional_providers: (input.additionalProviders || []).slice(0, 2).map(providerPayload),
    recommendations: input.recommendations.map((product, index) => ({
      product_id: product.id,
      rank: index + 1,
      match_score: product.matchScore ?? null,
      match_reason: product.matchReason || 'CLSL catalogue match',
      match_tier: product.matchTier || 'supporting',
    })),
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Inspection-Persistence-Token': token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return { status: 'failed' };
    const payload = await response.json().catch(() => ({})) as { shadow_status?: unknown };
    return {
      status: 'saved',
      shadowStatus: typeof payload.shadow_status === 'string' ? payload.shadow_status : undefined,
    };
  } catch {
    return { status: 'failed' };
  }
}
