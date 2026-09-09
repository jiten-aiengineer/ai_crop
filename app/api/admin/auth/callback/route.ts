import { callbackResponse } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';
export async function GET(request: Request) { return callbackResponse(request); }
