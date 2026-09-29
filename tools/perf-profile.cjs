// Frame profiler: every map × graphics level in the real frame loop (headless Chromium, 640×360 @
// DPR 1). Reports frame interval, CPU ms in simulation and in render submission (Perf), draw calls,
// triangles, point lights, shadow state, vegetation instances, particles, and the per-frame cost of
// selected systems (Nature, horde AI, Specter swarm, secret-accessory animation).
//   NODE_PATH=... PW_CHROMIUM=... node tools/perf-profile.cjs [out.json]
// NOTE: SwiftShader rasterises on the CPU, so absolute FPS is far below a real GPU; compare configs
// relative to each other. The render-submission ms and draw calls are GPU-independent.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`); await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  await p.evaluate(() => {
    const T = DeadRecoilTest;
    window.__cost = {};
    const wrap = (obj, fn, key) => { const o = obj[fn].bind(obj); obj[fn] = function (...a) { const t = performance.now(); const r = o(...a); window.__cost[key] = (window.__cost[key] || 0) + performance.now() - t; return r; }; };
    wrap(T.Nature, 'update', 'nature'); wrap(T.SpecterSwarm, 'update', 'specter'); wrap(T.Survivor, 'animate', 'avatarAnim');
    if (T.HordeAI) wrap(T.HordeAI, 'update', 'horde');
    window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
  const results = [];
  const configs = [];
  for (const map of [0, 1, 2, 3, 4]) for (const g of ['low', 'medium', 'high', 'ultra']) configs.push({ map, g, weapon: 'Crimson AK', cls: 0 });
  configs.push({ map: 2, g: 'high', weapon: 'Angelic Specter', cls: 22, tag: 'specter+wings' });
  configs.push({ map: 2, g: 'ultra', weapon: 'Angelic Specter', cls: 22, tag: 'specter+wings' });
  for (const c of configs) {
    await p.evaluate((c) => {
      const T = DeadRecoilTest, V = THREE.Vector3;
      T.SettingsManager.data.graphics = c.g; T.SettingsManager.apply();
      T.setMap(c.map); T.PlayerController.start(); T.setClass(c.cls); T.setPlaying(); T.WaveManager.remaining = 0; T.ZombieManager.clear();
      const pl = T.player; pl.hp = pl.maxhp = 1e9;
      const W = T.WeaponSystem, w = W.weapons.find((x) => x.name === c.weapon); W.equip({ ...w }); W.buildModel();
      if (c.cls === 22) { pl.classCharge = 100; pl.cooldown = 0; T.PlayerController.ability(); }
      for (let i = 0; i < 25; i++) { const a = i * 0.9; T.ZombieManager.spawn(i % 3, null, new V(pl.pos.x + Math.cos(a) * (8 + i % 7 * 2), 0, pl.pos.z + Math.sin(a) * (8 + i % 7 * 2))); }
    }, c);
    await p.waitForTimeout(700);
    await p.evaluate(() => { window.__cost = {}; window.__frames = 0; window.__t0 = performance.now(); DeadRecoilTest.Perf.reset(); });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(() => {
      const T = DeadRecoilTest, P = T.Perf, secs = (performance.now() - window.__t0) / 1000, n = Math.max(1, window.__frames);
      let lights = 0, shadowLights = 0, inst = 0, instMeshes = 0, transparent = 0;
      T.scene.traverse((o) => { if (o.isPointLight || o.isSpotLight) { if (o.visible && o.intensity > 0) lights++; if (o.castShadow) shadowLights++; } if (o.isInstancedMesh && o.visible) { instMeshes++; inst += o.count; } if (o.isMesh && o.visible && o.material?.transparent) transparent++; });
      const cost = Object.fromEntries(Object.entries(window.__cost).map(([k, v]) => [k, +(v / n).toFixed(3)]));
      // synchronous render timing (forces completion with a 1-pixel read): rasteriser cost of the frame
      const R = T.renderer, gl = R.getContext(), px = new Uint8Array(4); let best = 1e9;
      for (let i = 0; i < 4; i++) { const t0 = performance.now(); if (!T.DepthOfField.render(1 / 60)) R.render(T.scene, T.camera); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); best = Math.min(best, performance.now() - t0); }
      return { gpuMs: +best.toFixed(1), fps: +(n / secs).toFixed(1), frameMs: +P.frame.toFixed(1), updMs: +P.upd.toFixed(2), renMs: +P.ren.toFixed(2), calls: P.calls, tris: P.tris, lights, shadowLights, shadows: T.renderer.shadowMap.enabled, pixelRatio: T.renderer.getPixelRatio(), instMeshes, instances: inst, transparent, particles: T.ParticleSystem?.items?.length ?? null, zombies: T.ZombieManager.list.length, cost };
    });
    results.push({ map: c.map, graphics: c.g, tag: c.tag || '', ...r });
    console.log(JSON.stringify(results.at(-1)));
  }
  if (errs.length) console.log('ERRORS', errs.slice(0, 5));
  if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
