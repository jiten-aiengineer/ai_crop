import contract from '../data/inspection-contract.json';

export type InspectionInput = { context: { crop: string; plant: string; description: string; location: string; notes: string; language: string }; images: Array<{ mimeType: string; data: string }> };
export type NormalizedDiagnosis = {
  crop: string | null; crop_confidence: number | null; condition: string; issue_detected: boolean;
  issue_type: string; probable_issue: string | null; confidence: number | null; severity: string | null;
  visible_symptoms: string[]; probable_causes: string[]; alternative_possibilities: string[];
  immediate_actions: string[]; prevention_advice: string[]; follow_up_questions: string[];
  needs_more_information: boolean; summary: string; recommended_next_action: string;
};
export type ProviderResult = { provider: 'gemini' | 'qwen'; model: string; success: boolean; latencyMs: number; timestamp: string; diagnosis?: NormalizedDiagnosis; rawResponse?: unknown; error?: string };
export const inspectionPrompt = (input: InspectionInput) => `${contract.prompt}\nContext:\n${JSON.stringify(input.context)}`;

export function normalizeDiagnosis(value: unknown): NormalizedDiagnosis {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Diagnosis must be an object.');
  const source = value as Record<string, unknown>;
  if (!('crop' in source) || !('issue_type' in source) || typeof source.issue_detected !== 'boolean') throw new Error('Diagnosis fields are missing.');
  const string = (key: string) => typeof source[key] === 'string' ? (source[key] as string).trim().slice(0, 4000) : '';
  const confidence = (key: string) => typeof source[key] === 'number' && Number.isFinite(source[key]) && (source[key] as number) >= 0 && (source[key] as number) <= 1 ? source[key] as number : null;
  const list = (key: string) => Array.isArray(source[key]) ? (source[key] as unknown[]).filter((item): item is string => typeof item === 'string').slice(0, 20).map((item) => item.slice(0, 1000)) : [];
  const issue = string('issue_type');
  return { crop: string('crop') || null, crop_confidence: confidence('crop_confidence'), condition: ['healthy','affected','stressed','uncertain'].includes(string('condition')) ? string('condition') : 'uncertain', issue_detected: source.issue_detected, issue_type: contract.schema.properties.issue_type.enum.includes(issue) ? issue : 'unknown', probable_issue: string('probable_issue') || null, confidence: confidence('confidence'), severity: ['early','mild','moderate','severe'].includes(string('severity')) ? string('severity') : null, visible_symptoms: list('visible_symptoms'), probable_causes: list('probable_causes'), alternative_possibilities: list('alternative_possibilities'), immediate_actions: list('immediate_actions'), prevention_advice: list('prevention_advice'), follow_up_questions: list('follow_up_questions'), needs_more_information: source.needs_more_information !== false, summary: string('summary'), recommended_next_action: string('recommended_next_action') };
}

export async function geminiInspection(input: InspectionInput): Promise<ProviderResult> {
  const start = Date.now();
  const model = process.env.GEMINI_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite';
  const base = { provider: 'gemini' as const, model, timestamp: new Date().toISOString() };
  try {
    if (process.env.GEMINI_ENABLED === 'false' || !process.env.GEMINI_API_KEY) throw new Error('Gemini is not configured or is disabled.');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type':'application/json', 'x-goog-api-key':process.env.GEMINI_API_KEY }, signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({ contents:[{role:'user',parts:[...input.images.map((image) => ({inlineData:image})),{text:inspectionPrompt(input)}]}], generationConfig:{temperature:.15,responseMimeType:'application/json',responseJsonSchema:contract.schema} }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Gemini is busy. Please try again shortly.' : `Gemini request failed (${response.status}).`);
    const payload = await response.json() as {candidates?: Array<{content?: {parts?: Array<{text?: string; thought?: boolean}>}}>};
    const finalText = payload.candidates?.[0]?.content?.parts?.filter((part) => part.text && !part.thought).map((part) => part.text).join('');
    if (!finalText) throw new Error('Gemini returned no final assessment.');
    const raw = JSON.parse(finalText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    return {...base,success:true,latencyMs:Date.now()-start,diagnosis:normalizeDiagnosis(raw),rawResponse:Object.fromEntries(Object.keys(contract.schema.properties).map(key => [key,raw[key] ?? null]))};
  } catch (error) {
    return {...base,success:false,latencyMs:Date.now()-start,error:error instanceof Error && error.name === 'TimeoutError' ? 'Gemini timed out.' : error instanceof Error ? error.message : 'Gemini unavailable.'};
  }
}

export function legacyDiagnosis(d: NormalizedDiagnosis) {
  return {...d,crop:d.crop || '',crop_confidence:d.crop_confidence ?? 0,confidence:d.confidence ?? 0,plant_condition:d.condition,problem_stage:d.severity || 'unknown',likely_issue:d.probable_issue || 'Uncertain',observed_symptoms:d.visible_symptoms,prevention_tips:d.prevention_advice,questions_for_farmer:d.follow_up_questions,additional_information_required:d.needs_more_information};
}

export async function queueShadow(input: InspectionInput, gemini: ProviderResult, inspectionId: string) {
  if (process.env.QWEN_SHADOW_MODE !== 'true' || process.env.QWEN_ENABLED !== 'true' || !process.env.COMPARISON_SERVICE_URL || !process.env.COMPARISON_SERVICE_TOKEN) return {status:'disabled'};
  try {
    const response = await fetch(`${process.env.COMPARISON_SERVICE_URL.replace(/\/$/,'')}/v1/comparisons/shadow`, {method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.COMPARISON_SERVICE_TOKEN}`},signal:AbortSignal.timeout(1500),body:JSON.stringify({inspection_id:inspectionId,input,gemini,contract_version:contract.version})});
    return {status:response.ok ? 'queued' : 'unavailable'};
  } catch { return {status:'unavailable'}; }
}
