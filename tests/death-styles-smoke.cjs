// Death styles: every regular archetype plays its own scripted death and ends lying flat on the
// ground (no NaN, no floating), the crawler/constructor keep their dedicated deaths.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } }); const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, null, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = DeadRecoilTest, Z = T.ZombieManager, out = {};
    T.setMap(0); T.PlayerController.start(); Z.clear();
    const W = T.WaveManager; W.spawnQueue = []; W.remaining = 0;
    T.KillCam.start = () => {};
    for (const ty of [0, 1, 3, 4, 6, 7, 8, 9, 10, 11]) {
      const z = Z.spawn(ty, null, new THREE.Vector3(6, 0, 4));
      T.stepZombies(1 / 30, 2);
      Z.kill(z, false);
      const c = Z.corpses.find((k) => k.z === z);
      T.stepZombies(1 / 30, 75); // 2.5 s
      const rr = z.rig.root.rotation, tilt = Math.max(Math.abs(rr.x), Math.abs(rr.z));
      out[ty] = { style: c?.style || null, tilt: +tilt.toFixed(2), y: +z.group.position.y.toFixed(2), nan: !isFinite(rr.x + rr.z + z.group.position.x) };
      for (const k of [...Z.corpses]) { T.scene.remove(k.group); }
      Z.corpses = [];
    }
    return out;
  });
  const expect = { 0: ['crumple', null], 1: ['dive'], 3: ['backfall'], 4: ['scream'], 6: ['kneel'], 7: ['dive'], 8: ['glitch'], 9: ['spasm'], 10: ['kneel'], 11: ['dive'] };
  for (const [ty, v] of Object.entries(r)) {
    assert.ok(expect[ty].includes(v.style), `type ${ty} style ${v.style}`);
    assert.ok(!v.nan, `type ${ty} NaN`);
    assert.ok(v.tilt > 1.3, `type ${ty} should end lying down: ${JSON.stringify(v)}`);
    assert.ok(v.y < 0.6, `type ${ty} floating: ${JSON.stringify(v)}`);
  }
  assert.deepEqual(errs, []);
  console.log('PASS death styles', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
