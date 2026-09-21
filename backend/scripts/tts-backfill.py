#!/usr/bin/env python3
"""Backfill missing per-word TTS audio via edge-tts.

Walks backend/content/<locale>/packs/*.json, and for every word missing
backend/content/<locale>/audio/<word>.mp3 generates it with edge-tts.
Existing files are skipped. Run from the backend dir:

    pip install edge-tts
    python3 scripts/tts-backfill.py [--content content] [--force]

Voice per locale (override with VOICE_<LOCALE>, e.g. VOICE_EN=...).
"""
import json
import os
import subprocess
import sys
from pathlib import Path

VOICES = {
    "en": os.environ.get("VOICE_EN", "en-US-AvaNeural"),
    "de": os.environ.get("VOICE_DE", "de-DE-AmalaNeural"),
    "es": os.environ.get("VOICE_ES", "es-ES-ElviraNeural"),
}
DEFAULT_VOICE = os.environ.get("VOICE_DEFAULT", "en-US-AvaNeural")


def main() -> int:
    args = sys.argv[1:]
    force = "--force" in args
    content = Path(args[args.index("--content") + 1] if "--content" in args else "content")
    packs = sorted(content.glob("*/packs/*.json"))
    if not packs:
        print(f"no packs found under {content}")
        return 1
    made = skipped = failed = 0
    for pack in packs:
        locale = pack.parent.parent.name
        voice = VOICES.get(locale, DEFAULT_VOICE)
        words = [e["word"].lower() for e in json.loads(pack.read_text(encoding="utf8"))]
        audio_dir = content / locale / "audio"
        audio_dir.mkdir(parents=True, exist_ok=True)
        for w in words:
            target = audio_dir / f"{w}.mp3"
            if target.exists() and not force:
                skipped += 1
                continue
            r = subprocess.run(
                ["edge-tts", "--voice", voice, "--text", w, "--write-media", str(target)],
                capture_output=True, text=True,
            )
            if r.returncode == 0 and target.exists():
                made += 1
            else:
                failed += 1
                print(f"FAIL {locale}/{w}: {r.stderr.strip()[-200:]}")
    print(f"done: generated={made} skipped={skipped} failed={failed}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
