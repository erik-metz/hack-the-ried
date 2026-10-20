#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 vN <device-profile-id> [--port <serial-port>]" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
version="$1"
device_id="$2"
shift 2
port=""
if [[ $# -gt 0 ]]; then
  [[ $# -eq 2 && "$1" == "--port" && -n "$2" ]] || usage
  port="$2"
fi
[[ "$version" =~ ^v[1-9][0-9]*$ ]] || usage
[[ "$device_id" =~ ^[a-z0-9]([a-z0-9_-]{0,58}[a-z0-9])?$ ]] || usage

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$script_dir/$version"
secrets_dir="${RAK3112_SECRETS_DIR:-$script_dir/profiles}"
mkdir -p "$secrets_dir"
chmod 700 "$secrets_dir"
profile="$secrets_dir/$device_id.h"
[[ -f "$source_dir/$version.ino" ]] || { echo "Unknown firmware folder: $version" >&2; exit 2; }
[[ -f "$profile" ]] || {
  echo "Missing per-device credentials: $profile" >&2
  echo "Copy device-profile.example.h there and fill in this TTN device's keys." >&2
  exit 1
}

fqbn='esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi'
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/rak3112-build.XXXXXX")"
trap 'rm -rf "$tmp_root"' EXIT
build_dir="$tmp_root/$version"
compile_dir="$tmp_root/compile"
mkdir -p "$build_dir"
mkdir -p "$compile_dir"
cp "$source_dir/$version.ino" "$build_dir/"
if [[ -f "$source_dir/board.yaml" ]]; then cp "$source_dir/board.yaml" "$build_dir/"; fi
for source_file in "$source_dir"/*.c "$source_dir"/*.h; do
  [[ -f "$source_file" ]] || continue
  cp "$source_file" "$build_dir/"
done
if [[ "$version" == "v12" ]]; then
  python3 "$script_dir/tools/embed_tflite_model.py" \
    "$source_dir/acdnet20_esc50_fold4_int8.tflite" "$build_dir/model_data.cc"
fi
for source_file in "$source_dir"/*.cc; do
  [[ -f "$source_file" ]] || continue
  cp "$source_file" "$build_dir/"
done
chmod 600 "$profile"
install -m 600 "$profile" "$build_dir/secrets.h"

printf 'Building firmware %s for TTN device %s\n' "$version" "$device_id"
library_args=()
repo_libraries_dir="$(cd -- "$script_dir/../../libraries" && pwd)"
if [[ -d "$repo_libraries_dir" ]]; then
  library_args+=(--libraries "$repo_libraries_dir")
fi
if [[ -n "${RAK3112_ARDUINO_LIBRARIES_DIR:-}" ]]; then
  library_args+=(--libraries "$RAK3112_ARDUINO_LIBRARIES_DIR")
fi
arduino-cli compile "${library_args[@]}" --fqbn "$fqbn" --build-path "$compile_dir" "$build_dir"
if [[ -n "$port" ]]; then
  printf 'Uploading firmware %s for TTN device %s on %s\n' "$version" "$device_id" "$port"
  arduino-cli upload -p "$port" --fqbn "$fqbn" --input-dir "$compile_dir" "$build_dir"
fi
