#!/usr/bin/env python3
"""Generate the survivor's combat voice lines with ElevenLabs.

Reads every line from VoiceLines.LINES in index.html and writes
android/app/src/main/assets/audio/vo/<id>.mp3 (skips files that already exist).

Usage (run on your own machine, the key never goes into the repo):
    export ELEVENLABS_API_KEY=...            # your key from elevenlabs.io → Profile → API keys
    python3 tools/gen_voice_lines.py          # all missing lines
    python3 tools/gen_voice_lines.py --force  # regenerate everything

Voice: "Felipe Leão – Deep, Energetic, Powerful" (pt-BR). Change VOICE_ID to try another.
"""
import json, os, re, sys, urllib.request, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
HTML = ROOT / "android/app/src/main/assets/index.html"
OUT = ROOT / "android/app/src/main/assets/audio/vo"
VOICE_ID = os.environ.get("VO_VOICE_ID", "ZgmYvdcrNoefQ4HErYZN")
MODEL = os.environ.get("VO_MODEL", "eleven_multilingual_v2")
# delivery hint per category (only used by models that understand audio tags)
STYLE = {"idle": "determined", "wave": "shouting", "clear": "relieved", "reload": "urgent", "empty": "frustrated",
         "streak": "excited", "headshot": "satisfied", "hurt": "in pain", "boss": "alarmed", "bossdown": "triumphant",
         "grenade": "yelling", "door": "quiet"}


def lines():
    src = HTML.read_text(encoding="utf-8")
    block = src[src.index("const VoiceLines = {"):src.index("PRIO:", src.index("const VoiceLines = {"))]
    out = []
    for cat, body in re.findall(r"(\w+): \[(\[\".*?\"\])\],", block):
        for vid, text in re.findall(r'\["([a-z_]+)", "((?:[^"\\]|\\.)*)"\]', body):
            out.append((cat, vid, text))
    return out


def main():
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit("Set ELEVENLABS_API_KEY first.")
    OUT.mkdir(parents=True, exist_ok=True)
    force = "--force" in sys.argv
    todo = lines()
    for cat, vid, text in todo:
        dst = OUT / f"{vid}.mp3"
        if dst.exists() and not force:
            continue
        body = json.dumps({"text": text, "model_id": MODEL,
                           "voice_settings": {"stability": 0.35, "similarity_boost": 0.8, "style": 0.6, "use_speaker_boost": True}}).encode()
        req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}?output_format=mp3_44100_128",
                                     data=body, headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"})
        with urllib.request.urlopen(req) as r:
            dst.write_bytes(r.read())
        print(f"ok  {vid:24s} {text}")
    have = sorted(p.stem for p in OUT.glob("*.mp3"))
    (OUT / "manifest.json").write_text(json.dumps(have, indent=0), encoding="utf-8")
    print(f"{len(todo)} lines, {len(have)} recorded, manifest updated in {OUT}")


if __name__ == "__main__":
    if "--list" in sys.argv:
        for l in lines():
            print(*l, sep="\t")
    else:
        main()
