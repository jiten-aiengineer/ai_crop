import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000';

export async function POST(req: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path.join('/');
  try {
    const body = await req.json();
    const token = req.headers.get('authorization') || '';
    
    const response = await fetch(`${BACKEND_URL}/api/v1/public/auth/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token,
        'x-forwarded-for': req.headers.get('x-forwarded-for') || req.ip || '127.0.0.1'
      },
      body: JSON.stringify(body)
    });

    const data = await response.text();
    return new NextResponse(data, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
