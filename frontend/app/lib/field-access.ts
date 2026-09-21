export const FIELD_COOKIE = 'clsl_field_access';
export type FieldIdentity = {
  employee_code: string; full_name: string; office_email?: string; office_mobile?: string;
  designation?: string; department?: string; location?: string; state: string; territory: string;
  collection_mode: 'sales_officer'; minimum_images: number;
  daily_inspection_target_min: number; daily_inspection_target_max: number;
};

export async function resolveFieldToken(token: string): Promise<FieldIdentity> {
  const backend = (process.env.ADMIN_BACKEND_URL || '').replace(/\/$/, '');
  const internal = process.env.INTERNAL_SERVICE_TOKEN || process.env.INSPECTION_PERSISTENCE_TOKEN || '';
  if (!backend || !internal || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Open your personal field access link from the administrator.');
  const response = await fetch(`${backend}/api/v1/field/identity`, { headers: { 'X-Inspection-Persistence-Token': internal, 'X-CLSL-Field-Token': token }, cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw new Error('Your field access is unavailable or expired. Ask the administrator for a new link.');
  return response.json() as Promise<FieldIdentity>;
}

export async function fieldIdentityFor(request: Request) {
  const token = request.headers.get('cookie')?.match(/(?:^|;\s*)clsl_field_access=([^;]+)/)?.[1];
  return token ? resolveFieldToken(token) : null;
}
