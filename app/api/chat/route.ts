import { NextResponse } from 'next/server';
import { catalog, searchCatalog } from '../../lib/catalog';

export const runtime = 'edge';
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };

function catalogFallback(products: typeof catalog, language = 'en') {
  const selected = products.slice(0, 4);
  const copy: Record<string, { found: string; dose: string; warning: string }> = {
    en: { found: 'I found verified matches in the Crop Life Science catalogue.', dose: 'Catalogue dose', warning: 'Always confirm the approved label, crop registration and local expert guidance before use.' },
    hi: { found: 'मुझे Crop Life Science कैटलॉग में सत्यापित उत्पाद मिले हैं।', dose: 'कैटलॉग खुराक', warning: 'उपयोग से पहले स्वीकृत लेबल, फसल पंजीकरण और स्थानीय विशेषज्ञ की सलाह जरूर जाँचें।' },
    gu: { found: 'Crop Life Science કેટલોગમાં ચકાસાયેલ ઉત્પાદનો મળ્યા છે.', dose: 'કેટલોગ માત્રા', warning: 'ઉપયોગ પહેલાં મંજૂર લેબલ, પાક નોંધણી અને સ્થાનિક નિષ્ણાતની સલાહ ચકાસો.' },
    mr: { found: 'Crop Life Science कॅटलॉगमध्ये सत्यापित उत्पादने सापडली आहेत.', dose: 'कॅटलॉग मात्रा', warning: 'वापरण्यापूर्वी मंजूर लेबल, पीक नोंदणी आणि स्थानिक तज्ज्ञांचा सल्ला तपासा.' },
    bn: { found: 'Crop Life Science ক্যাটালগে যাচাইকৃত পণ্য পাওয়া গেছে।', dose: 'ক্যাটালগ মাত্রা', warning: 'ব্যবহারের আগে অনুমোদিত লেবেল, ফসল নিবন্ধন এবং স্থানীয় বিশেষজ্ঞের পরামর্শ যাচাই করুন।' },
    bho: { found: 'Crop Life Science कैटलॉग में जाँचल उत्पाद मिलल बा।', dose: 'कैटलॉग खुराक', warning: 'इस्तेमाल से पहिले मंजूर लेबल, फसल रजिस्ट्रेशन आ स्थानीय जानकार के सलाह जरूर जाँच लीं।' },
  };
  const words = copy[language] || copy.en;
  const details = selected.map((product) => {
    const dose = product.dose ? ` ${words.dose}: ${product.dose}.` : '';
    return `${product.name} — ${product.commonName}.${dose}`;
  }).join(' ');
  return {
    answer: `${words.found} ${details} ${words.warning}`,
    products: selected,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
  const { question, history = [], language = 'en' } = await request.json() as { question?: string; history?: Array<{ role: string; content: string }>; language?: string };
  const cleanQuestion = String(question || '').trim().slice(0, 1000);
  if (!cleanQuestion) return NextResponse.json({ error: 'Please enter a question.' }, { status: 400 });

  const lowerQuestion = cleanQuestion.toLowerCase();
  const exactProducts = catalog.filter((product) => lowerQuestion.includes(product.name.toLowerCase()));
  const rankedMatches = searchCatalog(cleanQuestion, 10).filter((match) => match.score >= 3);
  const candidates = (exactProducts.length ? exactProducts : rankedMatches.map((match) => match.product)).slice(0, 10);
  const catalogContext = candidates.map((product) => ({ id: product.id, name: product.name, category: product.category, composition: product.commonName, dose: product.dose, use_benefits: product.useBenefits, packing: product.packing, source_page: product.sourcePage }));
  const languageNames: Record<string, string> = { en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi', bn: 'Bengali', bho: 'Bhojpuri' };
  const responseLanguage = languageNames[language] || 'English';
  const prompt = `You are Crop Life AI, a cautious agricultural assistant for Indian farmers. Answer the farmer clearly and briefly in ${responseLanguage}, using simple farmer-friendly wording. Keep official product names, chemical compositions and printed catalogue doses unchanged. You may answer general cultivation questions, but you MUST mention or recommend pesticide, fungicide, herbicide, seed treatment, nutrition, biostimulant, PGR, or any Crop Life product ONLY when it appears in CATALOG_CONTEXT. Never invent a product, composition, dose, crop approval, target, or pack size. If the catalogue context does not support a product request, say that no verified catalogue match was found. Remind the farmer to follow the approved label/local expert. Return JSON only. CATALOG_CONTEXT=${JSON.stringify(catalogContext)} FARMER_QUESTION=${JSON.stringify(cleanQuestion)}`;
  const contents = [...history.slice(-6).map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content.slice(0, 1200) }] })), { role: 'user', parts: [{ text: prompt }] }];
  let response: Response;
  try {
    response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ contents, generationConfig: { temperature: .2, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['answer','recommended_product_ids'], properties: { answer: { type: 'STRING' }, recommended_product_ids: { type: 'ARRAY', items: { type: 'STRING' } } } } } }),
    });
  } catch {
    if (candidates.length) return NextResponse.json(catalogFallback(candidates, language));
    return NextResponse.json({ error: 'The assistant is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
  const payload = await response.json() as GeminiResponse;
  if (!response.ok) {
    if (candidates.length) return NextResponse.json(catalogFallback(candidates, language));
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
