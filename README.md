# Untitled Zombie Game / Dead Recoil

Android wrapper for the current browser-based zombie FPS prototype.

## Automatic APK build

Every push to `main` runs `.github/workflows/build-android-apk.yml`.
When the workflow finishes, download the `DeadRecoil-APK` artifact from the run; it contains `DeadRecoil.apk`.

The Android app runs the game locally from `android/app/src/main/assets/` in a fullscreen landscape WebView.
