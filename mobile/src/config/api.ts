// API configuration for the CLSL AI mobile app
// Points to the live cloud server for all API calls

const PRODUCTION_API_BASE = 'https://ai.croplifescience.com';
const DEV_API_BASE = 'http://10.0.2.2:8000'; // Android emulator localhost

// Toggle this to switch between dev and production
const USE_PRODUCTION = true;

export const API_BASE = USE_PRODUCTION ? PRODUCTION_API_BASE : DEV_API_BASE;

// Auth API endpoints (proxied through Next.js on web, direct on mobile)
export const AUTH_API = `${API_BASE}/api/auth`;

// Main API endpoints
export const CATALOG_API = `${API_BASE}/api/catalogue`;
export const ASSISTANT_API = `${API_BASE}/api/chat`;
export const INSPECTION_API = `${API_BASE}/api/inspect`;
export const FIELD_API = `${API_BASE}/api/field`;

// Dealer API
export const DEALER_API = `${API_BASE}/api/v1/dealers`;

// App branding
export const APP_NAME = 'CLSL AI';
export const APP_TAGLINE = 'Crop Protection by Crop Life Science';
