// Explosions: pooled fireball/smoke/dust sprites appear, expire, never grow the pool; blast still kills
// in radius, respects VFX off, and distance shake/audio paths run without errors.
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
    const T = DeadRecoilTest, E = T.ExplosionFX, V = THREE.Vector3, out = {};
    T.setMap(0); T.PlayerController.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear();
    T.player.hp = T.player.maxhp = 1e9;
    const at = T.player.pos.clone().add(new V(0, 0, -8));
    const zs = [0, 1, 2].map(i => { const z = T.ZombieManager.spawn(0, null, at.clone().add(new V(i - 1, 0, 0))); z.speed = 0; return z; });
    T.explosion(at, 5, 400, false, 0xff9d46);
    out.live = E.live; out.pool = E.pool.length; out.killed = zs.filter(z => z.dead || !T.ZombieManager.list.includes(z)).length;
    for (let i = 0; i < 6; i++) T.explosion(at, 5, 1, false);
    out.poolAfter = E.pool.length;
    for (let t = 0; t < 5; t += 0.05) E.update(0.05);
    out.liveAfter = E.live;
    const vfx = T.SettingsManager.data.vfx; T.SettingsManager.data.vfx = 'off'; T.explosion(at, 5, 1, false); out.offLive = E.live; T.SettingsManager.data.vfx = vfx;
    return out;
  });
  assert.ok(r.live > 5, JSON.stringify(r));
  assert.equal(r.pool, r.poolAfter);
  assert.equal(r.killed, 3);
  assert.equal(r.liveAfter, 0);
  assert.equal(r.offLive, 0);
  assert.deepEqual(errs, []);
  console.log('PASS explosions', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
