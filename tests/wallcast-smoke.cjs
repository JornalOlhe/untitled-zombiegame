// WallCast (grid-accelerated wall raycasts) returns the same nearest hit as three.js
// intersectObjects(MapManager.walls) on every map, including instanced walls, and is faster.
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
  await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const r = await p.evaluate(() => {
    const T = DeadRecoilTest, V = THREE.Vector3, out = {};
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let m = 0; m < 5; m++) {
      T.setMap(m); T.PlayerController.start(); T.ZombieManager.clear();
      const W = T.MapManager.walls, H = T.MapManager.half, rc = new THREE.Raycaster();
      T.WallCast.sync(); // build the grid outside the timed loop
      let diff = 0, hits = 0, tA = 0, tB = 0;
      for (let i = 0; i < 600; i++) {
        const a = new V((rnd() * 2 - 1) * H, rnd() * 3, (rnd() * 2 - 1) * H), b = new V((rnd() * 2 - 1) * H, rnd() * 3, (rnd() * 2 - 1) * H);
        const d = b.clone().sub(a), L = d.length(); rc.set(a, d.normalize()); rc.far = L * (0.3 + rnd() * 0.7); rc.near = 0;
        let t = performance.now(); const A = rc.intersectObjects([...W, ...(T.Doors?.meshes || [])]); tA += performance.now() - t;
        t = performance.now(); const B = T.WallCast.hits(rc); tB += performance.now() - t;
        if (A.length) hits++;
        if ((A.length > 0) !== (B.length > 0) || (A[0] && Math.abs(A[0].distance - B[0].distance) > 2e-3) || (A[0] && A[0].object !== B[0].object)) diff++;
      }
      out[m] = { hits, diff, speedup: +(tA / Math.max(0.01, tB)).toFixed(1) };
    }
    return out;
  });
  for (const [m, v] of Object.entries(r)) { assert.equal(v.diff, 0, `map ${m}: ${JSON.stringify(v)}`); assert.ok(v.hits > 50, `map ${m} too few hits`); }
  assert.ok(Object.values(r).every(v => v.speedup > 2), JSON.stringify(r));
  assert.deepEqual(errs, []);
  console.log('PASS wallcast', JSON.stringify(r));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
