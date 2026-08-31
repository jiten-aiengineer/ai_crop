import catalogData from '../data/products.json';

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  commonName: string;
  dose: string;
  useBenefits: string;
  packing: string;
  image: string;
  sourcePage: number;
  limitedRecord?: boolean;
};

export const catalog = catalogData as CatalogProduct[];
const stopWords = new Set(['the','and','for','are','can','does','how','tell','show','details','composition','dose','with','from','that','this','have','what','which','crop','plant','leaves','possible','activity','visible','issue','pest','disease','product','products','recommend','please','about','your','only','some','into','used','use']);
const diagnosisStopWords = new Set([...stopWords, 'likely', 'probable', 'suspected', 'symptoms', 'damage', 'infection', 'unknown', 'none', 'other', 'insect', 'insecticide', 'fungal', 'fungus', 'fungicide', 'bacterial', 'bactericide', 'weed', 'herbicide', 'nutrient', 'growth', 'stress']);

const categorySignals: Array<{ categories: string[]; signals: string[] }> = [
  { categories: ['Insecticides'], signals: ['insect', 'insect_pest', 'whitefly', 'white fly', 'aphid', 'jassid', 'thrips', 'mite', 'borer', 'hopper', 'planthopper', 'bollworm', 'caterpillar', 'larva', 'termite', 'sucking pest'] },
  { categories: ['Antibiotic / Bactericide'], signals: ['bacterial', 'bacterium', 'bactericide', 'bacterial_disease'] },
  { categories: ['Fungicides'], signals: ['fungal', 'fungus', 'fungicide', 'fungal_disease', 'blight', 'mildew', 'rust', 'smut', 'scab', 'wilt', 'rot', 'damping off', 'leaf spot', 'blast'] },
  { categories: ['Weedicides'], signals: ['weed', 'herbicide', 'weed_problem', 'unwanted grass'] },
  { categories: ['Micro Fertilizers', 'Bio Stimulant'], signals: ['nutrient', 'deficiency', 'chlorosis', 'micronutrient', 'yellowing', 'nutrition', 'nutrient_deficiency'] },
  { categories: ['Bio Stimulant', 'Plant Growth Regulator'], signals: ['growth stress', 'growth_stress', 'stunted', 'flowering', 'fruit setting', 'poor growth', 'plant growth'] },
  { categories: ['Seed Treatment'], signals: ['seed treatment', 'seed_treatment', 'seed borne', 'germination'] },
];

const cropAliases: Record<string, string[]> = {
  rice: ['rice', 'paddy'], paddy: ['rice', 'paddy'], soybean: ['soybean', 'soyabean'], soyabean: ['soybean', 'soyabean'],
  chickpea: ['chickpea', 'chickpea', 'gram'], chilli: ['chilli', 'chillies', 'chili'], potato: ['potato', 'tuber'],
};

function normalize(value: string) {
  return value.toLowerCase().replace(/\bplanthopper\b/g, 'plant hopper').replace(/\bwhite fly\b/g, 'whitefly').replace(/[^a-z0-9%+.-]+/g, ' ').trim();
}

function tokens(value: string, ignored = stopWords) {
  return [...new Set(normalize(value).split(/\s+/).filter((token) => token.length > 2 && !ignored.has(token)))];
}

export function searchCatalog(query: string, limit = 12, category = 'All products') {
  const normalized = normalize(query);
  const queryTokens = tokens(normalized);
  const categoryLower = category.toLowerCase();
  return catalog.map((product) => {
    const haystack = `${product.name} ${product.category} ${product.commonName} ${product.useBenefits} ${product.dose}`.toLowerCase();
    let score = 0;
    if (normalized && haystack.includes(normalized)) score += 12;
    for (const token of queryTokens) {
      if (product.name.toLowerCase().includes(token)) score += 8;
      else if (product.commonName.toLowerCase().includes(token)) score += 5;
      else if (product.useBenefits.toLowerCase().includes(token)) score += 3;
      else if (product.category.toLowerCase().includes(token)) score += 2;
    }
    return { product, score };
  }).filter(({ product, score }) => (categoryLower === 'all products' || product.category.toLowerCase() === categoryLower) && (!normalized || score > 0))
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, limit);
}

export function catalogRecommendations(diagnosis: { crop?: string; likely_issue?: string; issue_type?: string; observed_symptoms?: string[]; confidence?: number; additional_information_required?: boolean; issue_detected?: boolean }) {
  if (!diagnosis.issue_detected || (diagnosis.confidence ?? 0) < 0.42) return [];

  const crop = normalize(diagnosis.crop || '');
  const likelyIssue = normalize(diagnosis.likely_issue || '');
  const issueText = normalize([diagnosis.issue_type, diagnosis.likely_issue, ...(diagnosis.observed_symptoms || [])].filter(Boolean).join(' '));
  const issueTokens = tokens(issueText, diagnosisStopWords);
  const allowedCategories = new Set(categorySignals.flatMap((rule) => rule.signals.some((signal) => issueText.includes(signal)) ? rule.categories : []));
  if (issueText.includes('sheath blight')) allowedCategories.add('Antibiotic / Bactericide');
  if (!allowedCategories.size && !issueTokens.length) return [];

  const aliases = cropAliases[crop] || tokens(crop, diagnosisStopWords);
  const provisional = Boolean(diagnosis.additional_information_required);
  return catalog.map((product) => {
    if (allowedCategories.size && !allowedCategories.has(product.category)) return null;
    const haystack = normalize(`${product.name} ${product.category} ${product.commonName} ${product.useBenefits}`);
    let targetScore = 0;
    if (likelyIssue.length > 3 && !['unknown', 'none', 'uncertain'].includes(likelyIssue) && haystack.includes(likelyIssue)) targetScore += 20;
    for (const token of issueTokens) if (haystack.includes(token)) targetScore += 4;
    const cropMatch = aliases.some((alias) => alias.length > 2 && haystack.includes(alias));
    const broadCropUse = /various crops|multi ?crops|other crops|field crops/.test(haystack);
    if (issueTokens.length ? !targetScore : !cropMatch) return null;
    const score = targetScore + (allowedCategories.has(product.category) ? 6 : 0) + (cropMatch ? 5 : broadCropUse ? 1 : 0);
    if (score < (provisional ? 10 : 8)) return null;
    return { product, score };
  }).filter((match): match is { product: CatalogProduct; score: number } => Boolean(match))
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, provisional ? 3 : 5)
    .map(({ product, score }) => ({ ...product, matchScore: score }));
}
