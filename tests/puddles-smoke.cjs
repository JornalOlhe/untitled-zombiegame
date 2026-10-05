// Rain puddles + reflections: on the rain maps puddles sit only on open flat ground, fill up while
// it rains (wetness ramp), and the reflection setting picks the technique — off: dark wet sheen,
// low: cube environment, medium/high/ultra: planar mirror (render target at 1/4, 1/2, 0.7 of the
// frame). A bright object above a puddle must appear in the puddle only with the planar mirror.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`); await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const out = {};
  for (const mode of ['off', 'low', 'medium', 'high', 'ultra']) {
    out[mode] = await p.evaluate((mode) => {
      const T = DeadRecoilTest, W = T.WorldArt, R = T.renderer, M = T.MapManager;
      T.SettingsManager.data.reflections = mode; T.SettingsManager.apply();
      T.setMap(0); T.PlayerController.start(); T.setPlaying(); T.pause();
      const pud = W.weatherPuddles, m4 = new THREE.Matrix4(), v = new THREE.Vector3();
      let bad = 0; for (let i = 0; i < pud.count; i++) { pud.getMatrixAt(i, m4); v.setFromMatrixPosition(m4); if (v.y > 0.1 || M.collides(v.x, v.z, 0.6)) bad++; }
      const o = new THREE.Object3D(); o.position.set(2, 0.03, 8); o.rotation.set(-Math.PI / 2, 0, 0); o.scale.set(6, 4, 1); o.updateMatrix(); pud.setMatrixAt(0, o.matrix); pud.instanceMatrix.needsUpdate = true;
      const bx = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshBasicMaterial({ color: 0xff2010 })); bx.position.set(2, 0.82, 5.0); T.scene.add(bx);
      W.wetness = 1; W.update(1 / 60);
      const C = T.camera; C.position.set(2, 1.4, 12); C.lookAt(2, 0.6, 0); C.updateMatrixWorld(true);
      W.updateReflections(1 / 60); W.planarReflection(1 / 60); W.planarReflection(1 / 60);
      const rt = new THREE.WebGLRenderTarget(320, 180), px = new Uint8Array(320 * 180 * 4);
      R.setRenderTarget(rt); R.render(T.scene, C); R.readRenderTargetPixels(rt, 0, 0, 320, 180, px); R.setRenderTarget(null);
      // the mirrored box appears below the box base on screen: sample a column under it
      const base = new THREE.Vector3(2, 0.05, 5.0).project(C), mir = new THREE.Vector3(2, -0.7, 5.0).project(C);
      const sx = Math.round((mir.x * 0.5 + 0.5) * 319), sy = Math.round((mir.y * 0.5 + 0.5) * 179);
      let red = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const i = ((sy + dy) * 320 + sx + dx) * 4; if (px[i] > 90 && px[i] > px[i + 1] * 1.8 && px[i] > px[i + 2] * 1.8) red++; }
      T.scene.remove(bx);
      const U = W.puddleMaterial().uniforms;
      return { count: pud.count, bad, uMode: U.uMode.value, wet: +U.uWet.value.toFixed(2), red, rt: W.mirrorRT ? [W.mirrorRT.width, W.mirrorRT.height] : null };
    }, mode);
  }
  // wetness: puddles fill up while it rains
  out.fill = await p.evaluate(() => { const W = DeadRecoilTest.WorldArt; W.wetness = 0.25; const a = W.puddleMaterial().uniforms.uWet.value; for (let i = 0; i < 60 * 40; i++) W.updatePuddles(1 / 60, true); return [+(0.18 + 0.62 * 0.25).toFixed(2), +W.puddleMaterial().uniforms.uWet.value.toFixed(2)]; });
  console.log(JSON.stringify(out));
  for (const [m, r] of Object.entries(out)) if (m !== 'fill') {
    assert.ok(r.count >= 10 && r.bad === 0, `${m}: puddles placed only on open flat ground (${r.count}, bad ${r.bad})`);
    assert.equal(r.uMode, m === 'off' ? 0 : m === 'low' ? 1 : 2, `${m}: technique`);
    if (r.uMode === 2) assert.ok(r.red >= 6, `${m}: the planar mirror shows the object above the puddle (${r.red})`);
    else assert.ok(r.red < 3, `${m}: no mirror image without the planar reflection (${r.red})`);
  }
  assert.ok(out.medium.rt[0] < out.high.rt[0] && out.high.rt[0] < out.ultra.rt[0], 'mirror resolution scales with the setting');
  assert.ok(out.fill[1] > out.fill[0] + 0.2, 'puddles fill up while it rains');
  assert.deepEqual(errs, []);
  console.log('PASS puddles & reflections');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
