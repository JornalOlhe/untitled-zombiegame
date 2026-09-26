// Voxel monster roster smoke test: every skin spawns and animates, the boss schedule is right,
// both boss intros play and hand control back, and every boss ability fires without JS errors.
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
const shots = process.env.MONSTER_SHOTS !== '0';
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    fs.mkdirSync('test-results', { recursive: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.location()?.url?.includes('/api/')) errors.push('console: ' + m.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => !!window.DeadRecoilTest, { timeout: 30000 });
    assert.ok(await page.evaluate(() => !!window.DR_VOXEL_ATLAS && Object.keys(window.DR_VOXEL_ATLAS.atlases).length === 10), 'voxel atlas data must load');
    const SFX = ['roar', 'blizzard', 'demon', 'trident', 'frost', 'land', 'leap', 'medkit'];
    assert.ok(await page.evaluate(names => names.every(k => window.DR_MONSTER_SFX?.[k]), SFX), 'boss SFX data must load');

    // Boss schedule: Demon every 20, Yeti on other multiples of 10, QB/Mutant alternate on the rest of the 5s.
    const schedule = await page.evaluate(() => [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(w => DeadRecoilTest.WaveManager.bossFor(w)));
    assert.deepEqual(schedule, ['quarterback', 'yeti', 'mutant', 'demon', 'quarterback', 'yeti', 'mutant', 'demon', 'quarterback', 'yeti']);

    await page.locator('#play').click();
    await page.locator('#solo').click();
    await page.locator('[data-map="0"]').click();
    await page.locator('#nextmode').click();
    await page.locator('#rulescreen:not(.hidden)').waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    await page.locator('#deploy').click();
    await page.waitForFunction(() => DeadRecoilTest.state === DeadRecoilTest.GameState.PLAYING);

    // Headless software rendering runs slowly, so wait on simulated game time, not wall time.
    const waitSim = async (seconds) => {
      const start = await page.evaluate(() => DeadRecoilTest.time);
      await page.waitForFunction(([s0, d]) => DeadRecoilTest.time >= s0 + d, [start, seconds], { timeout: 60000 });
    };
    // Sound: every effect decodes, and playing one produces real signal on the SFX bus.
    const audio = await page.evaluate(async names => {
      const T = DeadRecoilTest, ctx = T.AudioManager.ctx;
      if (ctx.state !== 'running') await ctx.resume();
      const durations = {};
      for (const n of names) durations[n] = (await T.MonsterAudio.load(n))?.duration || 0;
      const an = ctx.createAnalyser();
      an.fftSize = 2048;
      T.AudioManager.sfxGain.connect(an);
      T.MonsterAudio.play('roar', { volume: 1.6 });
      const buf = new Float32Array(an.fftSize);
      let peak = 0;
      for (let i = 0; i < 12; i++) {
        await new Promise(r => setTimeout(r, 60));
        an.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        peak = Math.max(peak, Math.sqrt(sum / buf.length));
      }
      return { state: ctx.state, durations, peak };
    }, SFX);
    console.log('audio:', JSON.stringify(audio));
    assert.equal(audio.state, 'running');
    for (const n of SFX) assert.ok(audio.durations[n] > 0.4, `sound ${n} must decode`);
    assert.ok(audio.peak > 0.005, `roar must be audible on the SFX bus (rms ${audio.peak})`);

    // Map dressing: climbable rocks/crates exist and the boss landing zone is clear.
    const props = await page.evaluate(() => {
      const M = DeadRecoilTest.MapManager;
      return { low: M.obstacles.filter(o => o.top <= 0.5).length, mid: M.obstacles.filter(o => o.top > 0.5 && o.top <= 1.8).length, physics: DeadRecoilTest.PhysicsProps.items.length, centerFree: !M.collides(0, 0, 2.4) };
    });
    console.log('props:', JSON.stringify(props));
    assert.ok(props.low >= 6 && props.mid >= 4 && props.physics >= 10 && props.centerFree, 'map must have climbable props, physics props and a clear centre');
    if (shots) {
      await page.evaluate(() => { const T = DeadRecoilTest; T.WaveManager.remaining = 0; T.ZombieManager.clear(); T.ZombieManager.spawn(0, null, new THREE.Vector3(-30, 0, -30)).speed = 0; });
      await page.waitForTimeout(400);
      await page.screenshot({ path: 'test-results/world-props.png' });
    }

    // Climbing: walk onto a low block, then jump onto a taller one.
    const climb = await page.evaluate(() => {
      const T = DeadRecoilTest, M = T.MapManager;
      T.WaveManager.remaining = 0;
      T.ZombieManager.clear();
      T.ZombieManager.spawn(0, null, new THREE.Vector3(-30, 0, -30)).speed = 0; // keeps the wave (and the game) running
      T.player.pos.set(20, 1.7, -2);
      T.player.ground = 0; T.player.jump = 0; T.player.vy = 0;
      M.obstacles.push({ x: 21.3, z: -2, w: 0.5, d: 0.8, h: 0.45, top: 0.45 }, { x: 22.4, z: -2, w: 0.5, d: 0.8, h: 1.1, top: 1.1 });
      return M.collides(21.3, -2, 0.4, 0) === false && M.collides(22.4, -2, 0.4, 0) === true;
    });
    assert.ok(climb, 'low props must be passable, tall ones must block');
    await page.evaluate(() => { DeadRecoilTest.setTime(DeadRecoilTest.time); });
    await page.keyboard.down('KeyD');
    await page.waitForFunction(() => DeadRecoilTest.player.ground >= 0.44, null, { timeout: 60000 });
    await page.keyboard.press('Space');
    await page.waitForFunction(() => DeadRecoilTest.player.ground >= 1.09, null, { timeout: 60000 });
    await page.keyboard.up('KeyD');
    console.log('climb: ground', await page.evaluate(() => DeadRecoilTest.player.ground));

    // Medkits: drop at random times (18–42 s) and heal part of the health bar.
    const kit = await page.evaluate(() => {
      const T = DeadRecoilTest;
      T.Medkits.nextAt = T.time;
      return true;
    });
    await waitSim(0.2);
    const heal = await page.evaluate(() => {
      const T = DeadRecoilTest, m = T.Medkits.items[0];
      if (!m) return null;
      T.player.hp = 20;
      T.player.pos.set(m.pos.x, 1.7 + m.pos.y, m.pos.z);
      T.player.ground = m.pos.y; T.player.jump = 0;
      return { before: 20, next: T.Medkits.nextAt - T.time };
    });
    assert.ok(heal && heal.next >= 17.5 && heal.next <= 42.5, 'a medkit must spawn, next one 18–42 s later');
    await waitSim(0.3);
    const healed = await page.evaluate(() => ({ hp: DeadRecoilTest.player.hp, left: DeadRecoilTest.Medkits.items.length }));
    assert.ok(healed.hp > 20 && healed.left === 0, 'medkit must heal and disappear');

    // Grenade crate: one every 60 s, +2 grenades.
    await page.evaluate(() => { const T = DeadRecoilTest; T.Medkits.grenadeAt = T.time; });
    await waitSim(0.2);
    const crate = await page.evaluate(() => {
      const T = DeadRecoilTest, m = T.Medkits.items.find((i) => i.kind === 'grenade');
      if (!m) return null;
      T.player.grenades = 1;
      T.player.pos.set(m.pos.x, 1.7 + m.pos.y, m.pos.z);
      T.player.ground = m.pos.y; T.player.jump = 0;
      return { next: T.Medkits.grenadeAt - T.time };
    });
    assert.ok(crate && Math.abs(crate.next - 60) < 1, 'a grenade crate must spawn, next one 60 s later');
    await waitSim(0.3);
    assert.strictEqual(await page.evaluate(() => DeadRecoilTest.player.grenades), 3, 'grenade crate must give +2 grenades');

    // Physics: an explosion flings nearby props.
    const flung = await page.evaluate(() => {
      const T = DeadRecoilTest, P = T.PhysicsProps;
      const b = P.spawn('barrel', -2, 30);
      const before = b.pos.clone();
      P.impulse(new THREE.Vector3(-3, 0, 30), 6, 11);
      return { before: [before.x, before.z], vel: b.vel.length() };
    });
    await waitSim(0.5);
    const after = await page.evaluate(() => { const b = DeadRecoilTest.PhysicsProps.items.at(-1); return [b.pos.x, b.pos.z, b.target]; });
    assert.ok(flung.vel > 1 && after[0] > flung.before[0] + 0.3, 'barrel must be flung by the blast');

    const setup = async () => page.evaluate(() => {
      const T = DeadRecoilTest;
      T.MonsterFX.clear();
      T.WaveManager.remaining = 0;
      T.WaveManager.bossPending = false;
      T.ZombieManager.clear();
      T.player.hp = T.player.maxhp = 1e9;
      T.player.pos.set(0, 1.7, 10);
      T.player.ground = 0; T.player.jump = 0; T.player.vy = 0;
      T.ZombieManager.spawn(0, null, new THREE.Vector3(-32, 0, -32)).speed = 0;
    });
    await setup();

    // Regular roster: each archetype spawns with its voxel skin and walks.
    const roster = await page.evaluate(() => {
      const T = DeadRecoilTest, out = [];
      const types = [0, 1, 5, 8, 3, 2];
      types.forEach((type, i) => {
        const z = T.ZombieManager.spawn(type, null, new THREE.Vector3(-5 + i * 2, 0, 1));
        out.push({ type, name: z.name, voxel: !!z.rig.voxel, key: z.rig.key, style: z.rig.style, hits: z.rig.hits.length });
      });
      return out;
    });
    for (const r of roster) assert.ok(r.voxel && r.hits >= 6, `type ${r.type} (${r.name}) must use a voxel rig`);
    await waitSim(0.3);
    const finite = await page.evaluate(() => DeadRecoilTest.ZombieManager.list.every(z => [z.rig.upper.rotation.x, z.rig.neck.rotation.x, z.rig.body.position.y].every(Number.isFinite)));
    assert.ok(finite, 'every voxel rig pose must stay finite (the Constructor once vanished from a NaN)');
    assert.deepEqual(roster.map(r => r.key), ['03', '01', '02', '05', '07', '08']);
    await waitSim(0.9);
    const moved = await page.evaluate(() => DeadRecoilTest.ZombieManager.list.filter(z => z.speed > 0).every(z => Math.abs(z.rig.legs[0].rotation.x) + Math.abs(z.rig.arms[0].rotation.x) > 0.05));
    assert.ok(moved, 'voxel rigs must animate legs/arms');
    if (shots) await page.screenshot({ path: 'test-results/monsters-roster.png' });
    const roster2 = await page.evaluate(() => DeadRecoilTest.ZombieManager.list.filter(z => z.speed > 0).map(z => z.group.position.z));
    assert.ok(roster2.every(z => z > 1.05), 'regular monsters must walk toward the player');
    const popped = await page.evaluate(() => {
      const T = DeadRecoilTest, z = T.ZombieManager.list.find(z => z.speed > 0);
      T.ZombieManager.kill(z, true);
      return T.PhysicsProps.debris.length;
    });
    assert.ok(popped >= 1, 'headshot kill must pop the voxel head off');
    const deaths = await page.evaluate(() => {
      const T = DeadRecoilTest, list = T.ZombieManager.list.filter(z => z.speed > 0);
      const crawler = list.find(z => z.rig.style === 'crawler'), builder = list.find(z => z.type === 2);
      const debrisBefore = T.PhysicsProps.debris.length;
      T.ZombieManager.hit(crawler, 1e6, false, T.player.pos.clone());
      T.ZombieManager.hit(builder, 1e6, false, T.player.pos.clone());
      return { debrisBefore, debrisAfter: T.PhysicsProps.debris.length };
    });
    assert.ok(deaths.debrisAfter >= deaths.debrisBefore + 6, 'constructor must blow apart into blocks');
    await waitSim(0.8);
    const crawlerCorpse = await page.evaluate(() => { const c = DeadRecoilTest.ZombieManager.corpses.find(c => c.rig.style === 'crawler'); return c && { roll: c.rig.root.rotation.z, pitch: c.group.rotation.x, stretch: c.stretch, arm: c.rig.arms[0].rotation.x, low: c.rig.body.position.y < c.baseY }; });
    assert.ok(crawlerCorpse && Math.abs(crawlerCorpse.roll) < 0.01 && Math.abs(crawlerCorpse.pitch) < 0.01 && crawlerCorpse.stretch > 0.9 && crawlerCorpse.arm < -2.5 && crawlerCorpse.low, 'crawler must stretch out flat on the ground');
    if (shots) await page.screenshot({ path: 'test-results/monsters-deaths.png' });
    await waitSim(0.3);
    if (shots) await page.screenshot({ path: 'test-results/monsters-headpop.png' });

    // Minibosses and their abilities.
    await setup();
    const qb = await page.evaluate(() => {
      const T = DeadRecoilTest;
      T.WaveManager.wave = 5;
      T.WaveManager.boss();
      const z = T.ZombieManager.list.find(z => z.boss);
      z.group.position.set(0, 0, -8);
      z.blitzAt = T.time;
      return { name: z.name, key: z.rig.key, intro: !!T.BossIntro.active };
    });
    assert.deepEqual(qb, { name: 'Quarterback', key: '04', intro: false });
    await waitSim(0.5);
    assert.ok(await page.evaluate(() => DeadRecoilTest.ZombieManager.list.find(z => z.boss).blitzUntil > 0), 'quarterback must blitz');
    if (shots) await page.screenshot({ path: 'test-results/monsters-quarterback.png' });

    await setup();
    await page.evaluate(() => {
      const T = DeadRecoilTest;
      T.WaveManager.wave = 15;
      T.WaveManager.boss();
      const z = T.ZombieManager.list.find(z => z.boss);
      z.group.position.set(-6, 0, -6);
    });
    await waitSim(2.5);
    const puddles = await page.evaluate(() => DeadRecoilTest.MonsterFX.puddles.length);
    assert.ok(puddles >= 2, `mutant must leave an acid trail (got ${puddles})`);
    if (shots) await page.screenshot({ path: 'test-results/monsters-mutant.png' });

    // Yeti: intro cinematic, then frost pulse slows the player.
    await setup();
    await page.evaluate(() => { DeadRecoilTest.MonsterFX.clear(); DeadRecoilTest.WaveManager.wave = 10; DeadRecoilTest.WaveManager.boss(); });
    assert.ok(await page.evaluate(() => DeadRecoilTest.BossIntro.active?.kind === 'yeti'), 'yeti intro must start');
    assert.ok(await page.evaluate(() => DeadRecoilTest.ZombieManager.list.find(z => z.boss).group.position.distanceTo(DeadRecoilTest.player.pos) > 1000), 'intro must play far outside the map');
    for (const [t, name] of [[0.6, 'den'], [1.8, 'emerge'], [2.9, 'roar'], [4.3, 'leap']]) {
      await page.waitForFunction(v => (DeadRecoilTest.BossIntro.active?.time ?? 99) >= v, t, { timeout: 120000 });
      if (shots) await page.screenshot({ path: `test-results/monsters-yeti-intro-${name}.png` });
    }
    await page.waitForFunction(() => !DeadRecoilTest.BossIntro.active, null, { timeout: 120000 });
    assert.ok(await page.evaluate(() => !document.body.classList.contains('cinematic')), 'HUD must come back after the intro');
    assert.ok(await page.evaluate(() => !!DeadRecoilTest.ZombieManager.list.find(z => z.boss).dropping), 'yeti must drop from the sky');
    await waitSim(0.8);
    if (shots) await page.screenshot({ path: 'test-results/monsters-yeti-drop.png' });
    await page.waitForFunction(() => !DeadRecoilTest.ZombieManager.list.find(z => z.boss).dropping, null, { timeout: 120000 });
    const yLand = await page.evaluate(() => { const p = DeadRecoilTest.ZombieManager.list.find(z => z.boss).group.position; return [p.x, p.y, p.z]; });
    assert.ok(Math.hypot(yLand[0], yLand[2]) < 12 && yLand[1] < 0.6, `yeti must land near the map centre (${yLand})`);
    await waitSim(0.2);
    if (shots) await page.screenshot({ path: 'test-results/monsters-yeti-land.png' });
    await page.evaluate(() => {
      const T = DeadRecoilTest, z = T.ZombieManager.list.find(z => z.boss);
      z.group.position.set(T.player.pos.x, 0, T.player.pos.z - 5);
      z.frostAt = T.time;
    });
    await waitSim(0.3);
    assert.ok(await page.evaluate(() => DeadRecoilTest.player.slowUntil > DeadRecoilTest.time), 'yeti frost pulse must slow the player');
    if (shots) await page.screenshot({ path: 'test-results/monsters-yeti-frost.png' });

    // Demon: throne intro, life drain and telegraphed trident throw.
    await setup();
    await page.evaluate(() => { DeadRecoilTest.MonsterFX.clear(); DeadRecoilTest.WaveManager.wave = 20; DeadRecoilTest.WaveManager.boss(); });
    assert.ok(await page.evaluate(() => DeadRecoilTest.BossIntro.active?.kind === 'demon'), 'demon intro must start');
    for (const [t, name] of [[0.5, 'throne'], [1.4, 'rise'], [2.5, 'grab'], [3.3, 'roar'], [4.5, 'leap']]) {
      await page.waitForFunction(v => (DeadRecoilTest.BossIntro.active?.time ?? 99) >= v, t, { timeout: 120000 });
      if (shots) await page.screenshot({ path: `test-results/monsters-demon-intro-${name}.png` });
      if (name !== 'leap') {
        // Nothing in the arena may stand between the intro camera and the demon.
        const blocked = await page.evaluate(() => {
          const T = DeadRecoilTest, a = T.BossIntro.active, cam = T.camera;
          const target = new THREE.Vector3();
          a.z.group.getWorldPosition(target);
          target.y += 2.2 * a.z.size;
          const dir = target.clone().sub(cam.position), dist = dir.length();
          const ray = new THREE.Raycaster(cam.position.clone(), dir.normalize(), 0.1, dist - 1.2);
          const meshes = [];
          a.stage.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
          return ray.intersectObjects(meshes, false).length;
        });
        assert.equal(blocked, 0, `demon intro camera must have a clear view (${name})`);
      }
    }
    await page.waitForFunction(() => !DeadRecoilTest.BossIntro.active, null, { timeout: 120000 });
    await waitSim(0.9);
    if (shots) await page.screenshot({ path: 'test-results/monsters-demon-drop.png' });
    await page.waitForFunction(() => !DeadRecoilTest.ZombieManager.list.find(z => z.boss).dropping, null, { timeout: 120000 });
    await waitSim(0.15);
    if (shots) await page.screenshot({ path: 'test-results/monsters-demon-land.png' });
    const demon = await page.evaluate(() => {
      const T = DeadRecoilTest, z = T.ZombieManager.list.find(z => z.boss);
      z.group.position.set(T.player.pos.x + 3, 0, T.player.pos.z - 14);
      z.throwAt = T.time;
      return { name: z.name, key: z.rig.key, trident: z.rig.props.trident.visible };
    });
    assert.deepEqual(demon, { name: 'Demônio', key: '10', trident: true });
    await page.waitForFunction(() => DeadRecoilTest.MonsterFX.items.length > 1 && DeadRecoilTest.ZombieManager.list.find(z => z.boss)?.throwWind, null, { timeout: 90000 });
    await waitSim(0.4);
    if (shots) await page.screenshot({ path: 'test-results/monsters-demon-telegraph.png' });
    await page.waitForFunction(() => DeadRecoilTest.MonsterFX.throws.length > 0, null, { timeout: 90000 });
    await waitSim(0.2);
    if (shots) await page.screenshot({ path: 'test-results/monsters-demon-throw.png' });
    await page.waitForFunction(() => !DeadRecoilTest.ZombieManager.list.find(z => z.boss)?.throwWind, null, { timeout: 120000 });
    const hpBefore = await page.evaluate(() => {
      const T = DeadRecoilTest, z = T.ZombieManager.list.find(z => z.boss);
      z.group.position.set(T.player.pos.x, 0, T.player.pos.z - 4);
      z.throwAt = T.time + 99;
      z.hp = z.maxhp * 0.5;
      T.player.hp = 1e6;
      return { boss: z.hp, player: T.player.hp };
    });
    await waitSim(1.2);
    const hpAfter = await page.evaluate(() => ({ boss: DeadRecoilTest.ZombieManager.list.find(z => z.boss).hp, player: DeadRecoilTest.player.hp }));
    assert.ok(hpAfter.player < hpBefore.player && hpAfter.boss > hpBefore.boss, 'demon must drain life from nearby players');
    if (shots) await page.screenshot({ path: 'test-results/monsters-demon-drain.png' });

    assert.deepEqual(errors, []);
    console.log('PASS monsters: roster skins + walk cycles, boss schedule, QB blitz, mutant trail, yeti intro + frost, demon intro + throw + drain, no JS errors');
    await context.close();
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
