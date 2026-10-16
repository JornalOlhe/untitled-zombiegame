// Secret classes and weapons: Archangel/Archdemon cast unlocks after 25 kills (Q): blast + 15 s flight with auto powers,
// allows vertical movement and ends; Demonic Fury throw (ground AoE in demon flight),
// Angelic Specter spin; Blender accessories are attached.
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
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.html') ? 'text/html' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(() => !!window.DeadRecoilTest, null, { timeout: 60000 });
    const out = {};
    for (const [cls, name] of [[22, 'angel'], [23, 'demon']]) {
      out[name] = await page.evaluate((cls) => {
        const T = DeadRecoilTest, P = T.PlayerController;
        T.setMap(4); P.start(); T.setClass(cls); T.setPlaying();
        T.WaveManager.remaining = 0;
        const p = T.player; p.hp = p.maxhp = 1e9;
        const feet = () => (p.ground || 0) + p.jump;
        const r = {};
        p.classCharge = 24; p.cooldown = 0; P.ability();
        r.lockedBefore100 = !T.classBurst().flight;
        T.ZombieManager.clear();
        const V = THREE.Vector3, at = (dx, dz) => new V(p.pos.x + dx, 0, p.pos.z + dz);
        const nearZ = T.ZombieManager.spawn(0, null, at(3, 0)); nearZ.speed = 0; nearZ.hp = nearZ.maxHp = 1e6;
        const nh0 = nearZ.hp;
        p.classCharge = 25; P.ability();
        T.stepPlayer(1 / 30, 6);
        r.blastHit = nearZ.hp < nh0;
        r.flying = T.classBurst().flight;
        T.keys.add('Space'); T.stepPlayer(1 / 30, 45); T.keys.delete('Space');
        r.rose = +feet().toFixed(2);
        r.chargeConsumed = p.classCharge === 0;
        // In-flight power: smite (angel) / brimstone meteors (demon) damage nearby enemies on their own.
        const far = T.ZombieManager.spawn(0, null, at(-6, 4)); far.speed = 0; far.hp = far.maxHp = 1e6;
        const fh0 = far.hp, nh1 = nearZ.hp;
        T.stepPlayer(1 / 30, 30 * 4);
        r.powerHits = (far.hp < fh0) + (nearZ.hp < nh1);
        T.ZombieManager.clear();
        T.stepPlayer(1 / 30, 30 * 12);
        r.ended = !T.classBurst().flight;
        T.stepPlayer(1 / 30, 30 * 4);
        r.landed = +feet().toFixed(2);
        return r;
      }, cls);
    }
    // Secret weapons.
    out.weapons = await page.evaluate(() => {
      const T = DeadRecoilTest, W = T.WeaponSystem, S = T.SecretWeaponSkills;
      T.setMap(4); T.PlayerController.start(); T.setClass(23); T.setPlaying();
      // v28: Demonic Fury is a one-handed scythe; F = Reaping Arc around the player.
      const w = { ...W.weapons.find((x) => x.scythe) };
      W.equip(w);
      T.player.pos.set(0, 1.7, 16); T.setYaw(0); T.setPitch(-0.3);
      const z = T.ZombieManager.spawn(0, null, new THREE.Vector3(2, 0, 16));
      const hp0 = z.hp;
      S.cooldown = 0; S.use();
      const thrown = z.dead || z.hp < hp0;
      const hellfire = S.cooldown > T.time && !!w.oneHand;
      const sw = { ...W.weapons.find((x) => x.specter) };
      W.equip(sw); T.setClass(0); S.cooldown = 0; S.use();
      const spinning = S.spinUntil > T.time;
      return { thrown, hellfire, spinning };
    });
    // v55: hell pool (slows non-bosses, 10 dmg / 0.25 s), thrown scythe (one at a time, comes back),
    // launched Angelic Specters (one by one; no attack until one is home).
    out.v55 = await page.evaluate(() => {
const T=DeadRecoilTest,P=T.PlayerController,V=THREE.Vector3,W=T.WeaponSystem;
      const r={};
      // --- Archdemon: pool + scythe throw
      T.setMap(0);P.start();T.setClass(23);T.setPlaying();T.WaveManager.remaining=0;T.WaveManager.update=()=>{};T.ZombieManager.clear();
      let p=T.player;p.hp=p.maxhp=1e9;p.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(0);
      const sc=W.create(W.weapons.findIndex(w=>w.scythe));W.equip(sc);
      const zin=T.ZombieManager.spawn(0,null,new V(2,0,12));zin.hp=zin.maxhp=1e6;
      const boss=T.ZombieManager.spawn(0,null,new V(-2,0,12));boss.hp=boss.maxhp=1e6;boss.boss={rank:1,name:'test'};
      const h0=zin.hp;p.classCharge=25;p.cooldown=0;P.ability();
      r.pools=T.ArchPowers.pools.length;
      T.stepPlayer(1/30,30);
      r.poolDmg=+(h0-zin.hp).toFixed(1);r.slowed=zin.slowUntil>T.simulationTime;r.bossSlowed=boss.slowUntil>T.simulationTime;
      // rise, then throw
      T.keys.add('Space');T.stepPlayer(1/30,30);T.keys.delete('Space');
      T.ZombieManager.clear();
      const tz=[];for(let k=0;k<3;k++){const z=T.ZombieManager.spawn(0,null,new V(p.pos.x,0,p.pos.z-6-k*3));z.speed=0;z.hp=z.maxhp=1e6;tz.push(z);}
      T.setPitch(-0.35);
      // click = swing (no throw); hold = wind-up then throw; hands stay empty until the catch
      T.mouse.down=true;T.stepPlayer(1/30,2);T.mouse.down=false;T.stepPlayer(1/30,3);r.clickNoThrow=!T.ScytheThrow.active();
      T.stepPlayer(1/30,30);
      T.mouse.down=true;T.stepPlayer(1/30,16);T.mouse.down=false;r.thrown=T.ScytheThrow.active();r.busy=T.handsBusy();
      r.gunHidden=!T.CameraRig.avatar||!T.CameraRig.avatar.userData.rig.gun.visible||T.CameraRig.distance<0.6;
      const first=T.ScytheThrow.out;T.mouse.down=true;T.stepPlayer(1/30,12);T.mouse.down=false;r.singleScythe=T.ScytheThrow.out===first;
      let steps=0;while(T.ScytheThrow.active()&&steps<300){T.stepPlayer(1/30,1);steps++;}
      r.caughtAfter=+(steps/30).toFixed(2);r.scytheHits=tz.filter(z=>z.hp<1e6).length;r.freeAfter=!T.handsBusy();
      // Q in flight: Infernal Legion from the last ordinary kills (2x their hp)
      for(let k=0;k<3;k++){const z=T.ZombieManager.spawn(0,null,new V(p.pos.x+k,0,p.pos.z-3));z.hp=z.maxhp=40;T.ZombieManager.kill(z);}
      P.ability();r.legion=T.DemonLegion.list.length;r.legionHp=T.DemonLegion.list.map(a=>a.maxhp);
      P.ability();r.legionOnce=T.DemonLegion.list.length;
      const foe=T.ZombieManager.spawn(0,null,new V(p.pos.x,0,p.pos.z-4));foe.hp=foe.maxhp=500;foe.speed=0;
      T.stepPlayer(1/30,150);r.legionHit=foe.hp<500;
      // --- Archangel: blades
      T.setClass(22);P.start();T.setClass(22);T.setPlaying();T.WaveManager.remaining=0;T.ZombieManager.clear();
      p=T.player;p.hp=p.maxhp=1e9;p.pos.set(0,1.7,12);T.setYaw(0);T.setPitch(0);
      const sp=W.create(W.weapons.findIndex(w=>w.specter));W.equip(sp);T.stepPlayer(1/30,10);
      p.classCharge=25;p.cooldown=0;P.ability();T.keys.add('Space');T.stepPlayer(1/30,45);T.keys.delete('Space');
      T.ZombieManager.clear();
      const bz=[];for(let k=0;k<4;k++){const z=T.ZombieManager.spawn(0,null,new V(p.pos.x+(k-1.5)*0.6,0,p.pos.z-8));z.speed=0;z.hp=z.maxhp=1e6;bz.push(z);}
      T.setPitch(-0.4);
      // hold: right arm, left arm, then both arms (2 blades)
      let maxOut=0;const sides=[];T.mouse.down=true;
      for(let k=0;k<30;k++){T.stepPlayer(1/30,1);for(const b of T.SpecterSwarm.blades)if(b.state==='launch'&&b.act&&!b.act.seen){b.act.seen=1;sides.push(b.act.side);}maxOut=Math.max(maxOut,T.SpecterSwarm.blades.filter(b=>b.state!=='idle').length);}
      T.mouse.down=false;r.sides=sides.join('');
      r.bladesOut=maxOut;r.launched=sides.length;
      T.stepPlayer(1/30,60);
      r.bladesHome=T.SpecterSwarm.blades.filter(b=>b.state==='idle').length;r.bladeHits=bz.filter(z=>z.hp<1e6).length;
      return r;
      
    });
    console.log(JSON.stringify(out.v55));
    const v = out.v55;
    assert.ok(v.pools === 1 && v.poolDmg >= 30 && v.poolDmg <= 50 && v.slowed && !v.bossSlowed, 'hell pool: ticks, slows commons, not bosses');
    assert.ok(v.clickNoThrow && v.thrown && v.busy && v.gunHidden && v.singleScythe && v.caughtAfter > 0.3 && v.caughtAfter < 6 && v.scytheHits >= 1 && v.freeAfter, 'scythe: click swings, hold throws, empty hand until caught');
    assert.ok(v.legion === 3 && v.legionHp.every(h => h === 80) && v.legionOnce === 3 && v.legionHit, 'infernal legion: last kills rise with 2x hp, once per flight, and fight');
    assert.ok(v.bladesOut >= 3 && v.bladesHome === 5 && v.sides.startsWith('rlrl'), 'specters: hold throws right, left, then both; all return');
    // Accessories on the character rig (third-person preview is built from the same code).
    out.models = await page.evaluate(() => !!DeadRecoilTest.PropModels.parts.get('acc_wing') && !!DeadRecoilTest.PropModels.parts.get('acc_tail'));
    console.log(JSON.stringify(out));
    for (const k of ['angel', 'demon']) {
      const r = out[k];
      assert.ok(r.lockedBefore100 && r.flying === k, `${k}: cast unlocks at 25 kills`);
      assert.ok(r.blastHit, `${k}: cast nova / hell pool damages nearby enemies`);
      if (k === 'angel') assert.ok(r.powerHits >= 1, `${k}: in-flight smite strikes enemies`);
      assert.ok(r.rose > 1.8 && r.chargeConsumed, `${k}: rises while flying, kills consumed`);
      assert.ok(r.ended && r.landed < 0.3, `${k}: flight ends after 15 s and lands`);
    }
    assert.ok(out.weapons.thrown && out.weapons.hellfire && out.weapons.spinning, 'secret weapon skills');
    assert.ok(out.models, 'Blender accessory models loaded');
    assert.deepEqual(errors, []);
    console.log('PASS secret classes/weapons');
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
