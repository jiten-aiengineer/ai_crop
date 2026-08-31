import { NextResponse } from 'next/server';
import { catalogRecommendations } from '../../lib/catalog';

export const runtime = 'edge';

const MAX_FILES = 5;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

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

  const imageParts = await Promise.all(images.map(async (image) => ({
    inlineData: { mimeType: image.type, data: toBase64(new Uint8Array(await image.arrayBuffer())) },
  })));
  const crop = String(form.get('crop') || '').slice(0, 80);
  const location = String(form.get('location') || '').slice(0, 120);
  const description = String(form.get('description') || '').slice(0, 800);

  const prompt = `You are Crop Life AI, a cautious agricultural image-assessment assistant for Indian farmers. Analyze only visible evidence and supplied context. Never claim certainty, invent a pesticide product, prescribe a dose, or call the result a guaranteed diagnosis. If evidence is weak, set additional_information_required true and ask for specific photos or details. Farmer crop: ${crop || 'not supplied'}. Location: ${location || 'not supplied'}. Farmer description: ${description || 'not supplied'}. Return only the requested JSON.`;

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [...imageParts, { text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          required: ['crop', 'crop_confidence', 'issue_detected', 'issue_type', 'likely_issue', 'confidence', 'observed_symptoms', 'alternative_possibilities', 'additional_information_required', 'recommended_next_action', 'summary'],
          properties: {
            crop: { type: 'STRING' }, crop_confidence: { type: 'NUMBER' }, issue_detected: { type: 'BOOLEAN' },
            issue_type: { type: 'STRING' }, likely_issue: { type: 'STRING' }, confidence: { type: 'NUMBER' },
            observed_symptoms: { type: 'ARRAY', items: { type: 'STRING' } },
            alternative_possibilities: { type: 'ARRAY', items: { type: 'STRING' } },
            additional_information_required: { type: 'BOOLEAN' }, recommended_next_action: { type: 'STRING' }, summary: { type: 'STRING' },
          },
        },
      },
    }),
  });

  const payload = await response.json() as GeminiResponse;
  if (!response.ok) {
    const busy = response.status === 429;
    return NextResponse.json({ error: busy ? 'AI photo analysis is temporarily busy. Please wait a moment and try again.' : 'AI photo analysis could not be completed. Please try again.' }, { status: busy ? 429 : 502 });
  }
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) return NextResponse.json({ error: 'AI returned no assessment.' }, { status: 502 });
  try {
    const diagnosis = JSON.parse(text);
    return NextResponse.json({ ...diagnosis, recommendations: catalogRecommendations(diagnosis) });
  }
  catch { return NextResponse.json({ error: 'AI returned an invalid assessment.' }, { status: 502 }); }
}
