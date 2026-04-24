#!/usr/bin/env bash
set -euo pipefail

# Compile CLI binaries for all platforms.
# Requires: bun, a built dist/index.js
#
# Usage: package-release.sh [output-dir] [targets...]
# Defaults to all targets if none specified.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${1:-${ROOT_DIR}/release}"
shift 2>/dev/null || true

ALL_TARGETS=(linux-x64 linux-arm64 darwin-x64 darwin-arm64)
TARGETS=("${@:-${ALL_TARGETS[@]}}")
if [[ ${#TARGETS[@]} -eq 0 ]]; then
	TARGETS=("${ALL_TARGETS[@]}")
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

for target in "${TARGETS[@]}"; do
	echo "Compiling computer-${target}..."
	bun build "${ROOT_DIR}/dist/index.js" \
		--compile \
		--target="bun-${target}" \
		--outfile "${OUT_DIR}/computer-${target}"
done

# Ad-hoc sign macOS binaries when running on macOS
if [[ "$(uname -s)" == "Darwin" ]] && command -v codesign >/dev/null 2>&1; then
	for bin in "${OUT_DIR}"/computer-darwin-*; do
		[[ "${bin}" == *.sha256 ]] && continue
		codesign --sign - --force "${bin}"
	done
fi

for file in "${OUT_DIR}"/computer-*; do
	[[ "${file}" == *.sha256 ]] && continue
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "${file}" | awk '{print $1}' > "${file}.sha256"
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "${file}" | awk '{print $1}' > "${file}.sha256"
	else
		openssl dgst -sha256 "${file}" | awk '{print $2}' > "${file}.sha256"
	fi
done
