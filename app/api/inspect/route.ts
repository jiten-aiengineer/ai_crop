import { NextResponse } from 'next/server';
import { catalogCropName, catalogRecommendations } from '../../lib/catalog';

export const runtime = 'edge';
export const maxDuration = 60;

const MAX_FILES = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

function parseJsonObject(value: string) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(cleaned); }
  catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('No JSON object was returned.');
  }
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Send crop photos as form data.' }, { status: 400 });
  }
  const images = form.getAll('images').filter((value): value is File => value instanceof File).slice(0, MAX_FILES);
  if (!images.length) return NextResponse.json({ error: 'Please add at least one crop photo.' }, { status: 400 });

  for (const image of images) {
    if (!ALLOWED_TYPES.has(image.type) || image.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: 'Use JPG, PNG, WebP or HEIC images up to 4 MB each.' }, { status: 400 });
    }
  }
  if (images.reduce((total, image) => total + image.size, 0) > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: 'The selected photos are too large together. Please use fewer photos and try again.' }, { status: 413 });
  }

  const imageParts = await Promise.all(images.map(async (image) => ({
    inlineData: { mimeType: image.type, data: toBase64(new Uint8Array(await image.arrayBuffer())) },
  })));
  const crop = String(form.get('crop') || '').slice(0, 80);
  const location = String(form.get('location') || '').slice(0, 120);
  const description = String(form.get('description') || '').slice(0, 800);
  const languageCode = String(form.get('language') || 'en');
  const languageNames: Record<string, string> = { en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi', bn: 'Bengali', bho: 'Bhojpuri' };
  const responseLanguage = languageNames[languageCode] || 'English';

  const prompt = `You are Crop Life AI, a cautious agricultural image-assessment assistant for Indian farmers. Study every supplied photo and explain the visible evidence in useful detail. Never claim certainty, invent a pesticide product, prescribe a dose, or call the result a guaranteed diagnosis. Product matching is performed separately from the CLSL catalogue.

Identify the plant/crop from the image. When the farmer supplied a crop, treat it as important context but flag uncertainty if the image conflicts. Describe what appears to be happening, its visible stage/severity, the most likely biological or environmental causes, immediate non-chemical actions, prevention steps, and concise questions that would improve confidence. Separate visible observations from inferred causes. If the image does not show a crop or plant, set issue_detected false, issue_type "none", plant_condition "uncertain", and additional_information_required true. If a probable issue is visible but better photos or field details would help, keep issue_detected true and set additional_information_required true.

Use one issue_type only: insect_pest, fungal_disease, bacterial_disease, weed_problem, nutrient_deficiency, growth_stress, abiotic_stress, unknown, or none. Keep crop, likely_issue, issue_type, plant_condition and problem_stage in English because they drive catalogue matching. Write summary, observed_symptoms, probable_causes, alternative_possibilities, immediate_actions, prevention_tips, questions_for_farmer and recommended_next_action in ${responseLanguage}, using simple farmer-friendly language. Farmer crop: ${crop || 'not supplied'}. Location: ${location || 'not supplied'}. Farmer description: ${description || 'not supplied'}. Return only the requested JSON.`;

  let response: Response;
  try {
    const model = process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite';
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...imageParts, { text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          thinkingConfig: { thinkingLevel: 'minimal' },
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            required: ['crop', 'crop_confidence', 'plant_condition', 'problem_stage', 'issue_detected', 'issue_type', 'likely_issue', 'confidence', 'observed_symptoms', 'probable_causes', 'alternative_possibilities', 'immediate_actions', 'prevention_tips', 'questions_for_farmer', 'additional_information_required', 'recommended_next_action', 'summary'],
            properties: {
              crop: { type: 'STRING' }, crop_confidence: { type: 'NUMBER' }, issue_detected: { type: 'BOOLEAN' },
              plant_condition: { type: 'STRING', enum: ['affected', 'stressed', 'healthy', 'uncertain'] },
              problem_stage: { type: 'STRING', enum: ['early', 'moderate', 'severe', 'unknown'] },
              issue_type: { type: 'STRING', enum: ['insect_pest', 'fungal_disease', 'bacterial_disease', 'weed_problem', 'nutrient_deficiency', 'growth_stress', 'abiotic_stress', 'unknown', 'none'] }, likely_issue: { type: 'STRING' }, confidence: { type: 'NUMBER' },
              observed_symptoms: { type: 'ARRAY', items: { type: 'STRING' } },
              probable_causes: { type: 'ARRAY', items: { type: 'STRING' } },
              alternative_possibilities: { type: 'ARRAY', items: { type: 'STRING' } },
              immediate_actions: { type: 'ARRAY', items: { type: 'STRING' } },
              prevention_tips: { type: 'ARRAY', items: { type: 'STRING' } },
              questions_for_farmer: { type: 'ARRAY', items: { type: 'STRING' } },
              additional_information_required: { type: 'BOOLEAN' }, recommended_next_action: { type: 'STRING' }, summary: { type: 'STRING' },
            },
          },
        },
      }),
    });
  } catch {
    return NextResponse.json({ error: 'AI photo analysis took too long. Please try one or two clear photos.' }, { status: 504 });
  }

  let payload: GeminiResponse;
  try {
    const raw = await response.text();
    payload = JSON.parse(raw) as GeminiResponse;
  }
  catch { return NextResponse.json({ error: 'AI photo analysis returned an unexpected response. Please try again.' }, { status: 502 }); }
  if (!response.ok) {
    const busy = response.status === 429;
    return NextResponse.json({ error: busy ? 'AI photo analysis is temporarily busy. Please wait a moment and try again.' : 'AI photo analysis could not be completed. Please try again.' }, { status: busy ? 429 : 502 });
  }
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) return NextResponse.json({ error: 'AI returned no assessment.' }, { status: 502 });
  try {
    const diagnosis = parseJsonObject(text);
    const catalogCrop = catalogCropName(crop || diagnosis.crop || '');
    const groundedDiagnosis = { ...diagnosis, catalog_crop: catalogCrop };
    return NextResponse.json({ ...groundedDiagnosis, recommendations: catalogRecommendations(groundedDiagnosis) });
  }
  catch { return NextResponse.json({ error: 'AI returned an invalid assessment.' }, { status: 502 }); }
}
