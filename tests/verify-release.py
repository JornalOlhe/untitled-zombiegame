"""Reject a stale APK, altered asset payload or incompatible signing key before release."""
import hashlib,json,os,re,subprocess,zipfile
from pathlib import Path
m=json.loads(Path('release/manifest.json').read_text())
apk=Path('release/DeadRecoil.apk')
assert hashlib.sha256(apk.read_bytes()).hexdigest()==m['sha256'], 'APK digest mismatch'
sdk=Path(os.environ.get('ANDROID_HOME',os.environ.get('ANDROID_SDK_ROOT','android-sdk')))
bt=sdk/'build-tools/35.0.0'
cert=subprocess.check_output([str(bt/'apksigner'),'verify','--print-certs',str(apk)],text=True)
assert f"certificate SHA-256 digest: {m['certificate_sha256']}" in cert, 'Signing certificate mismatch'
badging=subprocess.check_output([str(bt/'aapt2'),'dump','badging',str(apk)],text=True)
assert "name='com.deadrecoil.game'" in badging
assert f"versionCode='{m['version_code']}'" in badging
assert f"versionName='{m['version_name']}'" in badging
source=Path('android/app/build.gradle').read_text()
assert re.search(r'versionCode\s+'+str(m['version_code'])+r'\b',source)
assert f"versionName '{m['version_name']}'" in source
with zipfile.ZipFile(apk) as z:
    for file in Path('android/app/src/main/assets').rglob('*'):
        if file.is_file():
            name='assets/'+file.relative_to('android/app/src/main/assets').as_posix()
            assert z.read(name)==file.read_bytes(),f'Stale packaged asset: {name}'
print('PASS: APK signature, package identity, version, SHA-256 and all game assets')
