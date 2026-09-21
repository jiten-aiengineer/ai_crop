import { NextResponse } from 'next/server';
import { approvedCatalogueProducts } from '../../../lib/database-catalog';

export const runtime = 'nodejs';

/**
 * Farmer-safe read model. It exposes only active + fully approved catalogue
 * records; the authenticated portal remains the only place to edit data.
 */
export async function GET() {
  const result = await approvedCatalogueProducts();
  if (result.source !== 'approved_postgresql_catalogue') {
    return NextResponse.json({ error: 'The approved product catalogue is temporarily unavailable.' }, {
      status: 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
  const dbCrops = result.products.flatMap((product) => product.approvedCrops || []);
  const additionalCrops = [
    'Wheat', 'Rice', 'Paddy', 'Maize', 'Corn', 'Bajra', 'Jowar', 'Sorghum', 'Ragi', 'Barley',
    'Cotton', 'Sugarcane', 'Jute', 'Soybean', 'Groundnut', 'Mustard', 'Sunflower', 'Sesame', 'Linseed', 'Castor',
    'Tomato', 'Potato', 'Onion', 'Brinjal', 'Eggplant', 'Chilli', 'Capsicum', 'Okra', 'Bhindi', 'Lady Finger',
    'Cauliflower', 'Cabbage', 'Spinach', 'Peas', 'Beans', 'Cucumber', 'Bitter Gourd', 'Bottle Gourd', 'Pumpkin', 'Watermelon',
    'Mango', 'Banana', 'Grapes', 'Pomegranate', 'Guava', 'Papaya', 'Apple', 'Orange', 'Lemon', 'Coconut',
    'Tea', 'Coffee', 'Turmeric', 'Ginger', 'Garlic', 'Coriander', 'Cumin', 'Cardamom', 'Black Pepper', 'Clove',
    'Chickpea', 'Pigeon Pea', 'Moong', 'Urad', 'Lentil', 'Arhar', 'Bengal Gram',
    'Rose', 'Jasmine', 'Marigold', 'Chrysanthemum', 'Orchid',
    'Tobacco', 'Rubber', 'Arecanut', 'Cashew',
  ];
  const crops = Array.from(new Set([...dbCrops, ...additionalCrops])).sort((a, b) => a.localeCompare(b));
  const categories = Array.from(new Set(result.products.map((product) => product.category))).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ items: result.products, crops, categories, source: result.source }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
