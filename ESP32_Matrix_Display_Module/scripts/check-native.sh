#!/usr/bin/env bash
# Native firmware-policy tests: no Arduino installation, board, or credentials.
set -euo pipefail

matrix_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
matrix_module_dir="$(cd -- "$matrix_script_dir/.." && pwd)"
matrix_build_dir="$(mktemp -d "${TMPDIR:-/tmp}/matrix-native.XXXXXX")"
matrix_cxx="${CXX:-c++}"
matrix_flags=(-std=c++17 -O1 -g -Wall -Wextra -fno-omit-frame-pointer -fsanitize=address,undefined)

cleanup() {
  rm -f -- "$matrix_build_dir/router-policy" "$matrix_build_dir/http-parser" \
    "$matrix_build_dir/serial-revision" "$matrix_build_dir/modes"
  # Apple clang emits companion debug bundles next to these temporary binaries.
  rm -rf -- "$matrix_build_dir/router-policy.dSYM" "$matrix_build_dir/http-parser.dSYM" \
    "$matrix_build_dir/serial-revision.dSYM" "$matrix_build_dir/modes.dSYM"
  rmdir -- "$matrix_build_dir"
}
trap cleanup EXIT
cd -- "$matrix_module_dir"

"$matrix_cxx" "${matrix_flags[@]}" tests/router_connection_policy.test.cpp -o "$matrix_build_dir/router-policy"
"$matrix_build_dir/router-policy"

"$matrix_cxx" "${matrix_flags[@]}" tests/wifi_request_parser.test.cpp -o "$matrix_build_dir/http-parser"
"$matrix_build_dir/http-parser"

"$matrix_cxx" "${matrix_flags[@]}" -Itests/receiver-stubs -I. \
  tests/receiver_revision.test.cpp SerialFrameReceiver.cpp MatrixFont.cpp \
  -o "$matrix_build_dir/serial-revision"
"$matrix_build_dir/serial-revision"

"$matrix_cxx" "${matrix_flags[@]}" -Itests/native/stubs -I. \
  tests/native/modes_test.cpp ModeEngine.cpp MatrixFont.cpp MatrixEffects.cpp \
  -o "$matrix_build_dir/modes"
"$matrix_build_dir/modes"

printf 'All four native C++ sanitizer suites passed.\n'
