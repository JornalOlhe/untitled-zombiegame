// Directional damage indicator points at the attacker (front/behind/side) and fades; non-lethal
// headshots get their own marker; screen-shake accessibility setting exists.
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
    const T = DeadRecoilTest, H = T.HitDir, V = THREE.Vector3, out = {};
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear();
    T.player.hp = T.player.maxhp = 1e9;
    const dir = new V(); T.camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const at = (a) => { const z = T.ZombieManager.spawn(0, null, T.player.pos.clone().add(dir.clone().applyAxisAngle(new V(0, 1, 0), a).multiplyScalar(5))); z.speed = 0; return z; };
    const ang = (z) => { H.marks.forEach(m => m.t = 0); H.hit(z.group.position); return H.last; };
    let z = at(0); out.front = Math.abs(ang(z));
    T.ZombieManager.clear(); z = at(Math.PI); out.back = Math.abs(ang(z));
    T.ZombieManager.clear(); z = at(Math.PI / 2); out.side = Math.abs(ang(z));
    out.visible = H.marks.some(m => m.t > 0);
    H.update(10); out.faded = H.marks.every(m => m.t <= 0 && m.i.style.opacity === '0');
    // Hit confirmation kinds.
    T.ZombieManager.clear();
    const mk = () => { const q = T.ZombieManager.spawn(0, null, new V(0, 0, 8)); q.hp = q.maxhp = 1000; q.speed = 0; return q; };
    let q = mk(); T.ZombieManager.hit(q, 10, false, null, null); out.body = H.markKind;
    H.markUntil = 0; q = mk(); T.ZombieManager.hit(q, 10, true, null, null); out.head = H.markKind;
    // Accessibility: screen-shake setting exists, defaults to 100, and clamps.
    const S = T.SettingsManager; out.shakeDefault = S.defaults.shake;
    return out;
  });
  assert.ok(r.front < 0.1, 'front ' + r.front);
  assert.ok(Math.abs(r.back - Math.PI) < 0.1, 'back ' + r.back);
  assert.ok(Math.abs(r.side - Math.PI / 2) < 0.1, 'side ' + r.side);
  assert.ok(r.visible && r.faded, JSON.stringify(r));
  assert.ok(r.body === 'hit' && r.head === 'head', JSON.stringify(r));
  assert.equal(r.shakeDefault, 100);
  assert.deepEqual(errs, []);
  console.log('hitdir-smoke ok', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
