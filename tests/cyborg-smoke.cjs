// Cyborg rocket: telegraph -> Blender rocket launch -> flight -> explosion -> fire zone -> expiry.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((req, res) => {
  const filename = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filename, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => !!window.DeadRecoilTest && window.DR_PROP_GLB, { timeout: 60000 });
    const r = await page.evaluate(() => {
      const T = DeadRecoilTest, R = T.CyborgRockets;
      T.setMap(4); T.PlayerController.start(); T.pause();
      T.WaveManager.remaining = 0;
      for (const z of [...T.ZombieManager.list]) T.scene.remove(z.group);
      T.ZombieManager.list.length = 0;
      const p = T.player; p.hp = p.maxhp = 5000;
      p.pos.set(0, 1.7, 16);
      const z = T.ZombieManager.spawn(8, null, new THREE.Vector3(0, 0, 4));
      z.speed = 0; z.special = 0; z.canSee = true;
      T.setPlaying();
      const out = { telegraph: false, rocket: false, model: !!T.PropModels?.parts?.get?.('rocket'), exploded: false, zone: false, zoneGone: false, hp0: p.hp };
      const step = () => { T.stepZombies(1 / 30, 1); R.update(1 / 30); T.updateProjectiles(1 / 30); };
      for (let i = 0; i < 240; i++) {
        step();
        out.telegraph ||= R.pending.length > 0;
        const rk = T.projectiles.find((x) => x.kind === 'rocket');
        if (rk) { out.rocket = true; out.rocketMeshes = rk.mesh.children.length; out.rocketSpeed = rk.vel.length(); }
        if (R.zones.length) { out.zone = true; out.exploded = true; break; }
      }
      out.hpAfterHit = p.hp;
      z.dead = true; z.special = 1e9;
      for (let i = 0; i < 200; i++) step();
      out.zoneGone = R.zones.length === 0;
      out.projectilesLeft = T.projectiles.filter((x) => x.kind === 'rocket').length;
      return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.telegraph, 'telegraph');
    assert.ok(r.rocket && r.rocketMeshes >= 1 && r.rocketSpeed > 10, 'rocket launched with its model');
    assert.ok(r.exploded && r.zone, 'explosion leaves a fire zone');
    assert.ok(r.hpAfterHit < r.hp0, 'rocket damages the player');
    assert.ok(r.zoneGone && r.projectilesLeft === 0, 'fire zone and rocket are cleaned up');
    assert.deepEqual(errors, []);
    console.log('PASS cyborg rocket');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
