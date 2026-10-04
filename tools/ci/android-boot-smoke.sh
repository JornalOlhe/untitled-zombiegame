#!/usr/bin/env bash
# Real boot gate for the release APK, run inside the Android emulator job.
#   tools/ci/android-boot-smoke.sh <apk> <expected-version> <screenshot.png>
set -euo pipefail

APK="$1"
VERSION="$2"
SHOT="$3"
MARKER="android-boot-ok.txt"

note() {
  printf '%s' "$1" | tr '\n' '|' | cut -c1-3500 | sed 's/^/::error title=Android boot gate::/'
  echo
}
progress() { echo "::notice title=Android boot gate::$1"; }
dump_failure_context() {
  echo "::group::Android boot diagnostics"
  timeout 8 adb shell dumpsys activity exit-info com.deadrecoil.game 2>/dev/null | tail -120 || true
  timeout 8 adb shell dumpsys meminfo com.deadrecoil.game 2>/dev/null | tail -120 || true
  timeout 8 adb logcat -d 2>/dev/null | grep -iE 'DeadRecoil|AndroidRuntime|chromium|webview|cr_|lowmemory|lmkd|am_crash|am_kill|render|FATAL EXCEPTION|Fatal signal' | tail -260 || true
  echo "::endgroup::"
}
trap 'rc=$?; [ $rc -ne 0 ] && note "failed at line $LINENO (exit $rc): $BASH_COMMAND"' EXIT

rm -f "$MARKER"
timeout 300 adb wait-for-device
booted=0
for i in $(seq 1 90); do
  if [ "$(timeout 5 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
    booted=1
    break
  fi
  sleep 2
done
[ "$booted" = 1 ] || { note "emulator never completed Android boot"; exit 85; }
progress "emulator booted"

timeout 15 adb shell input keyevent 82 || true
timeout 15 adb logcat -c || true
out=$(timeout 180 adb install -r "$APK" 2>&1) || { note "adb install failed: $out"; exit 1; }
timeout 10 adb shell am force-stop com.deadrecoil.game || true
start=$(timeout 45 adb shell am start -W -n com.deadrecoil.game/.MainActivity 2>&1 || true)
echo "$start"
grep -q "Status: ok" <<<"$start" || progress "am start did not report Status: ok; READY signal is still authoritative"

ok=0
lost=0
missing_pid=0
# Poll for ~3 minutes. A dead emulator fails fast instead of turning every logcat into a
# 20-second wait that consumes the whole Actions timeout.
for i in $(seq 1 75); do
  state=$(timeout 4 adb get-state 2>/dev/null || true)
  if [ "$state" != "device" ]; then
    lost=$((lost + 1))
    progress "ADB unavailable (${lost}/3) while waiting for READY"
    if [ "$lost" -ge 3 ]; then
      note "emulator disconnected after app launch; retry with a fresh emulator instance"
      exit 86
    fi
    sleep 2
    continue
  fi
  lost=0

  dr=$(timeout 6 adb logcat -d -s DeadRecoil:V '*:S' 2>/dev/null || true)
  all=$(timeout 6 adb logcat -d -s AndroidRuntime:E '*:S' 2>/dev/null || true)

  if grep -q "DEAD_RECOIL_READY $VERSION" <<<"$dr"; then
    ok=1
    progress "READY after ${i} polls"
    # Write the gate marker immediately. Screenshot/teardown are diagnostics only and must not
    # turn a valid app boot into a false negative.
    echo "DEAD_RECOIL_READY $VERSION" > "$MARKER"
    break
  fi

  if grep -q "Process: com.deadrecoil.game" <<<"$all"; then
    timeout 8 adb logcat -d | tail -300 || true
    note "crash: $(timeout 8 adb logcat -d | grep -A25 'FATAL EXCEPTION' | head -40 || true)"
    exit 1
  fi

  pid=$(timeout 4 adb shell pidof com.deadrecoil.game 2>/dev/null || true)
  if [ "$i" -gt 8 ] && [ -z "$pid" ]; then
    missing_pid=$((missing_pid + 1))
    progress "game pid unavailable (${missing_pid}/3) while waiting for READY"
    if [ "$missing_pid" -ge 3 ]; then
      dump_failure_context
      note "game process exited before DEAD_RECOIL_READY $VERSION"
      exit 87
    fi
  else
    missing_pid=0
  fi
  sleep 2
done

if [ "$ok" != 1 ]; then
  echo "Game never emitted DEAD_RECOIL_READY $VERSION."
  timeout 5 adb shell pidof com.deadrecoil.game || true
  dump_failure_context
  timeout 8 adb logcat -d | tail -400 || true
  note "no READY. DeadRecoil log: $(timeout 8 adb logcat -d -s DeadRecoil:V '*:S' | tail -20 || true)"
  note "chromium/webview: $(timeout 8 adb logcat -d | grep -iE 'chromium|console|webview|cr_' | tail -25 || true)"
  exit 1
fi

timeout 5 adb shell pidof com.deadrecoil.game || true
timeout 12 adb exec-out screencap -p > "$SHOT" || rm -f "$SHOT"
progress "passed: DEAD_RECOIL_READY $VERSION"
echo "Android boot gate passed: DEAD_RECOIL_READY $VERSION"
