export type FactType = 'fact' | 'tip' | 'offer' | 'clsl';

export interface FarmingFact {
  id: string;
  type: FactType;
  title: string;
  text: string;
  actionText?: string;
  actionRoute?: string;
}

export const FARMING_FACTS: FarmingFact[] = [
  { id: '1', type: 'offer', title: 'Monsoon Special Offer!', text: 'Unlock exclusive coupons on fungicides this monsoon season. Tap to view your rewards.', actionText: 'View Coupons →', actionRoute: 'coupons' },
  { id: '2', type: 'fact', title: 'Did you know?', text: 'India is the worlds largest producer of milk, pulses, and jute, and ranks as the second largest producer of rice, wheat, sugarcane, groundnut, vegetables, fruit and cotton.' },
  { id: '3', type: 'clsl', title: 'CLSL Global Reach', text: 'Crop Life Science Limited exports high-value agrochemicals to over 15 countries including Brazil, Egypt, and Indonesia.' },
  { id: '4', type: 'tip', title: 'Tomato Growth Tip', text: 'Using a balanced bio-stimulant during the flowering stage of tomatoes can increase fruit set and yield by up to 20%.' },
  { id: '5', type: 'fact', title: 'Farming Community', text: 'Over 54% of Indias land is classified as arable, making it one of the largest agricultural hubs with over 140 million farmers.' },
  { id: '6', type: 'clsl', title: 'CLSL Product Tip', text: 'Use AMBUCROP on your Apple orchards during the humid season for unparalleled protection against fungal diseases.' },
  { id: '7', type: 'tip', title: 'Soil Health', text: 'Rotate your crops with legumes every 3-4 seasons to naturally fix atmospheric nitrogen into your soil.' },
  { id: '8', type: 'offer', title: 'New Dealer Deals', text: 'Are you purchasing from a registered CLSL dealer? Ask them for a referral code to get direct discount coupons in the app!', actionText: 'Check Rewards →', actionRoute: 'coupons' },
  { id: '9', type: 'fact', title: 'Export Powerhouse', text: 'Indias agricultural exports surpassed $50 Billion recently, driven by marine products, rice, and sugar.' },
  { id: '10', type: 'clsl', title: 'CLSL Commitment', text: 'CLSL operates a massive state-of-the-art manufacturing facility in Ankleshwar, Gujarat, ensuring top-tier quality control.' },
  { id: '11', type: 'tip', title: 'Water Management', text: 'Drip irrigation can save up to 40-70% of water compared to traditional flood irrigation, while boosting crop yield.' },
  { id: '12', type: 'fact', title: 'Mango Capital', text: 'India produces around 20 million tonnes of mangoes annually, accounting for roughly 50% of the global mango production!' },
  { id: '13', type: 'clsl', title: 'Product Tip: ADO-70', text: 'ADO-70 (Imidacloprid 70% WG) provides excellent systemic protection against sucking pests in cotton and cucumber.' },
  { id: '14', type: 'offer', title: 'Fertilizer Combo Offer', text: 'Claim your exclusive discount on Micro Fertilizer combinations for the current Rabi season.', actionText: 'Claim Offer →', actionRoute: 'coupons' },
  { id: '15', type: 'fact', title: 'Spice Hub of the World', text: 'India is the worlds largest producer, consumer, and exporter of spices, cultivating over 50 different varieties.' },
  { id: '16', type: 'tip', title: 'Weed Control', text: 'Apply pre-emergence weedicides within 48 hours of sowing to ensure maximum effectiveness before weeds sprout.' },
  { id: '17', type: 'clsl', title: 'A Legacy of Trust', text: 'Incorporated in 2006, Crop Life Science Ltd has spent nearly two decades empowering Indian agriculture with smarter solutions.' },
  { id: '18', type: 'fact', title: 'Organic Farming', text: 'India has the highest number of organic farmers in the world, with Sikkim being the first fully organic state.' },
  { id: '19', type: 'clsl', title: 'Product Showcase', text: 'Did you know CLSL offers over 70+ CIB&RC approved formulations tailored specifically for Indian soil?' },
  { id: '20', type: 'tip', title: 'Pest Management', text: 'Yellow sticky traps are a highly effective and low-cost way to monitor and control whiteflies and aphids in vegetable crops.' },
  { id: '21', type: 'fact', title: 'Wheat Production', text: 'India produces over 100 million metric tonnes of wheat every year, primarily driven by Punjab, Haryana, and UP.' },
  { id: '22', type: 'clsl', title: 'CLSL Plant Growth Regulators', text: 'Enhance your cotton yield by using CLSL Plant Growth Regulators during the square formation stage.' },
  { id: '23', type: 'offer', title: 'Exclusive Seed Treatment', text: 'Get special pricing on seed treatment chemicals to give your crops the perfect head start.', actionText: 'View Offers →', actionRoute: 'coupons' },
  { id: '24', type: 'tip', title: 'Harvesting Tip', text: 'Harvest your fruits in the early morning or late evening to preserve moisture and extend their shelf life.' },
  { id: '25', type: 'fact', title: 'Tea Production', text: 'India is the 2nd largest producer of tea globally, with Assam alone contributing to more than half of the country’s output.' },
  { id: '26', type: 'clsl', title: 'Ask Mitra Anything!', text: 'Not sure which CLSL product to use? Our Ask Mitra AI knows the exact catalog dosages and approved crops.', actionText: 'Ask Mitra →', actionRoute: 'assistant' },
  { id: '27', type: 'tip', title: 'Nutrient Deficiency', text: 'Yellowing of older leaves usually indicates a Nitrogen deficiency, while yellowing of new leaves points to Iron or Zinc deficiency.' },
  { id: '28', type: 'fact', title: 'Banana Giants', text: 'India is the largest producer of bananas in the world, cultivating them year-round across several southern and western states.' },
  { id: '29', type: 'clsl', title: 'CLSL ISO Certified', text: 'CLSL is proudly ISO 9001:2015 and ISO 14001:2004 certified, adhering to the highest global quality and environmental standards.' },
  { id: '30', type: 'tip', title: 'Fungicide Spraying', text: 'Always ensure your spray tank is thoroughly cleaned before mixing fungicides to prevent chemical reactions that reduce efficacy.' },
];
