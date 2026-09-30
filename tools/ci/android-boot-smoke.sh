#!/usr/bin/env bash
# Real boot gate for the release APK, run inside the Android emulator job.
# (Kept in a file: android-emulator-runner executes an inline `script:` one line at a time,
# which breaks multi-line loops and conditionals.)
#   tools/ci/android-boot-smoke.sh <apk> <expected-version> <screenshot.png>
set -euo pipefail
APK="$1"; VERSION="$2"; SHOT="$3"
adb wait-for-device
for i in $(seq 1 90); do [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ] && break; sleep 2; done
adb shell input keyevent 82 || true
adb logcat -c
adb install -r "$APK"
adb shell am force-stop com.deadrecoil.game
adb shell am start -W -n com.deadrecoil.game/.MainActivity
ok=0
for i in $(seq 1 60); do
  if adb logcat -d -s DeadRecoil:I DeadRecoil:E '*:S' | grep -q "DEAD_RECOIL_READY $VERSION"; then ok=1; break; fi
  if adb logcat -d | grep -qE "FATAL EXCEPTION.*com.deadrecoil.game|Process: com.deadrecoil.game.*FATAL"; then
    adb logcat -d | tail -300
    exit 1
  fi
  sleep 2
done
if [ "$ok" != 1 ]; then
  echo "Game never emitted DEAD_RECOIL_READY $VERSION."
  adb shell pidof com.deadrecoil.game || true
  adb logcat -d | tail -400
  exit 1
fi
adb shell pidof com.deadrecoil.game
adb exec-out screencap -p > "$SHOT"
echo "Android boot gate passed: DEAD_RECOIL_READY $VERSION"
