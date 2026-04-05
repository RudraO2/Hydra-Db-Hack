#!/usr/bin/env python3
"""
Local TTS server using edge-tts (Microsoft Edge neural voices).
Works on Python 3.13+, fully free, no model download needed.
Requires an internet connection for the first synthesis per session.

Install:
  pip install flask edge-tts

Run:
  python tts_server.py

Listens on http://127.0.0.1:5123
"""

import asyncio
import io
import re
import sys

import edge_tts
from flask import Flask, Response, request

app = Flask(__name__)

# Neural voices matched to NPC gender + character feel.
# Indian-English voices (en-IN) add authenticity since all NPCs have Indian names.
NPC_VOICES: dict[str, str] = {
    "kabir":   "en-IN-PrabhatNeural",    # CEO — authoritative Indian male
    "dev":     "en-US-ChristopherNeural", # IT guy — dry, measured male
    "rohan":   "en-US-GuyNeural",         # Intern — casual young male
    "priya":   "en-IN-NeerjaNeural",      # HR — warm Indian female
    "meera":   "en-US-AriaNeural",        # Accountant — composed female
    "sanjana": "en-US-SaraNeural",        # EA — polished female
}


def _preprocess(text: str) -> str:
    """Strip LLM artefacts so edge-tts gets clean, speakable text.

    edge-tts accepts plain text only (no SSML via this API).
    Natural punctuation is kept — commas/periods drive pacing.
    """
    # Remove stage directions: [Kabir straightens his collar]
    text = re.sub(r"\[.*?\]", "", text)
    # Strip asterisk emphasis: *very* → very
    text = re.sub(r"\*+([^*]*)\*+", r"\1", text)
    # Strip leftover markdown symbols
    text = re.sub(r"[_`#]", "", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


async def _synthesise(text: str, voice: str) -> bytes:
    buf = io.BytesIO()
    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            buf.write(chunk["data"])
    return buf.getvalue()


@app.route("/health")
def health():
    return {"status": "ok"}


@app.route("/speak", methods=["POST"])
def speak():
    body = request.get_json(force=True) or {}
    raw_text: str = body.get("text", "")
    npc_id: str = body.get("npcId", "")
    voice: str = NPC_VOICES.get(npc_id, body.get("voice", "en-US-GuyNeural"))

    text = _preprocess(raw_text)
    if not text:
        return {"error": "empty text after preprocessing"}, 400

    audio_bytes = asyncio.run(_synthesise(text, voice))
    # edge-tts returns MP3
    return Response(audio_bytes, mimetype="audio/mpeg")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5123
    print(f"TTS server → http://127.0.0.1:{port}", flush=True)
    # threaded=True so multiple quick requests don't queue up
    app.run(host="127.0.0.1", port=port, debug=False, threaded=True)
