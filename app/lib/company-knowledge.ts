import { catalog, catalogCrops } from './catalog';

/**
 * Reviewable company knowledge for the Company Support conversation.
 * Corporate details here are limited to the approved brief and official CLSL
 * documents listed in `sources`; changing records such as prices, financials
 * and dealer inventory deliberately remain outside this assistant.
 */
export const companyAssistantKnowledge = {
  assistant: 'Crop Life Mitra is the friendly Crop Life AI assistant for Crop Life Science Limited (CLSL).',
  companyProfile: {
    legalName: 'Crop Life Science Limited (CLSL)',
    incorporation: 'The company was incorporated on 24 May 2006 in Ahmedabad, Gujarat.',
    business: 'CLSL operates in agrochemicals and crop protection, including the manufacture and marketing of pesticide and allied agrochemical formulations.',
    offices: 'Official CLSL documents list an administrative office at 6th Floor, ABS Tower, Old Padra Road, Vadodara, Gujarat. Office addresses should be confirmed on the official CLSL website before a visit or correspondence.',
    manufacturing: 'Official CLSL documents identify its manufacturing operations in the GIDC Estate at Ankleshwar, Gujarat.',
    productScope: 'The supplied product catalogue covers crop-protection and crop-support categories including insecticides, fungicides, herbicides/weedicides, seed treatment, bio-stimulants, plant growth regulators and micronutrient products.',
  },
  sources: [
    'CLSL Final Prospectus dated 09 August 2023, published on croplifescience.com.',
    'CLSL Annual Report 2023–24, published on croplifescience.com.',
    'CLSL Udyam Registration Certificate, published on croplifescience.com.',
  ],
  cropLifeAi: [
    'Crop Life AI helps users capture or upload crop photos, receive a probable AI assessment, and discover relevant CLSL catalogue products.',
    'Product suggestions are controlled by the supplied CLSL catalogue and the supplied CIB&RC approved crop mapping.',
    'Users can search the catalogue, use practical farm tools, view weather-aware guidance, and contact an area sales representative after setting their location.',
  ],
  digitalServiceStrategy: [
    'Make crop support easier to access through photo-based inspection and simple conversations in farmer languages.',
    'Keep product discovery traceable to the CLSL catalogue and approved crop map instead of generating product claims.',
    'Connect a user with their local CLSL sales contact for next-step support when location information is available.',
    'Use inspection history and expert review in the future to improve the quality of the digital service; AI output remains a probable assessment, not a treatment authorization.',
  ],
  catalogue: {
    productCount: catalog.length,
    categories: Array.from(new Set(catalog.map((product) => product.category))).sort(),
    approvedCropCount: catalogCrops.length,
    mappingSource: 'CIB&RC approved crop map supplied by CLSL',
  },
  boundaries: [
    'Only state company profile facts that appear in this knowledge base. Do not infer current ownership, leadership, financial performance, share price, market capitalisation, employee count, exports, registrations, certifications or corporate commitments.',
    'Do not promise dealer stock, product price, delivery, or a retailer location. The sales directory can only connect a user with a CLSL representative.',
    'For a product, always confirm the approved label, crop registration, dose and local expert guidance before use.',
  ],
};
