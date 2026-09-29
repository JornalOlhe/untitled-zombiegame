// Closed maps (Hospital, Lab): the ceiling is solid for the player (jump, flight, dev-fly,
// knock-back), the third-person camera, projectiles and leaping bosses.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.resolve(root, '.' + (q.url.split('?')[0] === '/' ? '/index.html' : decodeURIComponent(q.url.split('?')[0]))); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : f.endsWith('.css') ? 'text/css' : 'application/octet-stream'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await b.newPage({ viewport: { width: 480, height: 270 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 60000 });
  const res = await page.evaluate(() => {
    const T = DeadRecoilTest, P = T.PlayerController, V = THREE.Vector3, out = {};
    for (const map of [1, 3]) {
      T.setMap(map); P.start(); T.pause(); T.ZombieManager.clear();
      const ceil = T.MapManager.ceilingAt(), pl = T.player, r = { ceil, maxHead: 0, maxCam: 0, maxProj: 0, bossY: 0 };
      const head = () => { r.maxHead = Math.max(r.maxHead, pl.pos.y + 0.25); r.maxCam = Math.max(r.maxCam, T.camera.position.y); };
      // jump spam + a huge knock-back launch
      for (let i = 0; i < 40; i++) { T.queueJump(); T.stepPlayer(1 / 30, 3); head(); }
      pl.vy = 25; T.stepPlayer(1 / 60, 90); head();
      // Archangel flight holding Space
      T.setClass(22); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear(); pl.hp = pl.maxhp = 1e9; pl.classCharge = 100; pl.cooldown = 0; P.ability(); T.keys.add('Space'); for (let i = 0; i < 60; i++) { T.stepPlayer(1 / 30, 2); head(); } r.flightHead = r.maxHead; T.keys.delete('Space'); T.pause();
      // third-person camera looking down from above
      T.CameraRig.scroll(800); T.CameraRig.scroll(800); T.CameraRig.scroll(800); T.setPitch(-1.2); T.stepPlayer(1 / 30, 30); head();
      // projectile fired straight up
      T.spawnProjectile('arrow', pl.pos.clone(), new V(0, 1, 0), 10, { weapon: T.WeaponSystem.weapons[2], speed: 70 });
      for (let i = 0; i < 60; i++) { T.updateProjectiles(1 / 60); for (const p of T.projectiles) r.maxProj = Math.max(r.maxProj, p.pos.y); }
      // leaping boss
      const z = T.ZombieManager.spawn(6, T.WaveManager.bossRoster && Object.values(T.WaveManager.bossRoster)[0], new V(0, 0, -8));
      if (z && z.boss) { T.BossKit?.leap?.(z); for (let i = 0; i < 90; i++) { T.stepZombies(1 / 60, 1); r.bossY = Math.max(r.bossY, z.group.position.y + 1.9 * (z.size || 1)); } }
      out[map] = r;
    }
    return out;
  });
  // Sweep: map points (centre, mid, corners), projectile speeds/angles/frame rates, third-person
  // camera pressed into corners — nothing may cross the ceiling anywhere.
  const sweep = await page.evaluate(() => {
    const T = DeadRecoilTest, P = T.PlayerController, V = THREE.Vector3, out = {};
    for (const map of [1, 3]) {
      T.setMap(map); P.start(); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear();
      const pl = T.player, ceil = T.MapManager.ceiling, r = { ceil, head: 0, cam: 0, proj: 0 };
      pl.hp = pl.maxhp = 1e9;
      for (const [x, z] of [[0, 8], [20, -20], [-44, 44], [45, -45], [-30, 2]]) {
        pl.pos.set(x, 1.7, z);
        T.setClass(22); pl.classCharge = 100; pl.cooldown = 0; P.ability(); T.keys.add('Space');
        for (let i = 0; i < 90; i++) { T.stepPlayer(1 / 144, 3); r.head = Math.max(r.head, pl.pos.y + 0.25); r.cam = Math.max(r.cam, T.camera.position.y); }
        T.keys.delete('Space'); pl.activeUntil = 0; T.stepPlayer(1 / 30, 60);
        T.CameraRig.scroll(800); T.CameraRig.scroll(800); T.setPitch(-1.3);
        for (let i = 0; i < 20; i++) { T.stepPlayer(1 / 30, 1); r.cam = Math.max(r.cam, T.camera.position.y); }
        for (const speed of [70, 220, 450]) for (const ang of [0.5, 1.0, 1.45]) for (const fps of [30, 144]) {
          T.spawnProjectile('arrow', pl.pos.clone(), new V(Math.cos(ang), Math.sin(ang), 0).normalize(), 10, { weapon: T.WeaponSystem.weapons[2], speed });
          for (let i = 0; i < fps; i++) { T.updateProjectiles(1 / fps); for (const q of T.projectiles) r.proj = Math.max(r.proj, q.pos.y); }
        }
      }
      out[map] = r;
    }
    return out;
  });
  console.log(JSON.stringify(sweep));
  for (const [m, r] of Object.entries(sweep)) {
    assert.ok(r.head <= r.ceil + 0.01 && r.cam <= r.ceil - 0.15, `map ${m} sweep: head ${r.head.toFixed(2)} / camera ${r.cam.toFixed(2)} under ${r.ceil} at every point`);
    assert.ok(r.proj <= r.ceil + 0.01, `map ${m} sweep: fast/angled projectiles stop at the ceiling (${r.proj.toFixed(2)})`);
  }
  for (const m of ['1', '3']) {
    const r = res[m];
    assert.ok(Number.isFinite(r.ceil), `map ${m} has a solid ceiling`);
    assert.ok(r.flightHead > r.ceil - 0.5, `map ${m}: flight really pushed into the ceiling (${r.flightHead.toFixed(2)})`);
    assert.ok(r.maxHead <= r.ceil + 0.01, `map ${m}: player head ${r.maxHead.toFixed(2)} stays below ${r.ceil}`);
    assert.ok(r.maxCam <= r.ceil - 0.19, `map ${m}: camera ${r.maxCam.toFixed(2)} stays below the ceiling`);
    assert.ok(r.maxProj <= r.ceil, `map ${m}: projectile ${r.maxProj.toFixed(2)} stops at the ceiling`);
    assert.ok(r.bossY <= r.ceil + 0.05, `map ${m}: leaping boss top ${r.bossY.toFixed(2)} stays under the ceiling`);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(res));
  console.log('PASS ceilings');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
