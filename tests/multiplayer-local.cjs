// Multiplayer end-to-end on the local transport (?net=local): two real game clients in one
// browser. Lobby create → join by code → READY → host-only START → both in the same match, see
// each other, host zombies appear as puppets on the client, the client's hits are applied by the
// host with kill credit, waves stay in sync, downed/revive, and a host that leaves hands the
// world to the other player (host migration).
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('android/app/src/main/assets');
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const filename = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!filename.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(filename, (error, data) => {
    if (error) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', types[path.extname(filename)] || 'application/octet-stream');
    res.end(data);
  });
});
const shots = process.env.MONSTER_SHOTS !== '0';
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  try {
    fs.mkdirSync('test-results', { recursive: true });
    const context = await browser.newContext({ viewport: { width: 960, height: 540 } });
    const base = `http://127.0.0.1:${server.address().port}/?test=1&net=local`;
    const open = async (name) => {
      const page = await context.newPage();
      page.errors = [];
      page.on('pageerror', e => page.errors.push(e.message));
      await page.goto(`${base}&name=${name}`);
      await page.waitForFunction(() => !!window.DeadRecoilTest && !!window.DR?.LobbyManager, null, { timeout: 90000 });
      return page;
    };
    const host = await open('Henrique');
    const guest = await open('Miguel');
    const T = (page, fn, arg) => page.evaluate(fn, arg);

    console.log('step:', 'Lobby: host creates, guest joins with the code.');
    // Lobby: host creates, guest joins with the code.
    await host.click('#play');
    await host.click('#multiplayer');
    await host.click('#createlobby');
    await host.locator('#lobbyscreen:not(.hidden)').waitFor();
    const code = (await host.locator('#lobby-code').textContent()).trim();
    assert.match(code, /^[A-Z0-9]{6}$/, 'lobby code');
    await guest.click('#play');
    await guest.click('#multiplayer');
    await guest.fill('#join-code', 'ZZZZZZ');
    await guest.click('#join-form button');
    await guest.waitForFunction(() => /não encontrado/i.test(document.getElementById('mp-msg').textContent));
    await guest.fill('#join-code', code.toLowerCase());
    await guest.click('#join-form button');
    await guest.locator('#lobbyscreen:not(.hidden)').waitFor();
    await host.waitForFunction(() => document.querySelectorAll('#lobby-players .lp-slot:not(.empty)').length === 2, null, { timeout: 20000 });
    assert.ok(await host.locator('#lobby-start').isDisabled(), 'host cannot start before everyone is READY');
    assert.ok(await guest.locator('#lobby-start').isHidden(), 'only the host has START');
    await guest.click('#lobby-ready');
    await host.waitForFunction(() => !document.getElementById('lobby-start').disabled, null, { timeout: 20000 });
    if (shots) await host.screenshot({ path: 'test-results/mp-lobby-host.png' });
    await host.click('#lobby-start');

    console.log('step:', 'Match: both clients enter the same arena.');
    // Match: both clients enter the same arena.
    await host.waitForFunction(() => DeadRecoilTest.state === 'PLAYING' && window.DR && DeadRecoilTest.NetGame?.active, null, { timeout: 90000 });
    await guest.waitForFunction(() => DeadRecoilTest.state === 'PLAYING' && DeadRecoilTest.NetGame?.active, null, { timeout: 90000 });
    assert.ok(await T(host, () => DeadRecoilTest.NetGame.host), 'creator is host');
    assert.ok(!(await T(guest, () => DeadRecoilTest.NetGame.host)), 'joiner is a client');
    await host.waitForFunction(() => DeadRecoilTest.NetGame.remotes.size === 1, null, { timeout: 30000 });
    await guest.waitForFunction(() => DeadRecoilTest.NetGame.remotes.size === 1, null, { timeout: 30000 });
    console.log('step:', "The client sees the host's zombies as puppets (host-authoritative horde).");
    // The client sees the host's zombies as puppets (host-authoritative horde).
    await host.waitForFunction(() => DeadRecoilTest.ZombieManager.list.length >= 2, null, { timeout: 60000 });
    await guest.waitForFunction(() => DeadRecoilTest.ZombieManager.list.filter(z => z.remote).length >= 1, null, { timeout: 60000 });
    const sameWave = await Promise.all([T(host, () => DeadRecoilTest.WaveManager.wave), T(guest, () => DeadRecoilTest.WaveManager.wave)]);
    assert.equal(sameWave[0], sameWave[1], 'wave number in sync');
    assert.ok(await T(guest, () => DeadRecoilTest.ZombieManager.list.every(z => z.remote)), 'client never spawns its own zombies');
    console.log('step:', 'The host world moves the puppet: positions converge.');
    // The host world moves the puppet: positions converge.
    await guest.waitForTimeout(1500);
    const drift = await (async () => {
      const g = await T(guest, () => { const z = DeadRecoilTest.ZombieManager.list[0]; return { id: z.netId, x: z.group.position.x, z: z.group.position.z }; });
      const h = await T(host, id => { const z = DeadRecoilTest.ZombieManager.list.find(q => q.netId === id); return z && { x: z.group.position.x, z: z.group.position.z }; }, g.id);
      return h ? Math.hypot(h.x - g.x, h.z - g.z) : 99;
    })();
    assert.ok(drift < 3, `puppet stays close to the host zombie (${drift.toFixed(2)} m)`);

    console.log('step:', 'Client shoots a puppet: the host validates, applies damage and credits the kill to the client.');
    // Client shoots a puppet: the host validates, applies damage and credits the kill to the client.
    const target = await T(guest, () => {
      const T2 = DeadRecoilTest, z = T2.ZombieManager.list[0], w = T2.WeaponSystem.current();
      T2.player.pos.set(z.group.position.x + 3, 1.7, z.group.position.z);
      for (let i = 0; i < 6; i++) T2.ZombieManager.hit(z, 40, true, z.group.position.clone().add(new THREE.Vector3(0, 1.7, 0)), w);
      return z.netId;
    });
    await guest.waitForFunction(id => !DeadRecoilTest.ZombieManager.list.some(z => z.netId === id), target, { timeout: 30000 });
    await guest.waitForFunction(() => DeadRecoilTest.player.kills >= 1, null, { timeout: 20000 });
    assert.equal(await T(host, () => DeadRecoilTest.player.kills), 0, 'host does not get credit for the client kill');
    const guestId = await T(guest, () => window.DR.LobbyManager.me.id);
    await host.waitForFunction(id => (DeadRecoilTest.NetGame.tallies[id]?.kills || 0) >= 1, guestId, { timeout: 20000 });
    if (shots) {
      await guest.screenshot({ path: 'test-results/mp-guest-view.png' });
      await host.screenshot({ path: 'test-results/mp-host-view.png' });
    }

    console.log('step:', 'Wave sync: the host clears the wave and the client follows into the next one.');
    // Wave sync: the host clears the wave and the client follows into the next one.
    const w0 = await T(host, () => DeadRecoilTest.WaveManager.wave);
    await T(host, () => { const T2 = DeadRecoilTest; T2.WaveManager.remaining = 0; T2.WaveManager.bossPending = false; for (const z of [...T2.ZombieManager.list]) T2.ZombieManager.hit(z, 1e6, false, null, T2.WeaponSystem.current()); });
    await host.waitForFunction(w => DeadRecoilTest.WaveManager.wave === w + 1, w0, { timeout: 240000 }).catch(async (e) => {
      console.log('host state', await T(host, () => ({ wave: DeadRecoilTest.WaveManager.wave, rem: DeadRecoilTest.WaveManager.remaining, bp: DeadRecoilTest.WaveManager.bossPending, list: DeadRecoilTest.ZombieManager.list.length, cleared: DeadRecoilTest.WaveManager.clearedAt, t: DeadRecoilTest.time, st: DeadRecoilTest.state })));
      throw e;
    });
    await guest.waitForFunction(w => DeadRecoilTest.WaveManager.wave === w + 1, w0, { timeout: 60000 });
    assert.equal(await T(guest, () => DeadRecoilTest.state), 'PLAYING', 'client goes straight to the next wave');

    console.log('step:', 'Downed + revive: the client goes down, the host revives it.');
    // Downed + revive: the client goes down, the host revives it.
    await T(host, () => { const T2 = DeadRecoilTest; T2.ZombieManager.list.forEach(z => (z.speed = 0)); });
    await T(guest, () => DeadRecoilTest.PlayerController.hurt(99999, true));
    assert.ok(await T(guest, () => DeadRecoilTest.NetGame.down && DeadRecoilTest.state === 'PLAYING'), 'client is downed, not dead');
    await host.waitForFunction(() => [...DeadRecoilTest.NetGame.remotes.values()][0]?.dn === 1, null, { timeout: 60000 });
    console.log('host sees downed');
    await T(host, () => { const r = [...DeadRecoilTest.NetGame.remotes.values()][0]; DeadRecoilTest.player.pos.set(r.pos.x + 1, r.pos.y, r.pos.z); });
    await host.keyboard.down('KeyE');
    await guest.waitForFunction(() => !DeadRecoilTest.NetGame.down, null, { timeout: 120000 }).catch(async (e) => {
      console.log('revive host', await T(host, () => { const N = DeadRecoilTest.NetGame, r = [...N.remotes.values()][0]; return { dn: r.dn, dist: r.pos.distanceTo(DeadRecoilTest.player.pos), hold: N.reviveHold, keys: 0, down: N.down, dead: N.dead, st: DeadRecoilTest.state }; }));
      throw e;
    });
    await host.keyboard.up('KeyE');
    assert.ok(await T(guest, () => DeadRecoilTest.player.hp > 0), 'revived with health');

    console.log('step:', 'Connection loss on the client shows the overlay and recovers.');
    // Connection loss on the client shows the overlay and recovers.
    await T(guest, () => window.DR.LobbyManager.transport.setOffline(true));
    await guest.waitForFunction(() => !document.getElementById('netoverlay').classList.contains('hidden'));
    assert.match(await guest.locator('#netoverlay h2').textContent(), /CONNECTION LOST/);
    await T(guest, () => window.DR.LobbyManager.transport.setOffline(false));
    await guest.waitForFunction(() => document.getElementById('netoverlay').classList.contains('hidden'));

    console.log('step:', 'Host leaves: the client is promoted and keeps the world running.');
    // Host leaves: the client is promoted and keeps the world running.
    await T(host, () => { window.DR.LobbyManager.leave(); });
    await guest.evaluate(() => window.DR.LobbyManager.refresh());
    await guest.waitForFunction(() => DeadRecoilTest.NetGame.host, null, { timeout: 30000 });
    const promoted = await T(guest, () => ({ remote: DeadRecoilTest.ZombieManager.list.filter(z => z.remote).length, wave: DeadRecoilTest.WaveManager.wave }));
    assert.equal(promoted.remote, 0, 'puppets became real zombies after host migration');

    for (const p of [host, guest]) assert.deepEqual(p.errors, [], 'no JS errors');
    console.log('PASS multiplayer (local): lobby/code/ready/start, sync, hits+credit, waves, revive, reconnect, host migration');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
