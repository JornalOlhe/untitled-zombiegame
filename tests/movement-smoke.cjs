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
      // ── Locomotion feel: sprint build-up, deceleration, jump, bunny hop, air control ──────
      const G = T.GroundMotion, PC = T.PlayerController, mo = PC.motion;
      const home = () => { p.pos.set(sx, 1.7, sz); };
      const keepHome = () => { if (Math.hypot(p.pos.x - sx, p.pos.z - sz) > 3) { p.pos.x = sx; p.pos.z = sz; } };
      const reset = () => { home(); p.ground = 0; p.jump = 0; p.vy = 0; p.climb = null; mo.reset(); T.keys.clear(); T.mouse.aim = false; faceDir(1, 0); };
      const run = (sec, fps, each) => { const n = Math.round(sec * fps); for (let i = 0; i < n; i++) { T.stepPlayer(1 / fps, 1); keepHome(); each && each(i, n); } };
      const sp = () => Math.hypot(mo.vx, mo.vz);
      reset(); T.keys.add('KeyW'); run(1.5, 60); const walk = sp();
      const sprintCurve = (fps) => {
        reset(); T.keys.add('KeyW'); run(1.0, fps); T.keys.add('ShiftLeft');
        const s = {}; let t = 0;
        for (const mark of [0.25, 0.5, 1.0, 1.5, 2.0, 2.6]) { run(mark - t, fps); t = mark; s[mark] = +sp().toFixed(3); }
        return s;
      };
      const c60 = sprintCurve(60), c30 = sprintCurve(30), c144 = sprintCurve(144);
      const sprintMax = walk * G.SPRINT_MULT;
      // Release: smooth deceleration back to walking speed.
      T.keys.delete('ShiftLeft'); run(0.1, 60); const after01 = sp(); run(0.6, 60); const after07 = sp();
      out.sprint = { walk: +walk.toFixed(3), sprintMax: +sprintMax.toFixed(3), c60, c30, c144, after01: +after01.toFixed(3), after07: +after07.toFixed(3) };
      // Jump height from rest.
      reset(); T.queueJump(); let top = 0; run(1.2, 60, () => { top = Math.max(top, p.jump); });
      out.jump = { top: +top.toFixed(3), landed: p.jump === 0 };
      // Bunny hop: at full sprint, hop on every landing while strafing with the mouse turn.
      // Air-strafe like a player would: in the air hold only the strafe key and turn the view
      // so the strafe direction stays ~86° from the velocity; hop on every landing.
      const hopRun = (fps, late, aim) => {
        reset(); T.keys.add('KeyW'); T.keys.add('ShiftLeft'); run(2.6, fps);
        if (aim) T.mouse.aim = true;
        let maxS = 0, hops = 0, air = false, landedAt = -1, frame = 0, side = 1;
        const n = Math.round(6 * fps);
        for (let i = 0; i < n; i++) {
          frame++;
          if (p.jump === 0) {
            if (air) { air = false; landedAt = frame; T.keys.add('KeyW'); T.keys.delete('KeyA'); T.keys.delete('KeyD'); }
            if (landedAt < 0 || (late && frame - landedAt >= Math.round(0.4 * fps))) T.queueJump();
          } else {
            // Timed player: presses jump just before touching down (the 0.12 s buffer).
            if (!late && p.vy < 0 && p.jump < 0.35) T.queueJump();
            if (!air) { air = true; hops++; side = -side; T.keys.delete('KeyW'); T.keys.add(side > 0 ? 'KeyD' : 'KeyA'); }
            // Velocity heading → yaw such that the strafe key points 80° away from it.
            const vAng = Math.atan2(mo.vx, mo.vz);
            const want = vAng + side * (86 * Math.PI / 180);
            // strafe D (x=+1) points at (cos yaw, -sin yaw) → atan2 = PI/2 - yaw; A is the opposite.
            T.setYaw(side > 0 ? Math.PI / 2 - want : -Math.PI / 2 - want);
          }
          T.stepPlayer(1 / fps, 1); keepHome();
          maxS = Math.max(maxS, sp());
          if (!isFinite(sp())) return { nan: true };
        }
        const end = sp();
        T.keys.clear(); T.mouse.aim = false;
        return { max: +maxS.toFixed(3), end: +end.toFixed(3), hops, cap: +PC.speedCap.toFixed(3) };
      };
      out.bhop = { timed60: hopRun(60), timed30: hopRun(30), timed144: hopRun(144), late: hopRun(60, true), aim: hopRun(60, false, true) };

      // Hold-to-bhop: one press, never release Space. Every landing must automatically launch
      // another jump; no OS key-repeat or fresh keydown events are required.
      reset(); T.keys.add('KeyW'); T.keys.add('ShiftLeft'); run(2.6, 60);
      T.keys.add('Space');
      let heldHops = 0, wasGrounded = true, heldMax = 0;
      for (let i = 0; i < 360; i++) {
        T.stepPlayer(1 / 60, 1); keepHome();
        const grounded = p.jump === 0;
        if (wasGrounded && !grounded) heldHops++;
        wasGrounded = grounded;
        heldMax = Math.max(heldMax, sp());
      }
      T.keys.delete('Space');
      out.holdJump = { hops: heldHops, max: +heldMax.toFixed(3), cap: +PC.speedCap.toFixed(3) };

      // Camera-relative airborne steering: start hopping forward, then turn the camera 90° while
      // continuing to hold W. Momentum must bend with the new current yaw instead of remaining
      // locked to the take-off vector.
      reset(); T.keys.add('KeyW'); T.keys.add('ShiftLeft'); run(2.6, 60); T.keys.add('Space');
      run(0.25, 60);
      const beforeTurnSpeed = sp();
      const beforeTurn = { vx: mo.vx, vz: mo.vz };
      const turnFrames = 48;
      for (let i = 0; i < turnFrames; i++) {
        T.setYaw((Math.PI / 2) * ((i + 1) / turnFrames));
        T.stepPlayer(1 / 60, 1); keepHome();
      }
      const desiredX = -1, desiredZ = 0,
        afterSpeed = Math.max(1e-6, sp()),
        alignment = (mo.vx * desiredX + mo.vz * desiredZ) / afterSpeed;
      out.airTurn = {
        beforeTurn,
        after: { vx: +mo.vx.toFixed(3), vz: +mo.vz.toFixed(3) },
        alignment: +alignment.toFixed(3),
        speedRatio: +(afterSpeed / Math.max(1e-6, beforeTurnSpeed)).toFixed(3),
        cap: +PC.speedCap.toFixed(3),
        speed: +afterSpeed.toFixed(3),
      };
      T.keys.clear();

      // Air control from a standing jump: strafing in the air only adds a little speed.
      reset(); T.queueJump(); T.stepPlayer(1 / 60, 2); T.keys.add('KeyD'); let airMax = 0; run(0.5, 60, () => { if (p.jump > 0) airMax = Math.max(airMax, sp()); }); T.keys.clear();
      out.air = { airMax: +airMax.toFixed(3), wish: G.AIR_WISH };
      reset();
      out.nan = !isFinite(p.pos.x + p.pos.y + p.pos.z);
      return out;
    });
    console.log(JSON.stringify(r));
    assert.ok(r.ladders > 0, 'City must have ladders');
    assert.ok(r.ladderTop.grabbed && r.ladderTop.onRoof && !r.ladderTop.climbing, 'ladder: climb and step onto the roof');
    assert.ok(r.ladderDown.grabbedDown && r.ladderDown.maxDescentSpeed < 4, 'ladder: climb down, not fall');
    assert.ok(r.lowStep.crossed && r.lowStep.maxFeet >= 0.3, 'low obstacle is stepped over');
    assert.ok(r.tall.blocked && r.tall.feet < 0.1, 'tall obstacle blocks');
    const S = r.sprint;
    for (const c of [S.c60, S.c30, S.c144]) {
      assert.ok(c[0.25] > S.walk && c[0.25] < S.sprintMax * 0.93, 'sprint starts accelerating, not instant: ' + JSON.stringify(c));
      assert.ok(c[0.25] < c[0.5] && c[0.5] < c[1] && c[1] < c[1.5] && c[1.5] <= c[2] + 1e-6, 'sprint speed rises smoothly: ' + JSON.stringify(c));
      assert.ok(c[1] < S.sprintMax * 0.99, 'still building up at 1 s');
      assert.ok(c[2.6] > S.sprintMax * 0.985 && c[2.6] <= S.sprintMax * 1.01, 'reaches top sprint speed ~2 s: ' + JSON.stringify(c));
    }
    assert.ok(Math.abs(S.c30[1] - S.c144[1]) / S.c60[1] < 0.04, 'sprint build-up is frame-rate independent');
    assert.ok(S.after01 > S.walk * 1.05 && S.after01 < S.sprintMax, 'sprint release decelerates smoothly');
    assert.ok(Math.abs(S.after07 - S.walk) / S.walk < 0.04, 'back to walking speed ~0.6 s after release');
    assert.ok(r.jump.top > 0.9 && r.jump.top < 1.4 && r.jump.landed, 'jump height');
    for (const k of ['timed60', 'timed30', 'timed144']) {
      const b = r.bhop[k];
      assert.ok(!b.nan && b.hops >= 6, 'bhop hops happen: ' + k);
      assert.ok(b.max <= b.cap + 0.02, 'bhop never exceeds the hard cap: ' + JSON.stringify(b));
      assert.ok(b.max >= S.sprintMax * 1.04, 'timed hops keep and slightly build momentum: ' + JSON.stringify(b));
    }
    assert.ok(Math.abs(r.bhop.timed30.max - r.bhop.timed144.max) / r.bhop.timed60.max < 0.06, 'bhop gain does not depend much on FPS');
    assert.ok(r.bhop.late.max < r.bhop.timed60.max - 0.15, 'late hops lose the momentum bonus: ' + JSON.stringify(r.bhop.late));
    assert.ok(r.bhop.aim.max <= r.bhop.aim.cap + 0.02 && r.bhop.aim.cap < r.bhop.timed60.cap * 0.75, 'aiming shrinks bhop: ' + JSON.stringify(r.bhop.aim));
    assert.ok(r.holdJump.hops >= 5, 'holding jump must automatically hop again after every landing: ' + JSON.stringify(r.holdJump));
    assert.ok(r.holdJump.max <= r.holdJump.cap + 0.02, 'hold-to-bhop remains under hard cap: ' + JSON.stringify(r.holdJump));
    assert.ok(r.airTurn.alignment > 0.82, 'air momentum must turn toward current camera-relative W direction: ' + JSON.stringify(r.airTurn));
    assert.ok(r.airTurn.speedRatio > 0.72, 'turning in air should preserve most momentum: ' + JSON.stringify(r.airTurn));
    assert.ok(r.airTurn.speed <= r.airTurn.cap + 0.02, 'air steering cannot exceed bhop cap: ' + JSON.stringify(r.airTurn));
    assert.ok(r.air.airMax <= r.air.wish + 0.08, 'air control is limited: ' + JSON.stringify(r.air));
    assert.ok(!r.nan);
    assert.deepEqual(errors, []);
    console.log('PASS movement');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
