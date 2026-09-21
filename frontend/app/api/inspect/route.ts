import { NextResponse } from 'next/server';
import { catalogCropName } from '../../lib/catalog';
import { approvedCatalogueRecommendations } from '../../lib/database-catalog';
import { canMatchProducts, geminiFlashInspection, geminiFlashLiteInspection, legacyDiagnosis, InspectionInput } from '../../lib/inspection-ai';
import { persistInspection } from '../../lib/inspection-persistence';
import { fieldIdentityFor } from '../../lib/field-access';

// S3 uses the AWS SDK default credential chain, including the EC2 instance role.
// It must run only on the server, never in the browser or an edge isolate.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const publicSessionToken = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  let employeeCode: string | undefined;
  let collectionMode: 'general_employee' | 'sales_officer' = 'general_employee';
  try {
    const identity = await fieldIdentityFor(request);
    employeeCode = identity?.employee_code;
    if (identity?.collection_mode === 'sales_officer') collectionMode = 'sales_officer';
  }
  catch { /* Public farmer flow — no field identity required. */ }
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({error:'Send crop photos as form data.'},{status:400}); }
  const images = form.getAll('images').filter((value): value is File => value instanceof File);
  if (!images.length || images.length > 5) return NextResponse.json({error:'Please add between one and five crop photos.'},{status:400});
  if (collectionMode === 'sales_officer' && images.length < 4) return NextResponse.json({error:'Sales Officer collection mode requires four photos: whole plant, affected part, symptom close-up and another angle.'},{status:400});
  if (images.some((image) => !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(image.type) || !image.size) || images.reduce((sum,image) => sum+image.size,0)>4*1024*1024) return NextResponse.json({error:'Use JPG, PNG, WebP or HEIC photos totalling at most 4 MB.'},{status:400});
  const field = (key: string, max: number) => String(form.get(key)||'').slice(0,max);
  const declaredCrop = field('crop', 80).trim();
  if (!declaredCrop) {
    return NextResponse.json({ error: 'Select the crop before submitting photos. Choose Other if it is not in the list.' }, { status: 400 });
  }
  const latitudeText = field('latitude', 24).trim();
  const longitudeText = field('longitude', 24).trim();
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!latitudeText || !longitudeText || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return NextResponse.json({ error: 'Allow field location before analysing the crop.' }, { status: 400 });
  }
  const preparedImages = await Promise.all(images.map(async (image, index) => {
    const originalBytes = new Uint8Array(await image.arrayBuffer());
    // The client has already resized and JPEG-compressed large images before
    // upload. Reusing that exact payload keeps Gemini and the private archive
    // aligned and avoids a slow, platform-specific second image conversion.
    let binary='';
    for(let i=0; i<originalBytes.length; i+=0x8000) binary += String.fromCharCode(...originalBytes.subarray(i, i+0x8000));
    return { 
      bytes: originalBytes, 
      originalMimeType: image.type, 
      optimizedMimeType: image.type,
      imageOrder: index + 1, 
      data: btoa(binary) 
    };
  }));
  const input: InspectionInput = {
    context:{crop:declaredCrop,plant:field('plant',80),description:field('description',800),location:`${latitude.toFixed(6)},${longitude.toFixed(6)}`,notes:field('notes',800),language:field('language',20)||'en'},
    images:preparedImages.map((image) => ({ mimeType: image.optimizedMimeType, data: image.data })),
  };
  const inspectionId = crypto.randomUUID();
  // Archiving and diagnosis begin together. The response still waits for both
  // so a storage failure is explicit rather than silently discarded.
  const aiPromise = collectionMode === 'sales_officer' 
    ? geminiFlashLiteInspection(input) 
    : geminiFlashInspection(input);

  const [live, storage] = await Promise.all([
    aiPromise,
    import('../../lib/s3-storage')
      .then(({ storeInspectionImages }) => storeInspectionImages(inspectionId, preparedImages.map(({ bytes, originalMimeType, imageOrder }) => ({ bytes, mimeType: originalMimeType, imageOrder }))))
      .catch(() => ({ status: 'failed' as const, images: [], failures: preparedImages.map((image) => ({ imageOrder: image.imageOrder, code: 'upload_failed' as const })) })),
  ]);
  // “Other” deliberately lets the vision model recognise the crop. It is not
  // treated as a literal crop name for a product match.
  const selectedOther = /^other$/i.test(declaredCrop);
  const knownCrop = selectedOther ? '' : declaredCrop;
  const diagnosis = live.success && live.diagnosis ? legacyDiagnosis(live.diagnosis, knownCrop) : undefined;
  // Keep known aliases normalised, but retain an approved live crop name even
  // when it was added after the application build. PostgreSQL remains the
  // source of truth for the final crop/product eligibility decision.
  const requestedCrop = knownCrop || diagnosis?.crop || '';
  const grounded = diagnosis ? {
    ...diagnosis,
    catalog_crop: catalogCropName(requestedCrop) || requestedCrop.trim().slice(0, 160),
  } : undefined;
  const catalogue = grounded && live.diagnosis && canMatchProducts(live.diagnosis, requestedCrop)
    ? await approvedCatalogueRecommendations(grounded)
    : { recommendations: [], source: grounded ? 'insufficient_diagnostic_evidence' as const : 'catalogue_unavailable' as const };
  const recommendations = catalogue.recommendations;
  const persistence = await persistInspection({ inspectionId, input, employeeCode, publicSessionToken, collectionMode, imageCount: images.length, storage, provider: live, additionalProviders: [], recommendations });
  const storageMetadata = {
    inspection_id: inspectionId,
    comparison_status: persistence.shadowStatus || 'not_queued',
    live_provider: live.provider,
    live_model_role: collectionMode === 'sales_officer' ? 'flash_lite_sales' : 'flash_paid_public',
    evaluation_note: 'Primary Gemini assessment complete. Qwen shadows via background worker if enabled.',
    storage_status: storage.status,
    stored_image_count: storage.images.length,
    image_storage_failures: storage.failures.map((failure) => failure.imageOrder),
    persistence_status: persistence.status,
  };
  if (!live.success || !grounded) return NextResponse.json({error:'AI could not make a reliable assessment from these photos. Please add a clear close-up of the affected area and one full-plant photo.',...storageMetadata},{status:502});
  return NextResponse.json({...grounded,...storageMetadata,recommendations,catalogue_source:catalogue.source});
}
