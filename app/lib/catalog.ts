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

export function searchCatalog(query: string, limit = 12, category = 'All products') {
  const normalized = query.toLowerCase().replace(/[^a-z0-9%+.-]+/g, ' ').trim();
  const tokens = [...new Set(normalized.split(/\s+/).filter((token) => token.length > 2 && !stopWords.has(token)))];
  const categoryLower = category.toLowerCase();
  return catalog.map((product) => {
    const haystack = `${product.name} ${product.category} ${product.commonName} ${product.useBenefits} ${product.dose}`.toLowerCase();
    let score = 0;
    if (normalized && haystack.includes(normalized)) score += 12;
    for (const token of tokens) {
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
  if (!diagnosis.issue_detected || diagnosis.additional_information_required || (diagnosis.confidence ?? 0) < 0.55) return [];
  const query = [diagnosis.crop, diagnosis.likely_issue, diagnosis.issue_type, ...(diagnosis.observed_symptoms || [])].filter(Boolean).join(' ');
  return searchCatalog(query, 5).filter((match) => match.score >= 3).map(({ product, score }) => ({ ...product, matchScore: score }));
}
