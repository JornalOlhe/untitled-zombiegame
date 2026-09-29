// Depth of field: off on low/medium; on high/ultra gameplay only the far distance softens (small
// radius, never a global blur); cinematics (kill cam, boss intro/death, own death) focus on their
// subject and the focus follows it; frame-rate independent convergence; no errors.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`); await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const out = await p.evaluate(() => {
    const T = DeadRecoilTest, D = T.DepthOfField, SM = T.SettingsManager, V = THREE.Vector3, res = {};
    T.setMap(0); T.PlayerController.start(); T.pause(); T.setPlaying();
    for (const g of ['low', 'medium', 'high', 'ultra']) {
      SM.data.graphics = g; D.amount = 0;
      let drew = false; for (let i = 0; i < 30; i++) drew = D.render(1 / 30);
      res[g] = { drew, cine: D.mat?.uniforms.cine.value, maxR: +(D.mat?.uniforms.maxR.value || 0).toFixed(2), farStart: D.mat?.uniforms.farStart.value };
    }
    // kill cam on a point 7 m in front of the camera: focus converges to its distance at 30 and 144 FPS
    SM.data.graphics = 'high';
    const cam = T.camera, pt = cam.position.clone().add(new V(0, 0, -7));
    for (const fps of [30, 144]) {
      D.focus = 30; T.KillCam.active = { focus: pt, angle: 0, radius: 4, time: 0, duration: 99 };
      for (let i = 0; i < fps; i++) D.render(1 / fps);
      res['kill' + fps] = { focus: +D.focus.toFixed(2), cine: D.mat.uniforms.cine.value, maxR: +D.mat.uniforms.maxR.value.toFixed(2) };
      T.KillCam.active = null;
    }
    return res;
  });
  console.log(JSON.stringify(out));
  assert.ok(!out.low.drew && !out.medium.drew, 'DOF off on low/medium');
  for (const g of ['high', 'ultra']) {
    assert.ok(out[g].drew && out[g].cine === 0, `${g}: gameplay DOF active and not cinematic`);
    assert.ok(out[g].maxR > 0 && out[g].maxR < 4 && out[g].farStart >= 30, `${g}: gameplay blur is far-only and small (${out[g].maxR})`);
  }
  for (const f of ['kill30', 'kill144']) assert.ok(Math.abs(out[f].focus - 7) < 0.4 && out[f].cine === 1 && out[f].maxR > out.high.maxR, `${f}: kill cam focuses on its subject`);
  assert.ok(Math.abs(out.kill30.focus - out.kill144.focus) < 0.2, 'focus convergence independent of frame rate');
  assert.deepEqual(errs, []);
  console.log('PASS depth of field');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
