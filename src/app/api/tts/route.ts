import { NextRequest, NextResponse } from 'next/server';

// Voice mapping per NPC. Orpheus only accepts these six voices:
// autumn, diana, hannah (female) and austin, daniel, troy (male).
// The previous mapping used names the API rejects, so every line failed silently.
const NPC_VOICE: Record<string, string> = {
  kabir: 'troy',      // Deep, authoritative male
  priya: 'autumn',    // Warm, upbeat female
  dev: 'daniel',      // Neutral, slightly nerdy male
  meera: 'diana',     // Sharp, cool female
  sanjana: 'hannah',  // Composed, professional female
  rohan: 'austin',    // Energetic, young male
};
const DEFAULT_VOICE = 'autumn';

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
