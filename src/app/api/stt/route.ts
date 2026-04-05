import { NextRequest, NextResponse } from 'next/server';

const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MODEL = 'whisper-large-v3-turbo';

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
  }

  const form = await req.formData();
  const audio = form.get('audio') as File | null;
  if (!audio) {
    return NextResponse.json({ error: 'No audio file in request' }, { status: 400 });
  }

  const groqForm = new FormData();
  groqForm.append('file', audio);
  groqForm.append('model', MODEL);
  groqForm.append('response_format', 'json');

  let res: Response;
  try {
    res = await fetch(GROQ_STT_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: groqForm,
    });
  } catch {
    return NextResponse.json({ error: 'Groq unreachable' }, { status: 503 });
  }

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    return NextResponse.json(
      { error: payload?.error?.message ?? 'Groq STT error' },
      { status: res.status }
    );
  }

  const { text } = await res.json();
  return NextResponse.json({ text: text ?? '' });
}
