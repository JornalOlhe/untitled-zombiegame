// Camera feel: strafing leans the view, third-person aim pulls the camera in over the shoulder,
// and the shoulder-swap key moves the camera to the other side.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, null, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = DeadRecoilTest, V = THREE.Vector3, out = {}, C = T.CameraRig;
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear();
    T.keys.add('KeyD'); T.stepPlayer(1 / 60, 40); out.rollRight = T.camera.rotation.z; T.keys.delete('KeyD');
    T.keys.add('KeyA'); T.stepPlayer(1 / 60, 60); out.rollLeft = T.camera.rotation.z; T.keys.delete('KeyA');
    T.stepPlayer(1 / 60, 80); out.rollRest = T.camera.rotation.z;
    C.target = 3; T.stepPlayer(1 / 60, 90);
    const side = () => { const right = new V(Math.cos(T.getYaw()), 0, -Math.sin(T.getYaw())); return T.camera.position.clone().sub(T.player.pos).dot(right); };
    const dist = () => T.camera.position.distanceTo(T.player.pos);
    out.sideA = side(); out.distHip = dist();
    T.mouse.aim = true; T.stepPlayer(1 / 60, 60); out.distAim = dist(); T.mouse.aim = false; T.stepPlayer(1 / 60, 60);
    C.swapShoulder(); T.stepPlayer(1 / 60, 90); out.sideB = side();
    return out;
  });
  assert.ok(Math.sign(r.rollRight) !== Math.sign(r.rollLeft) && Math.abs(r.rollRight) > 0.003 && Math.abs(r.rollLeft) > 0.003, JSON.stringify(r));
  assert.ok(Math.abs(r.rollRest) < 0.004, JSON.stringify(r));
  assert.ok(r.distAim < r.distHip * 0.8, JSON.stringify(r));
  assert.ok(Math.sign(r.sideA) !== Math.sign(r.sideB) && Math.abs(r.sideB) > 0.2, JSON.stringify(r));
  assert.deepEqual(errs, []);
  console.log('PASS camera feel', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
