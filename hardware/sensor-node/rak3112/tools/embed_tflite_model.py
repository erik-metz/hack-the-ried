#!/usr/bin/env python3
"""Generate an aligned C++ byte array from a checked-in TFLite model."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    data = args.model.read_bytes()
    if not data.startswith(b"TFL3") and data[4:8] != b"TFL3":
        raise SystemExit("input does not look like a TFLite FlatBuffer")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="ascii") as output:
        output.write('#include "model_data.h"\n\n')
        output.write("alignas(16) const unsigned char g_audio_model[] = {\n")
        for offset in range(0, len(data), 16):
            chunk = data[offset : offset + 16]
            output.write("  " + ", ".join(f"0x{byte:02x}" for byte in chunk) + ",\n")
        output.write("};\n")
        output.write("const unsigned int g_audio_model_len = sizeof(g_audio_model);\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
