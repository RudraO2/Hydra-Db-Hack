import { NextRequest, NextResponse } from 'next/server';

// Voice mapping per NPC — Groq Orpheus voices
const NPC_VOICE: Record<string, string> = {
  kabir: 'leo',    // Deep, authoritative male
  priya: 'tara',   // Warm, upbeat female
  dev: 'dan',      // Neutral, slightly nerdy male
  meera: 'leah',   // Sharp, cool female
  sanjana: 'mia',  // Composed, professional female
  rohan: 'zac',    // Energetic, young male
};
const DEFAULT_VOICE = 'tara';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const text: string = typeof body?.text === 'string' ? body.text : '';
  const npcId: string = typeof body?.npcId === 'string' ? body.npcId.toLowerCase() : '';

  if (!text.trim()) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 503 });
  }

  const voice = NPC_VOICE[npcId] ?? DEFAULT_VOICE;

  let res: Response;
  try {
    res = await fetch('https://api.groq.com/openai/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'canopylabs/orpheus-v1-english',
        input: text,
        voice,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return NextResponse.json({ error: 'TTS request timed out' }, { status: 503 });
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[TTS] Groq error', res.status, errText);
    return NextResponse.json(
      { error: `Groq TTS ${res.status}: ${errText}` },
      { status: res.status }
    );
  }

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, {
    headers: { 'Content-Type': 'audio/mpeg' },
  });
}
