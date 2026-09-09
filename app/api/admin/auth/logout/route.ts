import { logoutResponse } from '../../../../lib/admin-auth';

export const runtime = 'nodejs';
export function POST(request: Request) { return logoutResponse(request); }
