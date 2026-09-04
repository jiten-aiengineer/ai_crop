import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const maxDuration = 30;
const headers = {'Cache-Control':'no-store'};

async function authorized(request: Request) {
  const key = process.env.COMPARISON_ADMIN_TOKEN || '';
  if (key.length < 32) return false;
  const supplied = request.headers.get('authorization') || '';
  const encode = new TextEncoder();
  const [a,b] = await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(supplied)),crypto.subtle.digest('SHA-256',encode.encode(`Bearer ${key}`))]);
  return new Uint8Array(a).every((byte,index) => byte === new Uint8Array(b)[index]);
}

async function proxy(request: Request) {
  if (!await authorized(request)) return NextResponse.json({error:'Admin access is locked. Configure and enter the private administrator key.'},{status:401,headers});
  const base = process.env.COMPARISON_SERVICE_URL;
  const token = process.env.COMPARISON_SERVICE_TOKEN;
  if (!base || !token) return NextResponse.json({error:'The private comparison service is not configured. Vercel cannot connect to laptop localhost.'},{status:503,headers});
  const query = new URL(request.url).searchParams;
  const action = query.get('action') || 'list';
  let path = '/v1/comparisons';
  if (request.method === 'POST') path += '/lab';
  else if (action === 'health') path += '/health';
  else if (action === 'detail') {
    const id = query.get('id') || '';
    if (!/^[a-f0-9-]{36}$/.test(id)) return NextResponse.json({error:'Invalid comparison ID.'},{status:400,headers});
    path += `/${id}`;
  } else if (action !== 'list') return NextResponse.json({error:'Unknown action.'},{status:400,headers});
  let body: string | undefined;
  if (request.method === 'POST') {
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    if (reader) while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 6*1024*1024) { await reader.cancel(); return NextResponse.json({error:'Upload too large.'},{status:413,headers}); } chunks.push(next.value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    body = new TextDecoder().decode(bytes);
  }
  try {
    const response = await fetch(`${base.replace(/\/$/,'')}${path}`,{method:request.method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(12_000),cache:'no-store'});
    const data = await response.json();
    return NextResponse.json(data,{status:response.status,headers});
  } catch { return NextResponse.json({error:'Private comparison service is offline or timed out. Normal crop inspection is unaffected.'},{status:503,headers}); }
}
export const GET = proxy;
export const POST = proxy;
