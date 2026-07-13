#!/bin/sh
set -eu

: "${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT is required}"

src="${CLAUDE_PLUGIN_ROOT}/scripts/statusline.mjs"
dest_dir="${HOME}/.claude/statusline-limits"
dest="${dest_dir}/statusline.mjs"

mkdir -p "${dest_dir}"
chmod 700 "${dest_dir}"

src_hash="$(shasum -a 256 "${src}" | cut -d ' ' -f 1)"
dest_hash=""
if [ -f "${dest}" ]; then
  dest_hash="$(shasum -a 256 "${dest}" | cut -d ' ' -f 1)"
fi

if [ "${src_hash}" = "${dest_hash}" ]; then
  exit 0
fi

tmp="${dest_dir}/.statusline.mjs.$$"
cp "${src}" "${tmp}"
chmod 600 "${tmp}"
mv "${tmp}" "${dest}"
