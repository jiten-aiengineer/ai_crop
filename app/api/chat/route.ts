import { NextResponse } from 'next/server';
import { catalog, searchCatalog } from '../../lib/catalog';

export const runtime = 'edge';
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };

function catalogFallback(products: typeof catalog) {
  const selected = products.slice(0, 4);
  const details = selected.map((product) => {
    const dose = product.dose ? ` Catalog dose: ${product.dose}.` : '';
    return `${product.name} — ${product.commonName}.${dose}`;
  }).join(' ');
  return {
    answer: `I found ${products.length} verified match${products.length === 1 ? '' : 'es'} in the Crop Life Science catalog. ${details} Always confirm the current approved label, crop registration and local expert guidance before use.`,
    products: selected,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
  const { question, history = [] } = await request.json() as { question?: string; history?: Array<{ role: string; content: string }> };
  const cleanQuestion = String(question || '').trim().slice(0, 1000);
  if (!cleanQuestion) return NextResponse.json({ error: 'Please enter a question.' }, { status: 400 });

  const lowerQuestion = cleanQuestion.toLowerCase();
  const exactProducts = catalog.filter((product) => lowerQuestion.includes(product.name.toLowerCase()));
  const rankedMatches = searchCatalog(cleanQuestion, 10).filter((match) => match.score >= 3);
  const candidates = (exactProducts.length ? exactProducts : rankedMatches.map((match) => match.product)).slice(0, 10);
  const catalogContext = candidates.map((product) => ({ id: product.id, name: product.name, category: product.category, composition: product.commonName, dose: product.dose, use_benefits: product.useBenefits, packing: product.packing, source_page: product.sourcePage }));
  const prompt = `You are Crop Life AI, a cautious agricultural assistant for Indian farmers. Answer the farmer's question clearly and briefly. You may answer general cultivation questions, but you MUST mention or recommend pesticide, fungicide, herbicide, seed treatment, nutrition, biostimulant, PGR, or any Crop Life product ONLY when it appears in CATALOG_CONTEXT. Never invent a product, composition, dose, crop approval, target, or pack size. If the catalog context does not support a product request, say that no verified catalog match was found. When you state a dose, preserve the exact catalog wording and remind the farmer to follow the approved label/local expert. Return JSON only. CATALOG_CONTEXT=${JSON.stringify(catalogContext)} FARMER_QUESTION=${JSON.stringify(cleanQuestion)}`;
  const contents = [...history.slice(-6).map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content.slice(0, 1200) }] })), { role: 'user', parts: [{ text: prompt }] }];
  let response: Response;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents, generationConfig: { temperature: .2, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['answer','recommended_product_ids'], properties: { answer: { type: 'STRING' }, recommended_product_ids: { type: 'ARRAY', items: { type: 'STRING' } } } } } }),
    });
  } catch {
    if (candidates.length) return NextResponse.json(catalogFallback(candidates));
    return NextResponse.json({ error: 'The assistant is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
  const payload = await response.json() as GeminiResponse;
  if (!response.ok) {
    if (candidates.length) return NextResponse.json(catalogFallback(candidates));
    return NextResponse.json({ error: 'The assistant is temporarily busy. Please try again shortly.' }, { status: response.status === 429 ? 429 : 502 });
  }
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) return NextResponse.json({ error: 'Assistant returned no answer.' }, { status: 502 });
  try {
    const parsed = JSON.parse(text) as { answer: string; recommended_product_ids: string[] };
    const allowed = new Set(candidates.map((product) => product.id));
    const products = catalog.filter((product) => allowed.has(product.id) && parsed.recommended_product_ids.includes(product.id)).slice(0, 4);
    return NextResponse.json({ answer: parsed.answer, products });
  } catch { return NextResponse.json({ error: 'Assistant returned an invalid answer.' }, { status: 502 }); }
}
