export const CROP_CATEGORIES: Record<string, string[]> = {
  'Vegetables': ['Tomato', 'Potato', 'Onion', 'Brinjal', 'Eggplant', 'Chilli', 'Capsicum', 'Okra', 'Bhindi', 'Lady Finger', 'Cauliflower', 'Cabbage', 'Spinach', 'Peas', 'Beans', 'Cucumber', 'Bitter Gourd', 'Bottle Gourd', 'Pumpkin', 'Watermelon'],
  'Fruits': ['Mango', 'Banana', 'Grapes', 'Pomegranate', 'Guava', 'Papaya', 'Apple', 'Orange', 'Lemon', 'Coconut'],
  'Cash Crops': ['Cotton', 'Sugarcane', 'Jute', 'Tobacco', 'Rubber', 'Arecanut', 'Cashew', 'Tea', 'Coffee'],
  'Cereals & Pulses': ['Wheat', 'Rice', 'Paddy', 'Maize', 'Corn', 'Bajra', 'Jowar', 'Sorghum', 'Ragi', 'Barley', 'Chickpea', 'Pigeon Pea', 'Moong', 'Urad', 'Lentil', 'Arhar', 'Bengal Gram'],
  'Oilseeds & Spices': ['Soybean', 'Groundnut', 'Mustard', 'Sunflower', 'Sesame', 'Linseed', 'Castor', 'Turmeric', 'Ginger', 'Garlic', 'Coriander', 'Cumin', 'Cardamom', 'Black Pepper', 'Clove'],
  'Flowers': ['Rose', 'Jasmine', 'Marigold', 'Chrysanthemum', 'Orchid']
};

export const ALIAS_GROUPS: Record<string, string[]> = {
  'Rice / Paddy': ['paddy', 'rice', 'rice (nursery)', 'rice/paddy', 'rice (paddy)', 'paddy (transplanted and direct seeded)'],
  'Okra / Bhindi / Lady Finger': ['okra', 'bhindi', 'okra (bhindi)', 'bhendi', 'lady finger'],
  'Maize / Corn': ['maize', 'corn', 'maize (corn)'],
  'Soybean': ['soybean', 'soyabean', 'saybean'],
  'Groundnut / Peanut': ['groundnut', 'ground nut', 'peanut'],
  'Black Gram / Urad': ['black gram', 'blackgram', 'urad'],
  'Pigeon Pea / Arhar': ['pigeon pea', 'arhar', 'red gram'],
  'Chickpea / Bengal Gram': ['chickpea', 'bengal gram'],
  'Chilli': ['chilli', 'chili'],
  'Grapes': ['grapes', 'grape'],
  'Brinjal / Eggplant': ['brinjal', 'eggplant'],
  'Black Pepper': ['black pepper', 'black paper'],
  'Cardamom': ['cardamom', 'cardomom'],
  'Mulberry': ['mulbery', 'mulberry'],
  'Apple': ['apple', 'and apples'],
  'Rose': ['rose', 'roses']
};

export const NON_CROPS = new Set([
  'aquatic weeds', 'bunds and fallow land', 'non crop area', 'non-crop areas', 'pulses', 'cucurbits'
]);

export function getCropCategory(crop: string): string {
  const parts = crop.split('/').map(p => p.trim().toLowerCase());
  for (const [cat, items] of Object.entries(CROP_CATEGORIES)) {
    const lowerItems = items.map(i => i.toLowerCase());
    if (parts.some(p => lowerItems.includes(p))) return cat;
  }
  return 'Other';
}

export function transformCropList(rawCrops: string[]): string[] {
  const result = new Set<string>();
  rawCrops.forEach((raw: string) => {
    let lower = raw.toLowerCase().trim();
    if (lower.startsWith('and ')) lower = lower.replace(/^and\s+/, '');
    if (NON_CROPS.has(lower)) return;
    
    let matchedGroup: string | null = null;
    for (const [groupName, aliases] of Object.entries(ALIAS_GROUPS)) {
      if (aliases.includes(lower)) {
        matchedGroup = groupName;
        break;
      }
    }
    
    if (matchedGroup) {
      result.add(matchedGroup);
    } else {
      const titleCased = raw.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
      result.add(titleCased);
    }
  });
  
  return Array.from(result);
}
