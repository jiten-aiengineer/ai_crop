import { NextResponse } from 'next/server';
import { catalogCropName, catalogRecommendations } from '../../lib/catalog';
import { geminiInspection, legacyDiagnosis, queueShadow, InspectionInput } from '../../lib/inspection-ai';

export const runtime = 'edge';
export const maxDuration = 60;

export async function POST(request: Request) {
  let form: FormData;
  try { form = await request.formData(); }
  catch { return NextResponse.json({error:'Send crop photos as form data.'},{status:400}); }
  const images = form.getAll('images').filter((value): value is File => value instanceof File);
  if (!images.length || images.length > 5) return NextResponse.json({error:'Please add between one and five crop photos.'},{status:400});
  if (images.some((image) => !['image/jpeg','image/png','image/webp','image/heic','image/heif'].includes(image.type) || !image.size) || images.reduce((sum,image) => sum+image.size,0)>4*1024*1024) return NextResponse.json({error:'Use JPG, PNG, WebP or HEIC photos totalling at most 4 MB.'},{status:400});
  const field = (key: string, max: number) => String(form.get(key)||'').slice(0,max);
  const input: InspectionInput = {context:{crop:field('crop',80),plant:field('plant',80),description:field('description',800),location:field('location',120),notes:field('notes',800),language:field('language',20)||'en'},images:await Promise.all(images.map(async(image) => {
    const bytes = new Uint8Array(await image.arrayBuffer());
    let binary='';
    for(let index=0;index<bytes.length;index+=0x8000) binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));
    return {mimeType:image.type,data:btoa(binary)};
  }))};
  const inspectionId = crypto.randomUUID();
  const gemini = await geminiInspection(input);
  const comparison = await queueShadow(input,gemini,inspectionId);
  if (!gemini.success || !gemini.diagnosis) return NextResponse.json({error:gemini.error || 'AI photo analysis could not be completed.',inspection_id:inspectionId,comparison_status:comparison.status},{status:502});
  const diagnosis = legacyDiagnosis(gemini.diagnosis);
  const grounded = {...diagnosis,catalog_crop:catalogCropName(input.context.crop || diagnosis.crop)};
  return NextResponse.json({...grounded,inspection_id:inspectionId,comparison_status:comparison.status,recommendations:catalogRecommendations(grounded)});
}
