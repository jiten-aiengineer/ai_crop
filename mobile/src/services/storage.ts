// Secure token storage using expo-secure-store (or AsyncStorage fallback)
import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'clsl_session_token';
const USER_KEY = 'clsl_user_data';

export type StoredUser = {
  id: string;
  first_name: string;
  last_name?: string;
  mobile_number: string;
  role: 'farmer' | 'dealer' | 'general_user' | 'sales_officer';
  preferred_language: string;
  dealer_code?: string;
  dealer_name?: string;
  district?: string;
  state?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
};

const memoryStorage = new Map<string, string>();

async function safeSetItem(key: string, value: string): Promise<void> {
  try { await AsyncStorage.setItem(key, value); }
  catch (e) { memoryStorage.set(key, value); }
}

async function safeGetItem(key: string): Promise<string | null> {
  try {
    const val = await AsyncStorage.getItem(key);
    if (val !== null) return val;
  } catch (e) {}
  return memoryStorage.get(key) || null;
}

async function safeRemoveItem(key: string): Promise<void> {
  try { await AsyncStorage.removeItem(key); }
  catch (e) {}
  memoryStorage.delete(key);
}

export async function saveSession(token: string, user: StoredUser): Promise<void> {
  await safeSetItem(SESSION_KEY, token);
  await safeSetItem(USER_KEY, JSON.stringify(user));
}

export async function getSessionToken(): Promise<string | null> {
  return safeGetItem(SESSION_KEY);
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const raw = await safeGetItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await safeRemoveItem(SESSION_KEY);
  await safeRemoveItem(USER_KEY);
}

export async function isLoggedIn(): Promise<boolean> {
  const token = await getSessionToken();
  return token !== null;
}
