#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path


def fail(message: str) -> None:
    print(json.dumps({"error": message}), file=sys.stderr)
    sys.exit(1)


if len(sys.argv) < 2:
    fail("usage: transcribe_audio.py <audio_path> [language_hint]")

input_path = Path(sys.argv[1])
language_hint = sys.argv[2].strip() if len(sys.argv) > 2 else ""
if not input_path.exists():
    fail(f"audio file not found: {input_path}")

try:
    from faster_whisper import WhisperModel
except Exception as exc:  # pragma: no cover - surfaced as runtime dependency error
    fail(f"faster-whisper import failed: {exc}")

model_name = os.environ.get("UUP_WHISPER_MODEL", "tiny")
compute_type = os.environ.get("UUP_WHISPER_COMPUTE_TYPE", "int8")
beam_size = int(os.environ.get("UUP_WHISPER_BEAM_SIZE", "1"))

audio_language = language_hint or None

try:
    model = WhisperModel(model_name, device="cpu", compute_type=compute_type)
    segments_iter, info = model.transcribe(
        str(input_path),
        beam_size=beam_size,
        language=audio_language,
        vad_filter=True,
    )
    segments = [
        {
            "start": float(seg.start),
            "duration": max(0.0, float(seg.end) - float(seg.start)),
            "text": seg.text.strip(),
        }
        for seg in segments_iter
        if seg.text and seg.text.strip()
    ]
except Exception as exc:
    fail(f"transcription failed: {exc}")

print(
    json.dumps(
        {
            "model": model_name,
            "language": getattr(info, "language", None) or "unknown",
            "language_probability": getattr(info, "language_probability", None),
            "duration": getattr(info, "duration", None),
            "segments": segments,
        }
    )
)
