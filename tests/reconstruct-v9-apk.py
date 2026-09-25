#!/usr/bin/env python3
import base64
import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
META = json.loads((ROOT / "release/v9-signing-metadata.json").read_text())
BLOCK = base64.b64decode((ROOT / "release/v9-signing-block.b64").read_text().strip())

if len(sys.argv) != 2:
    raise SystemExit("usage: reconstruct-v9-apk.py <unsigned.apk>")

unsigned_path = Path(sys.argv[1])
unsigned = unsigned_path.read_bytes()

def sha256(data):
    return hashlib.sha256(data).hexdigest()

if sha256(unsigned) != META["unsigned_sha256"]:
    raise SystemExit(
        "Unsigned APK does not match the exact v9 build used for signing. "
        f"Expected {META['unsigned_sha256']}, got {sha256(unsigned)}"
    )
if sha256(BLOCK) != META["signing_block_sha256"]:
    raise SystemExit("Signing block checksum mismatch")

eocd = unsigned.rfind(b"PK\x05\x06")
if eocd < 0:
    raise SystemExit("ZIP EOCD not found")
central_dir = struct.unpack_from("<I", unsigned, eocd + 16)[0]
if central_dir <= 0 or central_dir >= eocd:
    raise SystemExit("Invalid central-directory offset")

signed = bytearray(unsigned[:central_dir] + BLOCK + unsigned[central_dir:])
signed_eocd = eocd + len(BLOCK)
struct.pack_into("<I", signed, signed_eocd + 16, central_dir + len(BLOCK))

actual = sha256(signed)
if actual != META["signed_sha256"]:
    raise SystemExit(f"Signed APK checksum mismatch: {actual}")

out = ROOT / "release/DeadRecoil.apk"
out.write_bytes(signed)
print(f"Reconstructed {out} ({len(signed)} bytes) SHA-256 {actual}")
