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
    assert.ok(await page.evaluate(() => ['roar', 'blizzard', 'demon', 'trident', 'frost'].every(k => window.DR_MONSTER_SFX?.[k])), 'boss SFX data must load');

    // Boss schedule: Demon every 20, Yeti on other multiples of 10, QB/Mutant alternate on the rest of the 5s.
    const schedule = await page.evaluate(() => [5, 10, 15, 20, 25, 30, 35, 40, 45, 50].map(w => DeadRecoilTest.WaveManager.bossFor(w)));
    assert.deepEqual(schedule, ['quarterback', 'yeti', 'mutant', 'demon', 'quarterback', 'yeti', 'mutant', 'demon', 'quarterback', 'yeti']);

    await page.locator('#play').click();
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
    const setup = async () => page.evaluate(() => {
      const T = DeadRecoilTest;
      T.MonsterFX.clear();
      T.WaveManager.remaining = 0;
      T.WaveManager.bossPending = false;
      T.ZombieManager.clear();
      T.player.hp = T.player.maxhp = 1e9;
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
    assert.deepEqual(roster.map(r => r.key), ['03', '01', '02', '05', '07', '08']);
    await waitSim(0.9);
    const moved = await page.evaluate(() => DeadRecoilTest.ZombieManager.list.every(z => Math.abs(z.rig.legs[0].rotation.x) + Math.abs(z.rig.arms[0].rotation.x) > 0.05));
    assert.ok(moved, 'voxel rigs must animate legs/arms');
    if (shots) await page.screenshot({ path: 'test-results/monsters-roster.png' });
    const roster2 = await page.evaluate(() => DeadRecoilTest.ZombieManager.list.map(z => z.group.position.z));
    assert.ok(roster2.every(z => z > 1.05), 'regular monsters must walk toward the player');

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
    for (const [t, name] of [[0.6, 'den'], [2.0, 'emerge'], [3.3, 'roar']]) {
      await page.waitForFunction(v => (DeadRecoilTest.BossIntro.active?.time || 99) >= v, t, { timeout: 120000 });
      if (shots) await page.screenshot({ path: `test-results/monsters-yeti-intro-${name}.png` });
    }
    await page.waitForFunction(() => !DeadRecoilTest.BossIntro.active, null, { timeout: 120000 });
    assert.ok(await page.evaluate(() => !document.body.classList.contains('cinematic')), 'HUD must come back after the intro');
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
    for (const [t, name] of [[0.5, 'throne'], [1.7, 'rise'], [3.0, 'grab'], [3.9, 'roar']]) {
      await page.waitForFunction(v => (DeadRecoilTest.BossIntro.active?.time || 99) >= v, t, { timeout: 120000 });
      if (shots) await page.screenshot({ path: `test-results/monsters-demon-intro-${name}.png` });
    }
    await page.waitForFunction(() => !DeadRecoilTest.BossIntro.active, null, { timeout: 120000 });
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
