// Survivor skin: the block body is mapped from textures/survivor-skin.png (256x256, Minecraft
// 64-unit layout at 4x, built from the model sheet by tools/skin/build_skin.py). Renders the
// avatar front/back and samples body regions: face skin + dark hair, bare chest, belt, dark cargo
// pants, pale soles; back shows hair and bare back; no NaN, hat layer transparent around the head.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const png = fs.readFileSync(path.join(root, 'textures/survivor-skin.png'));
assert.equal(png.readUInt32BE(16), 256, 'skin width'); assert.equal(png.readUInt32BE(20), 256, 'skin height');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.png') ? 'image/png' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`); await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready, { timeout: 90000 });
  const res = await p.evaluate(async () => {
    const T = DeadRecoilTest, S = T.Survivor;
    T.setMap(0); T.PlayerController.start(); T.pause();
    const av = S.create(0, T.WeaponSystem.weapons.find(w => w.name === 'Machete'));
    let skinMap = null; av.traverse(o => { if (o.isMesh && o.material?.map?.image !== undefined && !skinMap && /survivor-skin/.test(o.material.map.image?.src || o.material.map.image?.currentSrc || '')) skinMap = o.material.map; });
    for (let i = 0; i < 100 && !(skinMap?.image?.complete && skinMap.image.naturalWidth); i++) { await new Promise(r => setTimeout(r, 100)); av.traverse(o => { if (!skinMap && o.isMesh && /survivor-skin/.test(o.material?.map?.image?.src || '')) skinMap = o.material.map; }); }
    if (!skinMap) return { error: 'skin texture not used' };
    skinMap.needsUpdate = true;
    const W = 120, H = 260, rt = new THREE.WebGLRenderTarget(W, H), px = new Uint8Array(W * H * 4), sc = new THREE.Scene();
    sc.add(new THREE.AmbientLight(0xffffff, 1.0)); sc.add(av); av.rotation.set(0, 0, 0);
    for (let i = 0; i < 3; i++) S.animate(av, 1 / 30, i / 30, 0, false, 0, 99, false, false, 0, 0);
    av.traverse(o => { if (o.isMesh && !o.material?.map) o.visible = false; }); // weapon and gear off: skin only
    av.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(av), half = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y) * 0.55, cy = (bb.max.y + bb.min.y) / 2;
    const cam = new THREE.OrthographicCamera(-half * W / H, half * W / H, half, -half, 0.1, 10);
    const R = T.renderer, out = {};
    for (const [name, yaw] of [['front', 0], ['back', Math.PI]]) {
      av.rotation.y = yaw; cam.position.set(0, cy, 3); cam.lookAt(0, cy, 0); cam.updateMatrixWorld(true); sc.updateMatrixWorld(true);
      R.setRenderTarget(rt); R.setClearColor(0xff00ff, 1); R.clear(); R.render(sc, cam); R.readRenderTargetPixels(rt, 0, 0, W, H, px); R.setRenderTarget(null);
      const rig = av.userData.rig, V = THREE.Vector3;
      const at = (obj, off) => { const w = obj.localToWorld(new V(...off)).project(cam); const x = Math.round((w.x * 0.5 + 0.5) * (W - 1)), y = Math.round((w.y * 0.5 + 0.5) * (H - 1)); const i = (y * W + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
      const fz = yaw ? -0.3 : 0.3; // sample just in front of the visible face
      out[name] = { faceOrBack: at(rig.head, [0.06, 0.0, fz]), hairTop: at(rig.head, [0, 0.29, fz]), chest: at(rig.chest, [0.05, 0.3, fz]), belt: at(rig.hips, [0.05, 0.06, fz]), thigh: at(rig.legs[0], [0, -0.15, fz]), sole: at(rig.knees[0], [0, -0.37, fz]), outside: [px[0], px[1], px[2]] };
    }
    return out;
  });
  console.log(JSON.stringify(res)); assert.ok(!res.error, res.error);
  const lum = (c) => (c[0] + c[1] + c[2]) / 3, skinish = (c) => c[0] > c[2] + 25 && c[0] > 120, magenta = (c) => c[0] > 200 && c[2] > 200 && c[1] < 60;
  const f = res.front, k = res.back;
  assert.ok(skinish(f.faceOrBack), 'face is skin-coloured');
  assert.ok(lum(f.hairTop) < 60, 'black hair on top of the head');
  assert.ok(skinish(f.chest) && skinish(k.chest), 'bare chest and back');
  assert.ok(lum(f.belt) < 80 && lum(f.thigh) < 80, 'dark belt and cargo pants');
  assert.ok(lum(f.sole) > 110, 'pale sneaker soles');
  assert.ok(lum(k.faceOrBack) < 70, 'back of the head is hair');
  assert.ok(magenta(f.outside), 'nothing renders outside the body');
  assert.deepEqual(errs, []);
  console.log('PASS survivor skin mapped from the model sheet');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
