import { passwordLoginResponse } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  return await passwordLoginResponse(request, typeof body?.username === 'string' ? body.username : '', typeof body?.password === 'string' ? body.password : '');
}
