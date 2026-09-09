import { sessionResponse } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';
export function GET(request: Request) { return sessionResponse(request); }
