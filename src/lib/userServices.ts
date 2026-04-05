export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type SupportedLLMProvider = 'groq' | 'gemini' | 'auto';

function getServerEnv(name: string) {
  if (typeof window !== 'undefined') return undefined;
  return process.env[name];
}

function resolveProvider(): SupportedLLMProvider {
  const configured = (getServerEnv('LLM_PROVIDER') ?? 'auto').toLowerCase();
  if (configured === 'groq' || configured === 'gemini') return configured;
  return 'auto';
}

function extractTextFromGemini(payload: any): string {
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text)
    .filter(Boolean)
    .join('');

  if (!text) {
    throw new Error('Gemini returned no text content.');
  }

  return text.trim();
}

async function callGroq(system: string, messages: Message[]): Promise<string> {
  const apiKey = getServerEnv('GROQ_API_KEY');
  const model = getServerEnv('GROQ_MODEL');

  if (!apiKey) throw new Error('GROQ_API_KEY is not configured.');
  if (!model) throw new Error('GROQ_MODEL is not configured.');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_completion_tokens: 300,
      messages: [
        { role: 'system', content: system },
        ...messages
      ]
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Groq request failed: ${payload?.error?.message ?? response.statusText}`);
  }

  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('Groq returned no text content.');
  }

  return text.trim();
}

async function callGemini(system: string, messages: Message[]): Promise<string> {
  const apiKey = getServerEnv('GEMINI_API_KEY');
  const model = getServerEnv('GEMINI_MODEL');

  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');
  if (!model) throw new Error('GEMINI_MODEL is not configured.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: system }]
        },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        })),
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 300
        }
      })
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${payload?.error?.message ?? response.statusText}`);
  }

  return extractTextFromGemini(payload);
}

export async function callLLM(system: string, messages: Message[]): Promise<string> {
  if (typeof window !== 'undefined') {
    throw new Error('callLLM must run on the server.');
  }

  const provider = resolveProvider();

  if (provider === 'groq') {
    return callGroq(system, messages);
  }

  if (provider === 'gemini') {
    return callGemini(system, messages);
  }

  const errors: string[] = [];

  try {
    return await callGroq(system, messages);
  } catch (error) {
    errors.push((error as Error).message);
  }

  try {
    return await callGemini(system, messages);
  } catch (error) {
    errors.push((error as Error).message);
  }

  throw new Error(`No LLM provider succeeded. ${errors.join(' | ')}`);
}

// Track the active audio so a new line cancels the previous one.
let _activeSource: AudioBufferSourceNode | null = null;
let _activeCtx: AudioContext | null = null;

export async function speak(text: string, config: { npcId?: string } = {}): Promise<void> {
  // Cancel whatever is currently playing.
  try { _activeSource?.stop(); } catch { /* already stopped */ }
  try { await _activeCtx?.close(); } catch { /* already closed */ }
  _activeSource = null;
  _activeCtx = null;

  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, npcId: config.npcId }),
  });

  if (!res.ok) return; // TTS server not running — fail silently.

  const buffer = await res.arrayBuffer();
  const ctx = new AudioContext();
  _activeCtx = ctx;
  const decoded = await ctx.decodeAudioData(buffer);
  const source = ctx.createBufferSource();
  _activeSource = source;
  source.buffer = decoded;
  source.connect(ctx.destination);
  source.start();
}

export async function listen(): Promise<string> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  return new Promise<string>((resolve, reject) => {
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream);

    // Silence detection via Web Audio API.
    // Auto-stops 1.5 s after the last detected speech, max 8 s total.
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);

    const timeDomain = new Float32Array(analyser.frequencyBinCount);
    let speechDetected = false;
    let silenceStart = 0;

    const silenceCheck = setInterval(() => {
      analyser.getFloatTimeDomainData(timeDomain);
      const rms = Math.sqrt(
        timeDomain.reduce((sum, v) => sum + v * v, 0) / timeDomain.length
      );
      if (rms > 0.012) {
        speechDetected = true;
        silenceStart = Date.now();
      } else if (speechDetected && Date.now() - silenceStart > 1500) {
        recorder.stop();
      }
    }, 80);

    // Hard cap: 8 seconds
    const maxTimer = setTimeout(() => recorder.stop(), 8_000);

    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    recorder.onstop = async () => {
      clearInterval(silenceCheck);
      clearTimeout(maxTimer);
      stream.getTracks().forEach((t) => t.stop());
      void audioCtx.close();

      const mimeBase = recorder.mimeType.split(';')[0]; // e.g. "audio/webm"
      const ext = mimeBase.split('/')[1] ?? 'webm';     // e.g. "webm"
      const blob = new Blob(chunks, { type: mimeBase });

      const form = new FormData();
      form.append('audio', blob, `recording.${ext}`);

      try {
        const res = await fetch('/api/stt', { method: 'POST', body: form });
        if (!res.ok) { reject(new Error('STT request failed')); return; }
        const { text } = await res.json();
        resolve((text as string) ?? '');
      } catch (err) {
        reject(err);
      }
    };

    recorder.start();
  });
}
