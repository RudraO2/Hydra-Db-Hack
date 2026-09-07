export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type SupportedLLMProvider = 'groq' | 'gemini' | 'auto';

function getServerEnv(name: string) {
  if (typeof window !== 'undefined') return undefined;
  return process.env[name];
}

export const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS ?? 12_000);

// Some Groq models (qwen) emit a <think> preamble in the content field.
// Strip it so the player never sees the model reasoning out loud.
function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
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

// gpt-oss is a reasoning model. reasoning_effort 'low' keeps the private thinking
// budget small, which is what makes it answer in ~500ms instead of ~1.5s. The
// separate `reasoning` field it returns is never shown to the player.
const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-20b';

async function callGroq(system: string, messages: Message[]): Promise<string> {
  const apiKey = getServerEnv('GROQ_API_KEY');
  const model = getServerEnv('GROQ_MODEL') || GROQ_DEFAULT_MODEL;

  if (!apiKey) throw new Error('GROQ_API_KEY is not configured.');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.85,
      max_completion_tokens: 400,
      reasoning_effort: 'low',
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
  if (typeof text !== 'string' || !stripReasoning(text)) {
    throw new Error('Groq returned no text content.');
  }

  return stripReasoning(text);
}

const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash';

async function callGemini(system: string, messages: Message[]): Promise<string> {
  const apiKey = getServerEnv('GEMINI_API_KEY');
  const model = getServerEnv('GEMINI_MODEL') || GEMINI_DEFAULT_MODEL;

  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey
      },
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: system }]
        },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        })),
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 400,
          // No visible thinking for in-character dialogue - it only adds latency.
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Gemini request failed: ${payload?.error?.message ?? response.statusText}`);
  }

  return stripReasoning(extractTextFromGemini(payload));
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

// ─── Streaming ───────────────────────────────────────────────────────────────
// Streaming is what makes conversation feel instant. Waiting for a complete
// reply means a blank "thinking" pane for the full round trip; streaming puts
// the first words on screen in a few hundred milliseconds.

async function* streamGroq(system: string, messages: Message[]): AsyncGenerator<string> {
  const apiKey = getServerEnv('GROQ_API_KEY');
  const model = getServerEnv('GROQ_MODEL') || GROQ_DEFAULT_MODEL;
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured.');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    body: JSON.stringify({
      model,
      temperature: 0.85,
      max_completion_tokens: 400,
      reasoning_effort: 'low',
      stream: true,
      messages: [{ role: 'system', content: system }, ...messages]
    })
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Groq stream failed: ${response.status} ${detail.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emittedAnything = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data);
        const delta = chunk?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) {
          emittedAnything = true;
          yield delta;
        }
      } catch {
        // Ignore partial or malformed SSE frames.
      }
    }
  }

  if (!emittedAnything) throw new Error('Groq stream produced no content.');
}

async function* streamGemini(system: string, messages: Message[]): AsyncGenerator<string> {
  const apiKey = getServerEnv('GEMINI_API_KEY');
  const model = getServerEnv('GEMINI_MODEL') || GEMINI_DEFAULT_MODEL;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: messages.map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }]
        })),
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 400,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    }
  );

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini stream failed: ${response.status} ${detail.slice(0, 200)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;

      try {
        const chunk = JSON.parse(data);
        const text = chunk?.candidates?.[0]?.content?.parts
          ?.map((part: any) => part?.text)
          .filter(Boolean)
          .join('');
        if (text) yield text;
      } catch {
        // Ignore partial frames.
      }
    }
  }
}

/**
 * Yields reply fragments as the model produces them. Falls back to the other
 * provider, and finally to a single non-streamed call, so a streaming failure
 * degrades to the old behaviour rather than breaking the conversation.
 */
export async function* streamLLM(system: string, messages: Message[]): AsyncGenerator<string> {
  if (typeof window !== 'undefined') {
    throw new Error('streamLLM must run on the server.');
  }

  const provider = resolveProvider();
  const order =
    provider === 'gemini' ? [streamGemini] : provider === 'groq' ? [streamGroq] : [streamGroq, streamGemini];

  for (let index = 0; index < order.length; index += 1) {
    const generator = order[index];
    try {
      let produced = false;
      for await (const piece of generator(system, messages)) {
        produced = true;
        yield piece;
      }
      if (produced) return;
    } catch {
      // Try the next provider.
    }
  }

  // Last resort: a normal blocking call, delivered as one chunk.
  yield await callLLM(system, messages);
}

// Track the active audio so a new line cancels the previous one.
let _activeSource: AudioBufferSourceNode | null = null;
let _activeCtx: AudioContext | null = null;

export async function speak(
  text: string,
  config: { npcId?: string; onPlayStart?: () => void } = {}
): Promise<void> {
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

  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    console.error('[TTS] failed:', msg);
    return;
  }

  const buffer = await res.arrayBuffer();
  const ctx = new AudioContext();
  _activeCtx = ctx;
  const decoded = await ctx.decodeAudioData(buffer);
  const source = ctx.createBufferSource();
  _activeSource = source;
  source.buffer = decoded;
  source.connect(ctx.destination);
  // Fire callback synchronously before audio starts so lip sync begins at the same frame.
  config.onPlayStart?.();
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
