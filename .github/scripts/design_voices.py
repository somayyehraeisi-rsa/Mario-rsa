#!/usr/bin/env python3
"""Design and save one or more ElevenLabs voices for the game, driven by
env vars set from the elevenlabs-voices.yml workflow_dispatch inputs.

Uses only the standard library so the workflow needs no extra pip install.
"""
import base64
import json
import os
import sys
import urllib.error
import urllib.request

API_BASE = "https://api.elevenlabs.io/v1"


def call(path, payload):
    req = urllib.request.Request(
        API_BASE + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "xi-api-key": os.environ["ELEVENLABS_API_KEY"],
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        print(f"ElevenLabs API error {e.code} for {path}:\n{body}", file=sys.stderr)
        raise


def design_and_save(name, description, text, slug, out_dir):
    print(f"Designing previews for '{name}'...")
    previews = call("/text-to-voice/create-previews", {
        "voice_description": description,
        "text": text,
    })["previews"]
    if not previews:
        raise RuntimeError(f"No previews returned for '{name}'")
    preview = previews[0]

    preview_path = os.path.join(out_dir, f"{slug}-preview.mp3")
    with open(preview_path, "wb") as f:
        f.write(base64.b64decode(preview["audio_base_64"]))

    print(f"Saving '{name}' as a permanent voice...")
    saved = call("/text-to-voice/create-voice-from-preview", {
        "voice_name": name,
        "voice_description": description,
        "generated_voice_id": preview["generated_voice_id"],
    })

    return {
        "name": name,
        "description": description,
        "sample_text": text,
        "voice_id": saved.get("voice_id"),
        "preview_file": preview_path,
    }


def main():
    out_dir = "assets/voices"
    os.makedirs(out_dir, exist_ok=True)

    voices = [
        {
            "name": os.environ["VOICE1_NAME"],
            "description": os.environ["VOICE1_DESCRIPTION"],
            "text": os.environ["VOICE1_TEXT"],
            "slug": "mira-protagonist",
        },
        {
            "name": os.environ["VOICE2_NAME"],
            "description": os.environ["VOICE2_DESCRIPTION"],
            "text": os.environ["VOICE2_TEXT"],
            "slug": "hollow-narrator",
        },
    ]

    manifest = []
    for v in voices:
        entry = design_and_save(v["name"], v["description"], v["text"], v["slug"], out_dir)
        manifest.append(entry)
        print(f"  -> voice_id: {entry['voice_id']}")

    manifest_path = os.path.join(out_dir, "voices.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    print(f"Wrote {manifest_path}")


if __name__ == "__main__":
    main()
