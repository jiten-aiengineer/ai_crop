import type { CatalogProduct } from './catalog';
import type { InspectionInput, ProviderResult } from './inspection-ai';
import type { InspectionImageStorageResult } from './s3-storage';

export type InspectionPersistenceStatus = 'saved' | 'skipped' | 'failed';

type PersistInspectionInput = {
  employeeCode?: string;
  collectionMode: 'general_employee' | 'sales_officer';
  inspectionId: string;
  input: InspectionInput;
  imageCount: number;
  storage: InspectionImageStorageResult;
  provider: ProviderResult;
  recommendations: CatalogProduct[];
};

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
    provider: {
      provider: input.provider.provider,
      model: input.provider.model,
      success: input.provider.success,
      latency_ms: input.provider.latencyMs,
      raw_json: input.provider.rawResponse || {},
      error_message: input.provider.error || '',
      diagnosis: input.provider.diagnosis || null,
      input_tokens: input.provider.inputTokens ?? null,
      output_tokens: input.provider.outputTokens ?? null,
    },
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
