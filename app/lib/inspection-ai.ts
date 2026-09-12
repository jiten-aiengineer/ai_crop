import contract from '../data/inspection-contract.json';

export type InspectionInput = {
  context: { crop: string; plant: string; description: string; location: string; notes: string; language: string };
  images: Array<{ mimeType: string; data: string }>;
};
export type NormalizedDiagnosis = {
  crop: string | null; crop_confidence: number | null; condition: string; issue_detected: boolean;
  issue_type: string; probable_issue: string | null; confidence: number | null; severity: string | null;
  visible_symptoms: string[]; probable_causes: string[]; alternative_possibilities: string[];
  immediate_actions: string[]; prevention_advice: string[]; follow_up_questions: string[];
  needs_more_information: boolean; summary: string; recommended_next_action: string;
};
export type ProviderName = 'gemma' | 'gemini' | 'qwen';
export type ProviderResult = {
  provider: ProviderName; model: string; success: boolean; latencyMs: number; timestamp: string;
  diagnosis?: NormalizedDiagnosis; rawResponse?: unknown; error?: string;
  inputTokens?: number; outputTokens?: number;
};

const WRAPPERS = ['diagnosis', 'assessment', 'result', 'analysis', 'crop_diagnosis', 'cropDiagnosis', 'data'];
const ALIASES: Record<string, string[]> = {
  crop: ['crop_name', 'cropName', 'plant', 'plant_name', 'plantName', 'identified_crop', 'identifiedCrop'],
  crop_confidence: ['cropConfidence', 'crop_confidence_percent', 'cropConfidencePercent', 'crop_probability'],
  condition: ['plant_condition', 'plantCondition', 'status'],
  issue_detected: ['issueDetected', 'problem_detected', 'problemDetected'],
  issue_type: ['problem_type', 'problemType', 'issueType', 'category', 'diagnosis_type', 'diagnosisType'],
  probable_issue: ['problem', 'problem_name', 'problemName', 'issue', 'issue_name', 'issueName', 'disease', 'disease_name', 'diseaseName', 'diagnosis_name', 'diagnosisName', 'primary_diagnosis', 'primaryDiagnosis'],
  confidence: ['problem_confidence', 'problemConfidence', 'confidence_score', 'confidenceScore', 'diagnosis_confidence', 'diagnosisConfidence'],
  severity: ['severity_level', 'severityLevel', 'problem_severity', 'problemSeverity'],
  visible_symptoms: ['observations', 'visible_signs', 'visibleSigns', 'symptoms', 'findings', 'evidence', 'visual_evidence', 'visualEvidence'],
  probable_causes: ['causes', 'possible_causes', 'possibleCauses'],
  alternative_possibilities: ['differential_diagnoses', 'differentialDiagnoses', 'differentials', 'alternative_diagnoses', 'alternativeDiagnoses', 'possible_alternatives', 'possibleAlternatives'],
  immediate_actions: ['actions', 'immediateActions', 'recommended_actions', 'recommendedActions'],
  prevention_advice: ['prevention_tips', 'preventionTips', 'preventionAdvice'],
  follow_up_questions: ['questions_for_farmer', 'questionsForFarmer', 'followUpQuestions'],
  needs_more_information: ['needsMoreInformation', 'needs_more_info', 'needsMoreInfo', 'more_information_needed', 'moreInformationNeeded', 'additional_information_required', 'uncertain'],
  summary: ['assessment_summary', 'assessmentSummary', 'explanation'],
  recommended_next_action: ['next_action', 'nextAction', 'recommendedNextAction'],
};

function unwrapDiagnosis(value: unknown): Record<string, unknown> {
  let current = value;
  if (Array.isArray(current)) current = current[0];
  if (!current || typeof current !== 'object' || Array.isArray(current)) return {};
  for (const wrapper of WRAPPERS) {
    const nested = (current as Record<string, unknown>)[wrapper];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) { current = nested; break; }
  }
  return { ...(current as Record<string, unknown>) };
}

function aliased(source: Record<string, unknown>, key: string): unknown {
  if (source[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  for (const alias of ALIASES[key] || []) {
    if (source[alias] !== undefined && source[alias] !== null && source[alias] !== '') return source[alias];
  }
  return undefined;
}

function cleanString(value: unknown, limit = 4000) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

function cleanList(value: unknown) {
  if (typeof value === 'string') return value.trim() ? [value.trim().slice(0, 1000)] : [];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 20).map((item) => item.trim().slice(0, 1000))
    : [];
}

function cleanConfidence(value: unknown): number | null {
  const numeric = typeof value === 'string' ? Number(value.trim().replace('%', '')) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric < 0) return null;
  if (numeric <= 1) return numeric;
  return numeric <= 100 ? numeric / 100 : null;
}

export const inspectionPrompt = (input: InspectionInput) => {
  const declared = input.context.crop.trim();
  const cropRule = declared
    ? `The crop has already been selected by the field employee.\nKnown crop: ${JSON.stringify(declared)}\nDo not identify, replace or change the crop. Return this exact known crop in the crop field and null for crop_confidence.`
    : 'No crop was declared. Crop identification is optional; remain uncertain when visual evidence is insufficient.';
  return `${contract.prompt}\n\n${cropRule}\n\nField context:\n${JSON.stringify(input.context)}\n\nReturn exactly one JSON object matching this schema:\n${JSON.stringify(contract.schema)}`;
};

export function normalizeDiagnosis(value: unknown, declaredCrop = ''): NormalizedDiagnosis {
  const source = unwrapDiagnosis(value);
  const string = (key: string, limit = 4000) => cleanString(aliased(source, key), limit);
  const list = (key: string) => cleanList(aliased(source, key));
  const confidence = (key: string) => cleanConfidence(aliased(source, key));
  const issueCandidate = string('issue_type', 64).toLowerCase().replace(/[\s-]+/g, '_');
  const issueAliases: Record<string, string> = { insect: 'insect_pest', pest: 'insect_pest', mite: 'insect_pest', fungal: 'fungal_disease', fungus: 'fungal_disease', bacterial: 'bacterial_disease', bacteria: 'bacterial_disease', weed: 'weed_problem', deficiency: 'nutrient_deficiency', physiological_disorder: 'growth_stress', environmental_stress: 'abiotic_stress', healthy: 'none' };
  const normalizedIssue = issueAliases[issueCandidate] || issueCandidate;
  const allowedIssues = new Set<string>(contract.schema.properties.issue_type.enum);
  const issueType = allowedIssues.has(normalizedIssue) ? normalizedIssue : 'unknown';
  const probableIssue = string('probable_issue', 180) || null;
  const problemConfidence = confidence('confidence');
  const reportedDetected = aliased(source, 'issue_detected');
  const issueDetected = typeof reportedDetected === 'boolean' ? reportedDetected : Boolean(probableIssue && !['unknown', 'none'].includes(issueType));
  const lowEvidence = problemConfidence === null || problemConfidence < 0.6 || issueType === 'unknown';
  const conditionValue = string('condition', 32).toLowerCase();
  const severityValue = string('severity', 32).toLowerCase();
  const crop = declaredCrop.trim().slice(0, 160) || string('crop', 160) || null;
  return {
    crop,
    crop_confidence: declaredCrop.trim() ? null : confidence('crop_confidence'),
    condition: ['healthy', 'affected', 'stressed', 'uncertain'].includes(conditionValue) ? conditionValue : 'uncertain',
    issue_detected: issueType === 'unknown' ? false : issueDetected,
    issue_type: issueType,
    probable_issue: probableIssue || (lowEvidence ? 'Insufficient visual evidence' : null),
    confidence: problemConfidence,
    severity: ['early', 'mild', 'moderate', 'severe', 'unknown'].includes(severityValue) ? severityValue : 'unknown',
    visible_symptoms: list('visible_symptoms'),
    probable_causes: list('probable_causes'),
    alternative_possibilities: list('alternative_possibilities'),
    immediate_actions: list('immediate_actions'),
    prevention_advice: list('prevention_advice'),
    follow_up_questions: list('follow_up_questions'),
    needs_more_information: lowEvidence || aliased(source, 'needs_more_information') !== false,
    summary: string('summary') || 'AI could not make a reliable assessment from the supplied crop photos.',
    recommended_next_action: string('recommended_next_action') || 'Add a clear close-up of the affected area and one full-plant photo for expert review.',
  };
}

function safeRaw(diagnosis: NormalizedDiagnosis) {
  return Object.fromEntries(Object.keys(contract.schema.properties).map((key) => [key, diagnosis[key as keyof NormalizedDiagnosis] ?? null]));
}

async function googleInspection(input: InspectionInput, provider: 'gemma' | 'gemini', model: string): Promise<ProviderResult> {
  const start = Date.now();
  const base = { provider, model, timestamp: new Date().toISOString() };
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('AI service is not configured.');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [...input.images.map((image) => ({ inlineData: image })), { text: inspectionPrompt(input) }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 3072, responseMimeType: 'application/json' },
      }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'AI service is busy. Please try again shortly.' : `AI inspection request failed (${response.status}).`);
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
    const finalText = payload.candidates?.[0]?.content?.parts?.filter((part) => part.text && !part.thought).map((part) => part.text).join('');
    if (!finalText) throw new Error('AI returned no final assessment.');
    const parsed = JSON.parse(finalText.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
    const diagnosis = normalizeDiagnosis(parsed, input.context.crop);
    return { ...base, success: true, latencyMs: Date.now() - start, diagnosis, rawResponse: safeRaw(diagnosis), inputTokens: payload.usageMetadata?.promptTokenCount, outputTokens: payload.usageMetadata?.candidatesTokenCount };
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError'
      ? 'AI analysis took too long. Please try again with clear, compressed photos.'
      : error instanceof Error ? error.message : 'AI analysis is temporarily unavailable.';
    return { ...base, success: false, latencyMs: Date.now() - start, error: message };
  }
}

export function gemmaInspection(input: InspectionInput) {
  const model = process.env.PRIMARY_VISION_MODEL || process.env.GEMMA_MODEL || 'gemma-4-26b-a4b-it';
  return googleInspection(input, 'gemma', model);
}

export function geminiInspection(input: InspectionInput) {
  const model = process.env.GEMINI_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.5-flash-lite';
  return googleInspection(input, 'gemini', model);
}

export function diagnosisConfidenceLevel(confidence: number | null) {
  if (confidence !== null && confidence >= 0.8) return 'high' as const;
  if (confidence !== null && confidence >= 0.6) return 'medium' as const;
  return 'low' as const;
}

export function canMatchProducts(diagnosis: NormalizedDiagnosis, declaredCrop: string) {
  return Boolean(declaredCrop.trim() && diagnosis.issue_detected && diagnosis.issue_type !== 'unknown' && diagnosis.issue_type !== 'none' && !diagnosis.needs_more_information && diagnosis.confidence !== null && diagnosis.confidence >= 0.6);
}

export function legacyDiagnosis(d: NormalizedDiagnosis, declaredCrop = '') {
  const confidenceLevel = diagnosisConfidenceLevel(d.confidence);
  return { ...d, crop: declaredCrop.trim() || d.crop || '', crop_confidence: declaredCrop.trim() ? null : d.crop_confidence, confidence: d.confidence ?? 0, declared_crop: declaredCrop.trim() || null, crop_source: declaredCrop.trim() ? 'field_officer' : 'ai_optional', confidence_level: confidenceLevel, plant_condition: d.condition, problem_stage: d.severity || 'unknown', likely_issue: d.probable_issue || 'Insufficient visual evidence', observed_symptoms: d.visible_symptoms, prevention_tips: d.prevention_advice, questions_for_farmer: d.follow_up_questions, additional_information_required: d.needs_more_information || confidenceLevel === 'low' };
}
