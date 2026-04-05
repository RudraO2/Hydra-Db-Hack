import { NextRequest, NextResponse } from 'next/server';

const TTS_SERVER = 'http://127.0.0.1:5123';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  let res: Response;
  try {
    res = await fetch(`${TTS_SERVER}/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return NextResponse.json({ error: 'TTS server unreachable' }, { status: 503 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'TTS server error' }, { status: res.status });
  }

  const audio = await res.arrayBuffer();
  const contentType = res.headers.get('Content-Type') ?? 'audio/mpeg';
  return new NextResponse(audio, {
    headers: { 'Content-Type': contentType },
  });
}
