// Movement: ladder up/down/exit on a City roof, low step-up, tall obstacle blocks, no NaN.
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
    await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 60000 });
    const r = await page.evaluate(() => {
      const T = DeadRecoilTest, M = T.MapManager, P = T.player && T.player;
      T.setMap(0); T.PlayerController.start(); T.pause();
      const p = T.player; p.hp = p.maxhp = 1e9;
      T.ZombieManager.list.length = 0;
      const out = {};
      const feet = () => (p.ground || 0) + p.jump;
      const faceDir = (dx, dz) => T.setYaw(Math.atan2(-dx, -dz));
      const hold = (code, sec) => { T.keys.add(code); T.stepPlayer(1 / 30, Math.round(sec * 30)); T.keys.delete(code); };
      // Ladder
      const l = M.ladders[0];
      out.ladders = M.ladders.length;
      if (l) {
        const [ix, iz] = M.ladderInward(l);
        p.pos.set(l.x - ix * 0.9, 1.7, l.z - iz * 0.9); p.ground = 0; p.jump = 0; p.vy = 0; p.climb = null;
        faceDir(ix, iz);
        T.keys.add('KeyW');
        let maxFeet = 0, grabbed = false;
        for (let i = 0; i < 150; i++) { T.stepPlayer(1 / 30, 1); maxFeet = Math.max(maxFeet, feet()); grabbed ||= !!p.climb; if (!p.climb && feet() >= l.top - 0.05 && i > 5) break; }
        T.keys.delete('KeyW');
        T.stepPlayer(1 / 30, 15);
        out.ladderTop = { top: l.top, feet: +feet().toFixed(2), grabbed, onRoof: Math.abs(feet() - l.top) < 0.1, climbing: !!p.climb, vy: p.vy };
        // Walk back over the edge: must grab and climb down, not fall.
        T.keys.add('KeyS');
        let minFeet = 99, grabbedDown = false, fastest = 0, prev = feet();
        for (let i = 0; i < 200; i++) { T.stepPlayer(1 / 30, 1); const f = feet(); if (i > 1) fastest = Math.max(fastest, (prev - f) * 30); prev = f; minFeet = Math.min(minFeet, f); grabbedDown ||= !!p.climb; if (f < 0.05 && !p.climb) break; }
        T.keys.delete('KeyS');
        out.ladderDown = { grabbedDown, minFeet: +minFeet.toFixed(2), maxDescentSpeed: +fastest.toFixed(2), climbing: !!p.climb };
      }
      // Step-up and tall obstacle in an open spot.
      let sx = 0, sz = 0;
      outer: for (let x = -40; x < 40; x += 3) for (let z = -40; z < 40; z += 3) { let ok = true; for (let d = -4; d <= 4 && ok; d += 1) ok = !M.collides(x + d, z, 1.2) && !M.collides(x, z + d, 1.2); if (ok) { sx = x; sz = z; break outer; } }
      const low = { x: sx + 1.5, z: sz, w: 0.6, d: 1.2, h: 0.35, top: 0.35 };
      M.obstacles.push(low);
      p.pos.set(sx - 1, 1.7, sz); p.ground = 0; p.jump = 0; p.vy = 0; p.climb = null;
      faceDir(1, 0);
      let maxF = 0; T.keys.add('KeyW'); for (let i = 0; i < 45; i++) { T.stepPlayer(1 / 30, 1); maxF = Math.max(maxF, feet()); } T.keys.delete('KeyW');
      out.lowStep = { crossed: p.pos.x > low.x, maxFeet: +maxF.toFixed(2) };
      M.obstacles.splice(M.obstacles.indexOf(low), 1);
      const tall = { x: sx + 1.5, z: sz, w: 0.6, d: 1.2, h: 2.4, top: 2.4 };
      M.obstacles.push(tall);
      p.pos.set(sx - 1, 1.7, sz); p.ground = 0; p.jump = 0; p.vy = 0;
      T.keys.add('KeyW'); for (let i = 0; i < 60; i++) T.stepPlayer(1 / 30, 1); T.keys.delete('KeyW');
      out.tall = { blocked: p.pos.x < tall.x - tall.w, feet: +feet().toFixed(2) };
      M.obstacles.splice(M.obstacles.indexOf(tall), 1);
      out.nan = !isFinite(p.pos.x + p.pos.y + p.pos.z);
      return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.ladders > 0, 'City must have ladders');
    assert.ok(r.ladderTop.grabbed && r.ladderTop.onRoof && !r.ladderTop.climbing, 'ladder: climb and step onto the roof');
    assert.ok(r.ladderDown.grabbedDown && r.ladderDown.maxDescentSpeed < 4, 'ladder: climb down, not fall');
    assert.ok(r.lowStep.crossed && r.lowStep.maxFeet >= 0.3, 'low obstacle is stepped over');
    assert.ok(r.tall.blocked && r.tall.feet < 0.1, 'tall obstacle blocks');
    assert.ok(!r.nan);
    assert.deepEqual(errors, []);
    console.log('PASS movement');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
