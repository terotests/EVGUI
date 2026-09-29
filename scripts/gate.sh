#!/usr/bin/env bash
# ==============================================================================
# gate.sh — the demo suites, run against a Ranger checkout
# ==============================================================================
#
# These are the suites that left Ranger's run-gallery-editor-tests.sh and
# run-gallery-browser-tests.sh with the demos: each one compiles a demo (or the
# page) and checks what it draws. The last group opens a real browser.
#
#   bash scripts/gate.sh [--ranger <dir>] [--no-browser] [--prebuilt]
#
# The demos are compiled once (about two minutes) and every suite then reuses
# that build: EVGUI_PREBUILT tells scripts/run.mjs to skip the `npm run
# ui:demo:build` / `ui:build` each task starts with. --prebuilt skips the one
# build too, for a caller that has just run them (CI builds the pages first).
#
# Needs `npm run ui:conformance:install` in the Ranger checkout once, for
# esbuild, playwright-core and the Radix reference host.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"

ranger_args=()
browser=1
prebuilt=0
while [ $# -gt 0 ]; do
  case "$1" in
    --ranger) ranger_args=(--ranger "$(cd "$2" && pwd)"); shift 2 ;;
    --no-browser) browser=0; shift ;;
    --prebuilt) prebuilt=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

SUITES=(
  ui:sortable:motion
  ui:tree:checkbox
  ui:timeline:check
  ui:resize:check
  ui:calendar:demo
  ui:form:check
  ui:profile:check
  ui:dashboard:check
  ui:message:check
  ui:filters:demo
  ui:eventcal:demo
  ui:controls:demo
  ui:otp:demo
  ui:metadata:check
  ui:accordion:check
  ui:separator:check
  ui:tabs:check
  ui:autocomplete:check
  ui:pagination:check
  ui:radio:check
  ui:rating:check
  ui:kanban:check
  ui:drawer:check
  ui:combobox:demo
  ui:colorpicker:check
  ui:dialog:check
  ui:popover:check
  ui:menubar:check
  ui:semantics:check
  ui:input:bench
  ui:layout:check
  evg:flexgrow:check
  evg:pctflex:check
  evg:inspect:test
  # The dashboard behind the iOS host's window, on Node.
  ui:ios:verify
)
BROWSER_SUITES=(
  # The page itself: does it load, and does every demo draw?
  ui:demo:page
  # One frame, looked at as pixels: a surface effect must draw OVER the page.
  ui:demo:frame
  ui:demo:a11y
)
[ $browser -eq 1 ] && SUITES+=("${BROWSER_SUITES[@]}")

# Put this repository's sources in place and compile once; every suite then
# runs on that build.
if [ $prebuilt -eq 0 ]; then
  node "$HERE/run.mjs" "${ranger_args[@]}" ui:build ui:demo:build >/dev/null || exit 1
fi
export EVGUI_PREBUILT=ui:build,ui:demo:build

failed=()
for suite in "${SUITES[@]}"; do
  printf '==> %s\n' "$suite"
  out="$(node "$HERE/run.mjs" "${ranger_args[@]}" --no-overlay "$suite" 2>&1)"
  status=$?
  bad=""
  if [ $status -ne 0 ]; then
    bad="exit $status"
  elif grep -qE 'RESULT FAIL|FAILURES|\[FAIL\]' <<<"$out"; then
    bad="reported a failure"
  fi
  if [ -n "$bad" ]; then
    failed+=("$suite")
    printf '    %s FAILED (%s)\n' "$suite" "$bad"
    tail -n 25 <<<"$out" | sed 's/^/      /'
  else
    printf '    %s ok\n' "$suite"
  fi
done

echo
if [ ${#failed[@]} -ne 0 ]; then
  echo "FAILED suites:"
  for f in "${failed[@]}"; do echo "  - $f"; done
  exit 1
fi
echo "all ${#SUITES[@]} suites passed"
