#!/usr/bin/env bash
# Real boot gate for the release APK, run inside the Android emulator job.
# (Kept in a file: android-emulator-runner executes an inline `script:` one line at a time,
# which breaks multi-line loops and conditionals.)
#   tools/ci/android-boot-smoke.sh <apk> <expected-version> <screenshot.png>
set -euo pipefail
APK="$1"; VERSION="$2"; SHOT="$3"
# Failures surface as workflow annotations (readable without downloading the job log).
note() { printf '%s' "$1" | tr '\n' '|' | cut -c1-3500 | sed 's/^/::error title=Android boot gate::/'; echo; }
trap 'rc=$?; [ $rc -ne 0 ] && note "failed at line $LINENO (exit $rc): $BASH_COMMAND"' EXIT
timeout 300 adb wait-for-device
for i in $(seq 1 90); do [ "$(timeout 10 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 2; done
note_progress() { echo "::notice title=Android boot gate::$1"; }
note_progress "emulator booted"
timeout 20 adb shell input keyevent 82 || true
adb logcat -c
out=$(timeout 240 adb install -r "$APK" 2>&1) || { note "adb install failed: $out"; exit 1; }
adb shell am force-stop com.deadrecoil.game
timeout 60 adb shell am start -W -n com.deadrecoil.game/.MainActivity || note "am start -W did not return in 60 s (continuing)"
ok=0
for i in $(seq 1 90); do
  # capture first: with pipefail, `grep -q` closing the pipe early makes adb die of SIGPIPE and
  # the whole test read as false even when READY is in the log
  dr=$(timeout 20 adb logcat -d -s DeadRecoil:V '*:S' || true); all=$(timeout 20 adb logcat -d -s AndroidRuntime:E '*:S' || true)
  # (a tag listed twice — DeadRecoil:I DeadRecoil:E — keeps only the last level, which hid the
  # INFO READY line; :V shows every level)
  if grep -q "DEAD_RECOIL_READY $VERSION" <<<"$dr"; then ok=1; note_progress "READY after ${i} polls"; break; fi
  if grep -q "Process: com.deadrecoil.game" <<<"$all"; then
    adb logcat -d | tail -300
    note "crash: $(adb logcat -d | grep -A25 'FATAL EXCEPTION' | head -40)"
    exit 1
  fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "Game never emitted DEAD_RECOIL_READY $VERSION."
  adb shell pidof com.deadrecoil.game || true
  adb logcat -d | tail -400
  note "no READY. pid=$(adb shell pidof com.deadrecoil.game || echo none). DeadRecoil log: $(adb logcat -d -s DeadRecoil:V '*:S' | tail -20)"
  note "chromium/webview: $(adb logcat -d | grep -iE 'chromium|console|webview|cr_' | tail -25)"
  exit 1
fi
timeout 10 adb shell pidof com.deadrecoil.game || true
timeout 30 adb exec-out screencap -p > "$SHOT" || true
# marker checked by the next workflow step (the emulator teardown can hang after a pass)
echo "DEAD_RECOIL_READY $VERSION" > android-boot-ok.txt
note_progress "passed: DEAD_RECOIL_READY $VERSION"
echo "Android boot gate passed: DEAD_RECOIL_READY $VERSION"
