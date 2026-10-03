// Archangel wings and Archdemon tail through every movement state (idle, walk, run, jump, fall,
// take-off, hover, forward flight, turn, landing / stop) at 30, 60 and 144 FPS: poses stay finite,
// joints never snap (bounded angular speed), each state has its own wing shape, the wing chain and
// tail chain lag from root to tip, and the result does not depend on the frame rate.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0] === '/' ? 'index.html' : q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404).end(); return; } r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html'); r.end(d); }); });
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`); await p.waitForFunction(() => window.DeadRecoilTest?.WeaponModels?.ready && window.DeadRecoilTest?.PropModels?.parts?.get('acc_wing'), { timeout: 90000 });
  const out = await p.evaluate(() => {
    const T = DeadRecoilTest, S = T.Survivor, W = T.WeaponSystem, res = {};
    T.setMap(4); T.PlayerController.start(); T.pause();
    // [name, t0, t1]; motion script: position (x,y,z), yaw, forced flight, jump height
    const script = (t) => {
      if (t < 1) return ['idle', 0, 0, 0, 0, false, 0];
      if (t < 2) return ['walk', 0, 0, (t - 1) * 2.5, 0, false, 0];
      if (t < 3) return ['run', 0, 0, 2.5 + (t - 2) * 7, 0, false, 0];
      if (t < 3.45) { const k = t - 3; return ['jump', 0, 0, 9.5 + k * 5, 0, false, 4.2 * k - 4.9 * k * k + 0.01]; }
      if (t < 3.9) { const k = t - 3; return ['fall', 0, 0, 9.5 + k * 5, 0, false, Math.max(0, 4.2 * k - 4.9 * k * k)]; }
      if (t < 4.5) return ['ground', 0, 0, 12, 0, false, 0];
      if (t < 5.5) return ['takeoff', 0, Math.min(2, (t - 4.5) * 4), 12, 0, true, 0];
      if (t < 7) return ['hover', 0, 2 + 0.1 * Math.sin(t * 2), 12, 0, true, 0];
      if (t < 8.5) return ['forward', 0, 2, 12 + (t - 7) * 8, 0, true, 0];
      if (t < 9.5) { const k = t - 8.5; return ['turn', Math.sin(k * 2) * 4, 2, 24 + Math.sin(k * 2 + 1) * 4, k * 2, true, 0]; }
      if (t < 10.5) { const k = t - 9.5; return ['land', 3.6, Math.max(0, 2 - k * 4), 26, 2, false, 0]; }
      return ['rest', 3.6, 0, 26, 2, false, 0];
    };
    for (const [cls, kind] of [[22, 'angel'], [23, 'demon']]) {
      T.setClass(cls);
      for (const fps of [30, 60, 144]) {
        const g = S.create(cls, W.weapons[0]); T.scene.add(g); const r = g.userData.rig, sec = r.secretAccessories;
        const dt = 1 / fps, rec = { maxW: 0, nan: false, states: {} };
        let prev = null, t = 0;
        const bones = () => kind === 'angel' ? sec.left.children[0].userData.wing.bones : sec.segs;
        while (t < 11) {
          t += dt;
          const [st, x, y, z, yaw, fly, jump] = script(t);
          g.position.set(x, y, z); g.rotation.y = yaw; g.updateMatrixWorld(true);
          if (kind === 'angel') sec.forceFly = fly;
          S.animate(g, dt, t, st === 'walk' ? 2.5 : st === 'run' ? 7 : 0, false, jump, 99, false, false, t * 3);
          const B = bones(), cur = B.map(o => [o.rotation.x, o.rotation.y, o.rotation.z]);
          if (cur.flat().some(v => !Number.isFinite(v))) rec.nan = true;
          if (prev) for (let i = 0; i < cur.length; i++) for (let a = 0; a < 3; a++) rec.maxW = Math.max(rec.maxW, Math.abs(cur[i][a] - prev[i][a]) / dt);
          prev = cur;
          const s = (rec.states[st] ||= { n: 0, root: [0, 0, 0], tip: [0, 0, 0], tipVar: 0, rootVar: 0, lastT: null, lastR: null });
          s.n++;
          for (let a = 0; a < 3; a++) { s.root[a] += cur[0][a]; s.tip[a] += cur.at(-1)[a]; }
          if (s.lastT) { s.tipVar += Math.abs(cur.at(-1)[0] - s.lastT) + Math.abs(cur.at(-1)[1] - s.lastT1); s.rootVar += Math.abs(cur[0][0] - s.lastR) + Math.abs(cur[0][1] - s.lastR1); }
          s.lastT = cur.at(-1)[0]; s.lastT1 = cur.at(-1)[1]; s.lastR = cur[0][0]; s.lastR1 = cur[0][1];
        }
        for (const s of Object.values(rec.states)) { s.root = s.root.map(v => +(v / s.n).toFixed(3)); s.tip = s.tip.map(v => +(v / s.n).toFixed(3)); s.tipVar = +s.tipVar.toFixed(2); s.rootVar = +s.rootVar.toFixed(2); delete s.lastT; delete s.lastR; delete s.lastT1; delete s.lastR1; delete s.n; }
        rec.maxW = +rec.maxW.toFixed(1);
        T.scene.remove(g);
        (res[kind] ||= {})[fps] = rec;
      }
    }
    return res;
  });
  const sig = (s) => [...s.root, ...s.tip];
  const dist = (a, b) => Math.hypot(...sig(a).map((v, i) => v - sig(b)[i]));
  for (const kind of ['angel', 'demon']) {
    for (const fps of ['30', '60', '144']) {
      const r = out[kind][fps];
      console.log(kind, fps, 'maxW', r.maxW, Object.fromEntries(Object.entries(r.states).map(([k, s]) => [k, [s.root.map(v => v.toFixed(2)).join('/'), 'tipVar ' + s.tipVar]])));
      assert.ok(!r.nan, `${kind}@${fps}: finite`);
      assert.ok(r.maxW < 40, `${kind}@${fps}: no joint snaps (${r.maxW} rad/s)`);
    }
    const a = out[kind]['60'].states;
    if (kind === 'angel') {
      for (const [x, y] of [['idle', 'hover'], ['idle', 'forward'], ['hover', 'forward'], ['fall', 'idle'], ['takeoff', 'hover'], ['land', 'hover']])
        assert.ok(dist(a[x], a[y]) > 0.08, `angel: ${x} and ${y} are different wing shapes (${dist(a[x], a[y]).toFixed(3)})`);
      assert.ok(a.hover.tipVar > a.hover.rootVar, 'angel: primaries travel further than the root (chain follow-through)');
      assert.ok(Math.abs(a.idle.root[1]) < 0.8, 'angel: resting wing root must not fold backward through the survivor');
    } else {
      assert.ok(a.rest.tipVar > 0.02 && a.run.tipVar > a.run.rootVar, 'demon: tail tip keeps swinging after the stop and leads the base in motion (inertia)');
      assert.ok(dist(a.turn, a.forward) > 0.03, 'demon: tail reacts to the turn');
    }
    for (const st of Object.keys(out[kind]['30'].states)) {
      const d = dist(out[kind]['30'].states[st], out[kind]['144'].states[st]);
      assert.ok(d < 0.12, `${kind}: ${st} pose independent of frame rate (${d.toFixed(3)})`);
    }
  }
  assert.deepEqual(errs, []);
  console.log('PASS wings & tail states');
  await b.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
