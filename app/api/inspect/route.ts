import { NextResponse } from 'next/server';
import { catalogCropName } from '../../lib/catalog';
import { approvedCatalogueRecommendations } from '../../lib/database-catalog';
import { geminiInspection, legacyDiagnosis, queueShadow, InspectionInput } from '../../lib/inspection-ai';
import { persistInspection } from '../../lib/inspection-persistence';
import { storeInspectionImages } from '../../lib/s3-storage';
import { fieldIdentityFor } from '../../lib/field-access';

// S3 uses the AWS SDK default credential chain, including the EC2 instance role.
// It must run only on the server, never in the browser or an edge isolate.
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  let employeeCode: string | undefined;
  try { employeeCode = (await fieldIdentityFor(request))?.employee_code; }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Field access could not be verified.' }, { status: 401 }); }
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({error:'Send crop photos as form data.'},{status:400}); }
  const images = form.getAll('images').filter((value): value is File => value instanceof File);
  if (!images.length || images.length > 5) return NextResponse.json({error:'Please add between one and five crop photos.'},{status:400});
  if (images.some((image) => !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(image.type) || !image.size) || images.reduce((sum,image) => sum+image.size,0)>4*1024*1024) return NextResponse.json({error:'Use JPG, PNG, WebP or HEIC photos totalling at most 4 MB.'},{status:400});
  const field = (key: string, max: number) => String(form.get(key)||'').slice(0,max);
  const preparedImages = await Promise.all(images.map(async (image, index) => {
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary='';
    for(let index=0;index<bytes.length;index+=0x8000) binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));
    return { bytes, mimeType:image.type, imageOrder:index + 1, data:btoa(binary) };
  }));
  const input: InspectionInput = {
    context:{crop:field('crop',80),plant:field('plant',80),description:field('description',800),location:field('location',120),notes:field('notes',800),language:field('language',20)||'en'},
    images:preparedImages.map((image) => ({ mimeType:image.mimeType, data:image.data })),
  };
  const inspectionId = crypto.randomUUID();
  // Archiving and diagnosis begin together. The response still waits for both
  // so a storage failure is explicit rather than silently discarded.
  const [gemini, storage] = await Promise.all([
    geminiInspection(input),
    storeInspectionImages(inspectionId, preparedImages.map(({ bytes, mimeType, imageOrder }) => ({ bytes, mimeType, imageOrder })))
      .catch(() => ({ status: 'failed' as const, images: [], failures: preparedImages.map((image) => ({ imageOrder: image.imageOrder, code: 'upload_failed' as const })) })),
  ]);
  const comparison = await queueShadow(input,gemini,inspectionId);
  const diagnosis = gemini.success && gemini.diagnosis ? legacyDiagnosis(gemini.diagnosis) : undefined;
  // Keep known aliases normalised, but retain an approved live crop name even
  // when it was added after the application build. PostgreSQL remains the
  // source of truth for the final crop/product eligibility decision.
  const requestedCrop = input.context.crop || diagnosis?.crop || '';
  const grounded = diagnosis ? {
    ...diagnosis,
    catalog_crop: catalogCropName(requestedCrop) || requestedCrop.trim().slice(0, 160),
  } : undefined;
  const catalogue = grounded
    ? await approvedCatalogueRecommendations(grounded)
    : { recommendations: [], source: 'catalogue_unavailable' as const };
  const recommendations = catalogue.recommendations;
  const persistence = await persistInspection({ inspectionId, input, employeeCode, imageCount: images.length, storage, provider: gemini, recommendations });
  const storageMetadata = {
    inspection_id: inspectionId,
    comparison_status: comparison.status,
    storage_status: storage.status,
    stored_image_count: storage.images.length,
    image_storage_failures: storage.failures.map((failure) => failure.imageOrder),
    persistence_status: persistence.status,
  };
  if (!gemini.success || !grounded) return NextResponse.json({error:gemini.error || 'AI photo analysis could not be completed.',...storageMetadata},{status:502});
  return NextResponse.json({...grounded,...storageMetadata,recommendations,catalogue_source:catalogue.source});
}
