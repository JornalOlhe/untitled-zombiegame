// Pursuit / pathfinding: on every map a zombie placed far from the player must keep closing the
// distance (no aggro cutoff), including with obstacles in between. Uses deterministic AI stepping.
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
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = false;
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 60000 });
    for (let map = 0; map < 5; map++) {
      const res = await page.evaluate((map) => {
        const T = DeadRecoilTest, M = T.MapManager;
        T.setMap(map);
        T.PlayerController.start();
        T.pause && (T.state === T.GameState.PLAYING) && T.pause();
        const W = T.WaveManager; W.spawnQueue = []; W.remaining = 0;
        for (const z of [...T.ZombieManager.list]) { z.group.visible = false; T.ZombieManager.list.splice(T.ZombieManager.list.indexOf(z), 1); }
        const free = (x, z) => {
          for (let r = 0; r < 20; r += 1) for (let a = 0; a < 16; a++) {
            const px = x + Math.cos(a / 16 * Math.PI * 2) * r, pz = z + Math.sin(a / 16 * Math.PI * 2) * r;
            if (Math.abs(px) < M.half - 3 && Math.abs(pz) < M.half - 3 && !M.collides(px, pz, 0.8) && M.groundAt(px, pz, 0.2, 0) < 0.6) return [px, pz];
          }
          return null;
        };
        const H = M.half, out = [];
        // Connectivity: every spawn must reach the player start on the flow field.
        const ps = M.playerStart || [0, 10];
        T.player.pos.set(ps[0], 1.7, ps[1]);
        M.updateFlow();
        const unreachable = M.spawns.filter(([x, z]) => { const [cx, cz] = M.worldToCell(x, z); return M.flow[cz * M.gridSize + cx] >= 99999; });
        out.push({ label: 'spawns', unreachable: unreachable.length, total: M.spawns.length, closed: !!M.closed, designed: true });
        const cases = [[5, 'near'], [30, 'mid'], [60, 'far'], [H * 1.7, 'edge-to-edge']];
        for (const [d, label] of cases) {
          const p = free(-Math.min(d, H * 1.7) / 2, -Math.min(d, H * 1.7) / 3), zp = free(p[0] + d * 0.8, p[1] + d * 0.6);
          if (!p || !zp) { out.push({ label, skip: true }); continue; }
          T.player.pos.set(p[0], 1.7, p[1]);
          T.player.hp = 1e9; T.player.maxhp = 1e9;
          const z = T.ZombieManager.spawn(0, null, new THREE.Vector3(zp[0], 0, zp[1]));
          const dist = () => Math.hypot(z.group.position.x - T.player.pos.x, z.group.position.z - T.player.pos.z);
          const d0 = dist(), samples = [d0];
          // Up to ~72 simulated seconds, sampled every 4 s.
          for (let i = 0; i < 18 && dist() > 2.2; i++) { T.stepZombies(1 / 30, 120); samples.push(dist()); }
          const d1 = dist();
          const nan = !isFinite(z.group.position.x) || !isFinite(z.group.position.z);
          z.dead = true; T.ZombieManager.list.splice(T.ZombieManager.list.indexOf(z), 1); T.scene.remove(z.group);
          out.push({ label, d0: +d0.toFixed(1), d1: +d1.toFixed(1), nan, samples: samples.map(v => +v.toFixed(1)) });
        }
        return { map, half: H, out };
      }, map);
      console.log(JSON.stringify(res));
      for (const c of res.out) {
        if (c.skip) continue;
        if (c.label === 'spawns') { if (c.unreachable) { failed = true; console.error(`FAIL map ${map}: ${c.unreachable}/${c.total} spawns unreachable`); } continue; }
        assert.ok(!c.nan, `map ${map} ${c.label}: NaN position`);
        const ok = c.d1 < 3;
        if (!ok) { failed = true; console.error(`FAIL map ${map} ${c.label}: ${c.d0} -> ${c.d1}`); }
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) process.exit(1);
  console.log('PASS pursuit on all maps');
})().catch(e => { console.error(e); process.exit(1); });
