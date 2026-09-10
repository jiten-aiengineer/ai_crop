import { NextResponse } from 'next/server';
import { searchCatalogProducts, type CatalogProduct } from '../../lib/catalog';
import { approvedCatalogueProducts } from '../../lib/database-catalog';
import { companyAssistantKnowledge } from '../../lib/company-knowledge';
import { isSalesLocationQuestion, salesDirectoryAnswer } from '../../lib/sales-directory';

export const runtime = 'nodejs';
type GeminiResponse = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } };

function parseJsonObject(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try { return JSON.parse(trimmed) as unknown; }
  catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    throw new Error('No JSON object was returned.');
  }
}

async function readGeminiResponse(response: Response): Promise<GeminiResponse | null> {
  const body = await response.text();
  if (!body.trim()) return null;
  try { return JSON.parse(body) as GeminiResponse; }
  catch { return null; }
}

function catalogFallback(products: CatalogProduct[], language = 'en') {
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

function companyFallback(language = 'en') {
  const copy: Record<string, string> = {
    en: 'I can explain Crop Life AI and the supplied CLSL catalogue. Crop Life AI supports photo-based crop inspection, catalogue discovery, practical farm tools and local sales-contact support. Product discovery uses the supplied CLSL catalogue and CIB&RC approved crop map. For corporate facts not included in this assistant, please use an official CLSL source or your CLSL representative.',
    hi: 'मैं Crop Life AI और दिए गए CLSL कैटलॉग के बारे में बता सकता हूँ। Crop Life AI फोटो-आधारित फसल जाँच, कैटलॉग खोज, उपयोगी फार्म टूल और स्थानीय सेल्स संपर्क में मदद करता है। उत्पाद खोज दिए गए CLSL कैटलॉग और CIB&RC अनुमोदित फसल मैप पर आधारित है। इस सहायक में शामिल न होने वाले कंपनी तथ्यों के लिए आधिकारिक CLSL स्रोत या प्रतिनिधि से संपर्क करें।',
    gu: 'હું Crop Life AI અને આપેલ CLSL કેટલોગ વિશે સમજાવી શકું છું. Crop Life AI ફોટો આધારિત પાક તપાસ, કેટલોગ શોધ, ઉપયોગી ફાર્મ ટૂલ્સ અને સ્થાનિક સેલ્સ સંપર્કમાં મદદ કરે છે. ઉત્પાદન શોધ આપેલ CLSL કેટલોગ અને CIB&RC મંજૂર પાક મેપ પર આધારિત છે. આ સહાયકમાં ન હોય તેવી કંપની માહિતી માટે અધિકૃત CLSL સ્ત્રોત અથવા પ્રતિનિધિનો સંપર્ક કરો.',
    mr: 'मी Crop Life AI आणि दिलेल्या CLSL कॅटलॉगबद्दल सांगू शकतो. Crop Life AI फोटोवर आधारित पीक तपासणी, कॅटलॉग शोध, उपयुक्त शेती साधने आणि स्थानिक विक्री संपर्कासाठी मदत करते. उत्पादन शोध दिलेल्या CLSL कॅटलॉग आणि CIB&RC मंजूर पीक नकाशावर आधारित आहे. या सहाय्यात नसलेल्या कंपनी माहितीसाठी अधिकृत CLSL स्रोत किंवा प्रतिनिधींशी संपर्क करा.',
    bn: 'আমি Crop Life AI এবং দেওয়া CLSL ক্যাটালগ সম্পর্কে বলতে পারি। Crop Life AI ছবি-ভিত্তিক ফসল পরীক্ষা, ক্যাটালগ খোঁজা, ব্যবহারিক ফার্ম টুল এবং স্থানীয় সেলস যোগাযোগে সাহায্য করে। পণ্য খোঁজা দেওয়া CLSL ক্যাটালগ ও CIB&RC অনুমোদিত ফসল ম্যাপের উপর ভিত্তি করে। এই সহকারীতে না থাকা কোম্পানি তথ্যের জন্য অফিসিয়াল CLSL উৎস বা প্রতিনিধির সঙ্গে যোগাযোগ করুন।',
    bho: 'हम Crop Life AI आ दिहल CLSL कैटलॉग के बारे में बता सकत बानी। Crop Life AI फोटो से फसल जाँच, कैटलॉग खोज, काम के फार्म टूल आ स्थानीय सेल्स संपर्क में मदद करेला। उत्पाद खोज दिहल CLSL कैटलॉग आ CIB&RC मंजूर फसल मैप पर आधारित बा। एह सहायक में ना होखे वाला कंपनी जानकारी खातिर आधिकारिक CLSL स्रोत भा प्रतिनिधि से संपर्क करीं।',
  };
  return { answer: copy[language] || copy.en, products: [] };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI service is not configured.' }, { status: 503 });
  let input: { question?: string; history?: Array<{ role: string; content: string }>; language?: string; mode?: 'crop' | 'company' };
  try { input = await request.json() as typeof input; }
  catch { return NextResponse.json({ error: 'Please send a valid assistant question.' }, { status: 400 }); }
  const { question, history = [], language = 'en' } = input;
  const mode = input.mode === 'company' ? 'company' : 'crop';
  const cleanQuestion = String(question || '').trim().slice(0, 1000);
  if (!cleanQuestion) return NextResponse.json({ error: 'Please enter a question.' }, { status: 400 });

  // Buying-location queries are answered from the privacy-limited employee
  // directory export, rather than asking Gemini to invent a shop, price or stock.
  if (isSalesLocationQuestion(cleanQuestion)) {
    return NextResponse.json({ ...salesDirectoryAnswer(cleanQuestion, language), products: [] });
  }

  // This is the live RAG source of truth. It contains only records released
  // through the approval pipeline; a draft or inactive product never enters
  // Gemini's context or a farmer-facing response.
  const liveCatalogue = await approvedCatalogueProducts();
  const approvedProducts = liveCatalogue.source === 'approved_postgresql_catalogue' ? liveCatalogue.products : [];
  const lowerQuestion = cleanQuestion.toLowerCase();
  const exactProducts = approvedProducts.filter((product) => lowerQuestion.includes(product.name.toLowerCase()));
  const rankedMatches = searchCatalogProducts(approvedProducts, cleanQuestion, 10).filter((match) => match.score >= 3);
  const candidates = (exactProducts.length ? exactProducts : rankedMatches.map((match) => match.product)).slice(0, 10);
  const catalogContext = candidates.map((product) => ({ id: product.id, name: product.name, category: product.category, composition: product.commonName, dose: product.dose, use_benefits: product.useBenefits, packing: product.packing, approved_crops: product.approvedCrops || [], crop_mapping_source: product.cropMappingSource || '', source_page: product.sourcePage }));
  const languageNames: Record<string, string> = { en: 'English', hi: 'Hindi', gu: 'Gujarati', mr: 'Marathi', bn: 'Bengali', bho: 'Bhojpuri' };
  const responseLanguage = languageNames[language] || 'English';
  const cropInstructions = 'You are a cautious agricultural assistant for Indian farmers. You may answer general cultivation questions, but you MUST mention or recommend pesticide, fungicide, herbicide, seed treatment, nutrition, biostimulant, PGR, or any Crop Life product ONLY when it appears in CATALOG_CONTEXT. Never invent a product, composition, dose, crop approval, target, or pack size. If the catalogue context does not support a product request, say that no verified catalogue match was found. Remind the farmer to follow the approved label and local expert guidance.';
  const companyInstructions = 'You are the company-support face of Crop Life Mitra. Answer only from COMPANY_ASSISTANT_KNOWLEDGE and CATALOG_CONTEXT. You may explain the Crop Life AI digital-service strategy in COMPANY_ASSISTANT_KNOWLEDGE, but do not represent it as the full corporate strategy of CLSL. You may state only the approved company-profile facts in COMPANY_ASSISTANT_KNOWLEDGE and should identify them as coming from official CLSL documents when useful. Do not invent or guess current ownership, leadership, financials, stock price, employee count, exports, registrations, corporate commitments, dealer locations, price, product approvals, or product claims. If the question needs information outside the provided knowledge, say that this assistant does not have an approved company source for it and direct the user to the official CLSL website or representative. Do not give crop treatment advice in this mode; invite the user to choose Crop Support for that.';
  const prompt = `You are Crop Life Mitra, the friendly Crop Life AI assistant for Crop Life Science Limited (CLSL). The selected conversation is ${mode === 'company' ? 'CLSL and Company Support' : 'Crop and Product Support'}. Answer clearly and briefly in ${responseLanguage}, using simple farmer-friendly wording. Keep official product names, chemical compositions and printed catalogue doses unchanged. ${mode === 'company' ? companyInstructions : cropInstructions} Return JSON only with answer and recommended_product_ids. COMPANY_ASSISTANT_KNOWLEDGE=${JSON.stringify(companyAssistantKnowledge)} CATALOG_CONTEXT=${JSON.stringify(catalogContext)} USER_QUESTION=${JSON.stringify(cleanQuestion)}`;
  const contents = [...history.slice(-6).map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content.slice(0, 1200) }] })), { role: 'user', parts: [{ text: prompt }] }];
  let response: Response;
  try {
    const model = process.env.GEMINI_TEXT_MODEL || 'gemini-3.5-flash-lite';
    response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(35_000),
      body: JSON.stringify({ contents, generationConfig: { temperature: .2, responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', required: ['answer','recommended_product_ids'], properties: { answer: { type: 'STRING' }, recommended_product_ids: { type: 'ARRAY', items: { type: 'STRING' } } } } } }),
    });
  } catch {
    if (mode === 'company') return NextResponse.json(companyFallback(language));
    if (candidates.length) return NextResponse.json(catalogFallback(candidates, language));
    return NextResponse.json({ error: 'The assistant is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
  const payload = await readGeminiResponse(response);
  if (!response.ok) {
    if (mode === 'company') return NextResponse.json(companyFallback(language));
    if (candidates.length) return NextResponse.json(catalogFallback(candidates, language));
    return NextResponse.json({ error: 'The assistant is temporarily busy. Please try again shortly.' }, { status: response.status === 429 ? 429 : 502 });
  }
  if (!payload) {
    if (mode === 'company') return NextResponse.json(companyFallback(language));
    if (candidates.length) return NextResponse.json(catalogFallback(candidates, language));
    return NextResponse.json({ error: 'The assistant service returned an unreadable response. Please try again.' }, { status: 502 });
  }
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text;
  if (!text) return NextResponse.json({ error: 'Assistant returned no answer.' }, { status: 502 });
  try {
    const parsed = parseJsonObject(text) as { answer?: unknown; recommended_product_ids?: unknown };
    if (typeof parsed.answer !== 'string' || !parsed.answer.trim()) throw new Error('Missing answer.');
    const ids = Array.isArray(parsed.recommended_product_ids) ? parsed.recommended_product_ids.filter((id): id is string => typeof id === 'string') : [];
    const allowed = new Set(candidates.map((product) => product.id));
    const products = candidates.filter((product) => allowed.has(product.id) && ids.includes(product.id)).slice(0, 4);
    return NextResponse.json({ answer: parsed.answer.trim(), products });
  } catch {
    if (mode === 'company') return NextResponse.json(companyFallback(language));
    if (candidates.length) return NextResponse.json(catalogFallback(candidates, language));
    return NextResponse.json({ error: 'The assistant could not format its answer. Please ask again in a shorter sentence.' }, { status: 502 });
  }
}
