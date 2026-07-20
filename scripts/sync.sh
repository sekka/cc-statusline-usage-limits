#!/bin/sh
set -eu

: "${CLAUDE_PLUGIN_ROOT:?CLAUDE_PLUGIN_ROOT is required}"

dest_dir="${HOME}/.claude/statusline-limits"

mkdir -p "${dest_dir}"
chmod 700 "${dest_dir}"

deploy_file() {
  name="$1"
  src="${CLAUDE_PLUGIN_ROOT}/scripts/${name}"
  dest="${dest_dir}/${name}"

  if [ ! -f "${src}" ]; then
    echo "sync.sh: source not found: ${src}" >&2
    exit 1
  fi

  src_hash="$(shasum -a 256 "${src}" | cut -d ' ' -f 1)"
  dest_hash=""
  if [ -f "${dest}" ]; then
    dest_hash="$(shasum -a 256 "${dest}" | cut -d ' ' -f 1)"
  fi

  if [ "${src_hash}" = "${dest_hash}" ]; then
    return 0
  fi

  tmp="${dest_dir}/.${name}.$$"
  cp "${src}" "${tmp}"
  chmod 600 "${tmp}"
  mv "${tmp}" "${dest}"
}

deploy_file "statusline.mjs"
