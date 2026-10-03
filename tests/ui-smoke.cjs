const { chromium } = require('playwright');
async function diagnosticScreenshot(page, options) {
  try {
    await page.screenshot({ ...options, timeout: 8000 });
  } catch (e) {
    console.warn('diagnostic screenshot skipped:', e?.message || e);
  }
}
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
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.html') ? 'text/html' : filename.endsWith('.css') ? 'text/css' : filename.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    fs.mkdirSync('test-results', {recursive:true});
    for (const [width,height] of [[740,360],[915,412],[1280,720]]) {
      const context = await browser.newContext({ viewport:{width,height}, hasTouch:true, deviceScaleFactor:1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/?native=1&platform=android&test=1`);
      await page.waitForFunction(() => !!window.DeadRecoilTest, {timeout:30000});
      const walletGuard = await page.evaluate(() => {
        const T = DeadRecoilTest;
        const original = { ...T.Progression.economy.data };
        const account = { user: T.Account.user, userId: T.Account.userId, profile: T.Account.profile };
        try {
          T.Progression.economy.data.coins = 5000;
          T.Progression.economy.data.normal = 5;
          T.Progression.economy.data.lucky = 2;
          T.Account.applyNonSpending({
            ...T.Progression.economy.data,
            userId: 'wallet-test',
            username: 'wallet_test',
            displayName: 'Wallet Test',
            coins: 144,
            normal: 0,
            lucky: 0,
          });
          const afterStale = {
            coins: T.Progression.economy.data.coins,
            normal: T.Progression.economy.data.normal,
            lucky: T.Progression.economy.data.lucky,
          };
          T.Account.applyNonSpending({
            ...T.Progression.economy.data,
            coins: 5250,
            normal: 7,
            lucky: 3,
          });
          const afterReward = {
            coins: T.Progression.economy.data.coins,
            normal: T.Progression.economy.data.normal,
            lucky: T.Progression.economy.data.lucky,
          };
          return { afterStale, afterReward };
        } finally {
          T.Progression.economy.data = original;
          T.Account.user = account.user;
          T.Account.userId = account.userId;
          T.Account.profile = account.profile;
        }
      });
      assert.deepEqual(walletGuard.afterStale, { coins: 5000, normal: 5, lucky: 2 }, 'reward sync must never reduce wallet balances');
      assert.deepEqual(walletGuard.afterReward, { coins: 5250, normal: 7, lucky: 3 }, 'reward sync must still accept higher balances');
      assert.deepEqual(await page.evaluate(() => DeadRecoilTest.Progression.economy.rates.lucky), [0,0,0,58.9,37,3,1,0.1]);
      assert.equal(await page.evaluate(() => DeadRecoilTest.Progression.economy.rates.lucky.reduce((a,b)=>a+b,0)),100);
      assert.ok(await page.evaluate(() => DeadRecoilTest.Progression.economy.catalogs.weapon.some(item => item.tier === 6)), 'Divine weapon must exist');
      assert.ok(await page.evaluate(() => DeadRecoilTest.Progression.economy.catalogs.class.some(item => item.tier === 6)), 'Divine class must exist');
      assert.ok(await page.evaluate(() => DeadRecoilTest.Progression.economy.catalogs.weapon.some(item => item.tier === 7)), 'Secret weapon must exist');
      assert.ok(await page.evaluate(() => DeadRecoilTest.Progression.economy.catalogs.class.some(item => item.tier === 7)), 'Secret class must exist');
      const secretCatalog = await page.evaluate(() => ({
        classes: DeadRecoilTest.Progression.economy.catalogs.class.filter(item => item.tier === 7).map(item => item.name),
        weapons: DeadRecoilTest.Progression.economy.catalogs.weapon.filter(item => item.tier === 7).map(item => item.name),
        medic: DeadRecoilTest.Progression.economy.catalogs.class.find(item => item.name === 'Medic'),
        reaper: DeadRecoilTest.Progression.economy.catalogs.class.find(item => item.name === 'Reaper'),
      }));
      assert.deepEqual(secretCatalog.classes, ['Archangel','Archdemon']);
      assert.deepEqual(secretCatalog.weapons, ['Demonic Fury','Angelic Specter']);
      assert.equal(secretCatalog.medic.passiveOnly, true, 'Medic must stay passive-only');
      assert.equal(secretCatalog.reaper.cd, 15, 'Reaper cooldown must remain 15 s');
      assert.equal(await page.evaluate(() => DeadRecoilTest.Progression.economy.cost(false)), 50, 'Normal Spin must cost 50');
      assert.equal(await page.evaluate(() => DeadRecoilTest.Progression.economy.cost(true)), 250, 'Lucky Spin base cost must be 250');
      const pityMechanics = await page.evaluate(() => {
        const p = DeadRecoilTest.Progression;
        const e = p.economy;
        const original = JSON.parse(JSON.stringify(e.data));
        const originalRandom = e.random;
        const result = {};
        try {
          e.data.coins = 100000;
          // v32 pity: Normal +1, Lucky +2. Mythic 75, Divine 150, Secret 300.
          const set = (m, d, s) => { e.data.weaponMythicPity = m; e.data.weaponDivinePity = d; e.data.weaponSecretPity = s; };
          const snap = () => ({tier:roll?.item?.tier,mythic:e.data.weaponMythicPity,divine:e.data.weaponDivinePity,secret:e.data.weaponSecretPity});
          let roll;
          e.data.classMythicPity = 5; e.data.classDivinePity = 44; e.data.classSecretPity = 33;
          set(74, 10, 20); e.random = () => 0; roll = e.roll("weapon", false, "coins");
          result.normalMythic = {...snap(), classMythic:e.data.classMythicPity, classDivine:e.data.classDivinePity, classSecret:e.data.classSecretPity};
          set(73, 10, 20); e.random = () => 0; roll = e.roll("weapon", true, "coins"); result.luckyMythic = snap();
          set(72, 10, 20); e.random = () => 0; roll = e.roll("weapon", true, "coins"); result.luckyNotYet = snap();
          set(10, 149, 20); e.random = () => 0; roll = e.roll("weapon", false, "coins"); result.normalDivine = snap();
          set(10, 148, 20); e.random = () => 0; roll = e.roll("weapon", true, "coins"); result.luckyDivine = snap();
          set(10, 100, 299); e.random = () => 0; roll = e.roll("weapon", false, "coins"); result.normalSecret = snap();
          set(12, 12, 52); e.random = () => 0.975; roll = e.roll("weapon", true, "coins"); result.naturalMythic = snap();
          set(25, 25, 70); e.random = () => 0.99975; roll = e.roll("weapon", false, "coins"); result.naturalDivine = snap();
          result.saved = JSON.parse(e.storage.getItem(e.key) || "{}").weaponMythicPity;
        } finally {
          e.data = original;
          e.random = originalRandom;
          e.save();
        }
        return result;
      });
      assert.deepEqual(pityMechanics.normalMythic, {tier:5,mythic:0,divine:11,secret:21,classMythic:5,classDivine:44,classSecret:33}, '74/75 + Normal(+1) must guarantee Mythic, reset only Mythic, and leave Class pity untouched');
      assert.deepEqual(pityMechanics.luckyMythic, {tier:5,mythic:0,divine:12,secret:22}, '73/75 + Lucky(+2) must reach 75 and guarantee Mythic');
      assert.deepEqual(pityMechanics.luckyNotYet, {tier:3,mythic:74,divine:12,secret:22}, '72/75 + Lucky(+2) = 74 must NOT guarantee Mythic');
      assert.deepEqual(pityMechanics.normalDivine, {tier:6,mythic:0,divine:0,secret:21}, '149/150 + Normal must guarantee Divine and reset Divine + Mythic');
      assert.deepEqual(pityMechanics.luckyDivine, {tier:6,mythic:0,divine:0,secret:22}, '148/150 + Lucky must reach 150 and guarantee Divine');
      assert.deepEqual(pityMechanics.normalSecret, {tier:7,mythic:0,divine:0,secret:0}, '299/300 + Normal must guarantee Secret and reset every weapon pity');
      assert.deepEqual(pityMechanics.naturalMythic, {tier:5,mythic:0,divine:14,secret:54}, 'Natural Mythic resets only Mythic pity');
      assert.deepEqual(pityMechanics.naturalDivine, {tier:6,mythic:0,divine:0,secret:71}, 'Natural Divine resets Divine + Mythic pity');
      assert.equal(pityMechanics.saved, 0, 'Pity must persist to storage');
      await page.locator('#loadoutbtn').click();
      await page.locator('#classscreen:not(.hidden)').waitFor({state:'visible'});
      // Spin HUD (reference-video layout): left loadout column, full-screen character, right rarity
      // column, bottom-centre spin buttons — no block may overlap another or leave the viewport.
      const armoryLayout = await page.evaluate(() => {
        const box = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
        };
        return {
          hud: document.querySelector('#classscreen').classList.contains('spin-hud'),
          list: box('#armory-list'), bars: box('.rarity-bars'), canvas: box('#classpreview'),
          lucky: box('.spin-btn.lucky'), normal: box('.spin-btn.normal'), tabs: box('.armory-tabs'), back: box('#armory-back'),
          pity: box('#spin-pity'), buy: box('#spin-buy'), title: box('#armory-identity h2'),
          width: innerWidth, height: innerHeight,
        };
      });
      assert.ok(armoryLayout.hud, 'Armory must use the Spin HUD layout');
      assert.equal(await page.locator('#spin-buy').evaluate(el => getComputedStyle(el).display), 'none', 'Redundant BUY SPINS corner button must stay hidden');
      assert.ok(armoryLayout.canvas.width >= armoryLayout.width - 2 && armoryLayout.canvas.height >= armoryLayout.height - 2, `Character preview must be full-screen like the reference video ${JSON.stringify([armoryLayout.canvas,armoryLayout.width,armoryLayout.height])}`);
      assert.ok(armoryLayout.list.right < armoryLayout.lucky.left && armoryLayout.lucky.right < armoryLayout.bars.left, 'Left column, spin buttons and rarity column must stay ordered left-to-right');
      const blocks = ['list','bars','lucky','normal','tabs','back','pity','buy','title'];
      for (const k of blocks) { const r = armoryLayout[k]; assert.ok(r.left >= -2 && r.top >= -2 && r.right <= armoryLayout.width + 2 && r.bottom <= armoryLayout.height + 2, `${k} must stay inside the viewport`); }
      for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) { const a = armoryLayout[blocks[i]], c = armoryLayout[blocks[j]]; assert.ok(!(a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1), `${blocks[i]} and ${blocks[j]} must not overlap`); }
      assert.ok(armoryLayout.lucky.height >= 18 && armoryLayout.normal.height >= 18, 'Spin buttons must stay tappable');
      const previewRatio = await page.evaluate(() => {
        const preview = document.querySelector('#classpreview').getBoundingClientRect();
        const stage = document.querySelector('.survivor-stage').getBoundingClientRect();
        return {height:preview.height, stageHeight:stage.height, ratio:preview.height / Math.max(1, stage.height)};
      });
      assert.ok(previewRatio.height >= 100 && previewRatio.ratio >= 0.48, 'Armory preview must remain visually dominant on compact landscape screens');
      await page.locator('[data-odds-mode="lucky"]').click();
      const luckyRarities = await page.locator('#rarity-board [data-rarity-tier]').evaluateAll(items => items.map(el => el.textContent.trim().replace(/[+−]/g,'').replace(/\s+/g,' ')));
      assert.ok(luckyRarities.length === 5 && luckyRarities.every(text => /ÉPICO|LENDÁRIO|MÍTICO|DIVINO|SECRETA/.test(text)), 'Lucky Spin must expose only Epic+ tiers including Secret');
      assert.ok(luckyRarities.some(text => /DIVINO.*1%/.test(text)), 'Lucky Spin Divine chance must be 1%');
      assert.ok(luckyRarities.some(text => /SECRETA.*0[,.]1%/.test(text)), 'Lucky Spin Secret chance must be 0.1%');
      await page.locator('[data-rarity-tier="4"]').click();
      assert.ok(await page.locator('#rarity-board .rarity-items .rarity-item').count() > 0, 'Clicking a rarity must reveal its items');
      const preferredLayout = await page.evaluate(() => {
        const items=()=>[...document.querySelectorAll('#rarity-board .rarity-items .rarity-item')];
        const before=items().map(el=>el.dataset.previewId);
        const target=items()[Math.min(1,items().length-1)];
        const id=target.dataset.previewId, beforeIndex=before.indexOf(id);
        target.click();
        const after=items(), afterIds=after.map(el=>el.dataset.previewId), selected=after.find(el=>el.dataset.previewId===id);
        const badge=selected?.querySelector('em.boost');
        const result={beforeIndex,afterIndex:afterIds.indexOf(id),boost:!!badge,badgeColor:badge?getComputedStyle(badge).color:null,badgeBg:badge?getComputedStyle(badge).backgroundColor:null};
        selected?.click(); // restore no preference so deterministic spin tests below stay unchanged
        return result;
      });
      assert.equal(preferredLayout.afterIndex, preferredLayout.beforeIndex, 'x1.5 preference must not move the item downward');
      assert.ok(preferredLayout.boost && preferredLayout.badgeBg !== 'rgba(0, 0, 0, 0)', 'x1.5 preference must keep its highlighted badge styling');
      const confirmCompact = await page.evaluate(() => {
        const dlg=document.querySelector('#spin-confirm'), card=dlg.querySelector('.spin-confirm-card'), actions=dlg.querySelector('.spin-confirm-actions');
        dlg.classList.remove('hidden');
        const c=card.getBoundingClientRect(), a=actions.getBoundingClientRect(), out={top:c.top,bottom:c.bottom,actionsTop:a.top,actionsBottom:a.bottom,height:innerHeight};
        dlg.classList.add('hidden');
        return out;
      });
      assert.ok(confirmCompact.top <= Math.max(80, confirmCompact.height*0.25), `replacement dialog must start high enough on compact screens: ${JSON.stringify(confirmCompact)}`);
      assert.ok(confirmCompact.actionsBottom <= confirmCompact.height + 2, `proceed/cancel actions must not sit below the viewport: ${JSON.stringify(confirmCompact)}`);
      const armoryCopy = await page.locator('#classscreen').innerText();
      assert.ok(!/sacrificar|descartar resultado|eliminar resultado/i.test(armoryCopy), 'Old result/sacrifice flow must not be visible');
      const duplicateLoadout = await page.evaluate(async () => {
        const p = DeadRecoilTest.Progression;
        const original = JSON.parse(JSON.stringify(p.data));
        try {
          p.data.weaponSlotsOwned = 3;
          p.data.weaponSlots = [4, null, 4, null, null];
          p.data.weaponId = 4;
          p.data.weaponSlot = 2;
          p.data.pendingLoadout = {};
          p.render();
          const cards = [...document.querySelectorAll('#armory-list .slot-card')].slice(0,3);
          const selected = cards.map((card, i) => card.classList.contains('selected') ? i : -1).filter(i => i >= 0);
          const names = cards.map(card => card.querySelector('.slot-name')?.textContent || '');
          const target = p.spinTargetSlot('weapon', 4);
          await p.slotEquip('weapon', 0);
          return {
            slots: p.data.weaponSlots.slice(0,3),
            names,
            selected,
            duplicateCount: p.data.weaponSlots.slice(0,3).filter(id => id === 4).length,
            spinTarget: target,
            equippedAfterClick: p.data.weaponSlot,
            weaponAfterClick: p.data.weaponId,
          };
        } finally {
          p.economy.data = original;
          p.economy.save();
          p.render();
        }
      });
      assert.deepEqual(duplicateLoadout.slots, [4,0,4], 'Owned empty weapon slots must auto-fill with Machete');
      assert.equal(duplicateLoadout.names[1], 'Machete', 'Machete must visibly occupy an empty owned slot');
      assert.equal(duplicateLoadout.duplicateCount, 2, 'Duplicate weapons must coexist in different slots');
      assert.deepEqual(duplicateLoadout.selected, [2], 'Only the exact equipped duplicate slot may be highlighted');
      assert.equal(duplicateLoadout.spinTarget, 2, 'Rolling a duplicate weapon must replace the equipped slot, not jump to the old copy');
      assert.equal(duplicateLoadout.equippedAfterClick, 0, 'Equipping a duplicate must preserve exact slot identity');
      assert.equal(duplicateLoadout.weaponAfterClick, 4, 'Equipping a duplicate keeps the weapon id while changing slot identity');
      await diagnosticScreenshot(page, {path:`test-results/armory-${width}.png`});
      if (width === 1280) {
        const previousWeapon = await page.evaluate(() => {
          const p = DeadRecoilTest.Progression;
          p.data.lucky = 1;
          p.economy.random = () => 0.70;
          p.economy.save();
          p.render();
          return p.data.weaponId;
        });
        await page.locator('.spin-btn.lucky').click();
        await page.waitForFunction(() => (DeadRecoilTest.Armory.roll || DeadRecoilTest.Armory.lastRoll)?.result?.item?.tier === 4, {timeout:3000});
        // v28 spin (reference video): no reel overlay — title flicker, SKIP button, rarity burst.
        const spinMeta = await page.evaluate(() => ({
          duration: (DeadRecoilTest.Armory.roll || DeadRecoilTest.Armory.lastRoll).duration,
          skip: !!document.querySelector('#roll-controls [data-skip]') || (DeadRecoilTest.Armory.skipShown || 0) > 0,
          overlayHidden: document.querySelector('#roll-overlay').classList.contains('hidden'),
        }));
        assert.ok(spinMeta.duration >= 0.7 && spinMeta.duration <= 0.9, 'Spin flicker must follow the video table (~0.8 s)');
        assert.ok(spinMeta.skip, 'A SKIP button must replace the spin button while spinning');
        assert.ok(spinMeta.overlayHidden, 'The old reel overlay must stay hidden');
        await page.waitForFunction(() => !DeadRecoilTest.Progression.busy, null, {timeout:11000});
        assert.ok(await page.locator('#spin-confirm').evaluate(el => el.classList.contains('hidden')), 'Legendary result must equip directly with no confirmation');
        assert.notEqual(await page.evaluate(() => DeadRecoilTest.Progression.data.weaponId), previousWeapon, 'Legendary result must replace/equip automatically');
        const legendaryWeapon = await page.evaluate(() => DeadRecoilTest.Progression.data.weaponId);
        await page.evaluate(() => {
          const p = DeadRecoilTest.Progression;
          p.data.lucky = 1;
          p.economy.random = () => 0.995;
          p.economy.save();
          p.render();
        });
        await page.locator('.spin-btn.lucky').click();
        await page.waitForFunction(() => (DeadRecoilTest.Armory.roll || DeadRecoilTest.Armory.lastRoll)?.result?.item?.tier === 6, null, {timeout:3000});
        await page.waitForFunction(() => (DeadRecoilTest.Armory.fxCount || 0) >= 2, null, {timeout:8000});
        await page.waitForFunction(() => !DeadRecoilTest.Progression.busy, null, {timeout:11000});
        assert.ok(await page.locator('#spin-confirm').evaluate(el => el.classList.contains('hidden')), 'Winning Divine must not show a confirmation');
        assert.notEqual(await page.evaluate(() => DeadRecoilTest.Progression.data.weaponId), legendaryWeapon, 'Divine result must replace/equip automatically');
        await page.evaluate(() => {
          const p = DeadRecoilTest.Progression;
          p.data.lucky = 1;
          p.economy.random = () => 0.20;
          p.economy.save();
          p.render();
        });
        await page.locator('.spin-btn.lucky').click();
        await page.locator('#spin-confirm:not(.hidden)').waitFor({state:'visible',timeout:3000});
        assert.equal(await page.locator('#spin-confirm-title').textContent(),'Você deseja prosseguir?');
        assert.equal(await page.locator('#spin-confirm-rarity').textContent(),'DIVINO');
        assert.equal(await page.evaluate(() => DeadRecoilTest.Armory.roll), null, 'Protected Divine reroll must not start before confirmation');
        await diagnosticScreenshot(page, {path:'test-results/armory-confirm-1280.png'});
        await page.locator('#spin-confirm-cancel').click();
        await page.locator('#spin-confirm').waitFor({state:'hidden',timeout:3000});
        await page.evaluate(() => { DeadRecoilTest.Progression.economy.random = Math.random; });
        await diagnosticScreenshot(page, {path:'test-results/armory-equipped-1280.png'});
      }
      await page.locator('#armory-back').click();
      await page.locator('#menu:not(.hidden)').waitFor({state:'visible'});
      const screenState = await page.evaluate(() => {
        const screens = [...document.querySelectorAll('.screen')];
        return {
          visible: screens.filter(el => !el.classList.contains('hidden')).map(el => el.id),
          hiddenInteractive: screens.filter(el => el.classList.contains('hidden') && (!el.inert || el.getAttribute('aria-hidden') !== 'true')).map(el => el.id),
        };
      });
      assert.deepEqual(screenState.visible, ['menu'], 'screen transitions must leave exactly one menu visible');
      assert.deepEqual(screenState.hiddenInteractive, [], 'hidden menus must be inert and aria-hidden');
      await page.locator('#play').click();
      await page.locator('#solo').click();
      await page.locator('#backclass').click();
      await page.locator('#playscreen:not(.hidden)').waitFor({state:'visible'});
      assert.ok(await page.locator('#classscreen').evaluate(el=>el.classList.contains('hidden')), 'Map Back must return one step to Play, never open Loadout');
      await page.locator('#solo').click();
      const cards = await page.locator('#mapcards > button').evaluateAll(items => items.map(el => ({top:el.getBoundingClientRect().top,width:el.getBoundingClientRect().width})));
      assert.equal(cards.length,5);
      assert.ok(cards.every(c => Math.abs(c.top-cards[0].top)<2 && c.width>=140), 'Maps must remain in one horizontal row');
      await page.locator('[data-map="4"]').click();
      await diagnosticScreenshot(page, {path:`test-results/maps-${width}.png`});
      await page.locator('#nextmode').click();
      await page.locator('[data-choice="mode"][data-value="timed"]').click();
      await page.locator('[data-choice="difficulty"][data-value="easy"]').click();
      assert.equal(await page.locator('#mode').inputValue(),'timed');
      await page.locator('#backmaps').click();
      assert.equal(await page.locator('[data-map="4"]').getAttribute('aria-pressed'),'true');
      await page.locator('#nextmode').click();
      assert.equal(await page.locator('#difficulty').inputValue(),'easy');
      await page.locator('#rulescreen:not(.hidden)').waitFor({state:'visible'});
      await page.waitForTimeout(220);
      assert.equal(await page.locator('#chosenmap').textContent(),'Zona selecionada: Arctic Base');
      assert.ok(await page.locator('#rulescreen .rules-grid').isVisible(), 'Rules UI must be visible after its entrance animation');
      await diagnosticScreenshot(page, {path:`test-results/rules-${width}.png`});
      await page.locator('#deploy').click();
      await page.waitForFunction(() => DeadRecoilTest.state === DeadRecoilTest.GameState.PLAYING);
      assert.equal(await page.evaluate(() => DeadRecoilTest.player.maxhp),150);
      const before = await page.evaluate(() => DeadRecoilTest.player.pos.z);
      await page.keyboard.down('KeyW');
      // Software GL compiles the map shaders on the first frames; give movement a few seconds.
      const moved = await page.waitForFunction(z => DeadRecoilTest.player.pos.z !== z, before, { timeout: 8000 }).then(() => true, () => false);
      await page.keyboard.up('KeyW');
      assert.ok(moved, 'Player must move');
      await diagnosticScreenshot(page, {path:`test-results/game-${width}.png`});
      await page.evaluate(() => document.dispatchEvent(new Event('deadrecoil-native-pause')));
      await page.waitForFunction(() => DeadRecoilTest.state === DeadRecoilTest.GameState.PAUSED);
      // Settings sliders: the visual fill is (value - min) / (max - min) — MIN empty, MAX full.
      await page.locator('#pausesettings').click();
      await page.locator('[data-settings-tab="audio"]').click();
      const sliders = await page.evaluate(() => {
        const out = {};
        const probe = (key) => {
          const el = document.querySelector(`[data-setting="${key}"]`);
          const res = {};
          const min = Number(el.min), max = Number(el.max);
          for (const [label, v] of [['min', min], ['q1', min + (max - min) * 0.25], ['mid', min + (max - min) * 0.5], ['q3', min + (max - min) * 0.75], ['max', max]]) {
            el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true }));
            const r = el.getBoundingClientRect();
            res[label] = { fill: el.style.getPropertyValue('--range-fill'), progress: Number(el.style.getPropertyValue('--range-progress')), out: document.querySelector(`[data-out="${key}"]`)?.textContent, w: r.width };
          }
          el.value = String(DR.Settings.defaults[key] ?? max); el.dispatchEvent(new Event('input', { bubbles: true }));
          return res;
        };
        out.master = probe('master');
        document.querySelector('[data-settings-tab="camera"]').click();
        out.fov = probe('fov'); out.sensitivity = probe('sensitivity');
        document.querySelector('[data-settings-tab="graphics"]').click();
        out.resolution = probe('resolution');
        return out;
      });
      for (const [k, s] of Object.entries(sliders)) {
        assert.equal(s.min.fill, '0%', `slider ${k}: MIN is empty`);
        assert.equal(s.max.fill, '100%', `slider ${k}: MAX is completely full`);
        assert.ok(Math.abs(s.q1.progress - 0.25) < 0.02 && Math.abs(s.mid.progress - 0.5) < 0.02 && Math.abs(s.q3.progress - 0.75) < 0.02, `slider ${k}: 25/50/75% progress`);
      }
      assert.equal(sliders.master.max.out, '100%');
      await page.evaluate(() => { if (DeadRecoilTest.state !== DeadRecoilTest.GameState.PAUSED) DeadRecoilTest.pause(); });
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}x${height}: maps, modes, difficulty, deployment, movement, pause, no JS errors`);
      await context.close();
    }
    {
      // Desktop (mouse) context for the Pointer Lock / mouse-look regression.
      const context = await browser.newContext({ viewport:{width:1280,height:720}, deviceScaleFactor:1 });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
      await page.waitForFunction(() => !!window.DeadRecoilTest, {timeout:30000});
      // Mouse-look state machine (headless browsers can't take Pointer Lock, so this drives the
      // compatibility source): one source per state, nothing moves in menus, spikes/NaN dropped,
      // the capture click never fires.
      const look = await page.evaluate(async () => {
        const T = DeadRecoilTest;
        T.setMap(0); T.PlayerController.start(); T.pause();
        const world = document.getElementById('world');
        const move = (x, y) => world.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const res = {};
        T.resume(); await wait(120);
        res.afterResume = T.mouseMode();
        const y0 = T.getYaw(); move(300, 200); move(340, 200); res.unlockedMoves = T.getYaw() !== y0;
        world.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
        res.captureClickFired = T.mouse.down; await wait(80);
        // Headless Chromium grants Pointer Lock: the capture click leads to LOCKED.
        await wait(120);
        res.capturedMode = T.mouseMode();
        const moveBy = (dx) => world.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: dx, movementY: 0 }));
        const yl = T.getYaw(); moveBy(25); res.lockedMoves = T.getYaw() !== yl;
        // Compatibility source (lock unavailable): only cursor deltas over the arena.
        document.exitPointerLock(); await wait(60);
        T.resume(); T.lockState({ lockPending: false, fallback: true }); T.MouseLook.quiet(0); await wait(5);
        res.fallbackMode = T.mouseMode();
        move(300, 200); const y1 = T.getYaw(); move(330, 200); res.fallbackMoves = T.getYaw() !== y1;
        T.freeMouse(true); const y2 = T.getYaw(); move(400, 200); move(420, 200); res.freedMoves = T.getYaw() !== y2; res.freedMode = T.mouseMode();
        T.freeMouse(false); await wait(120);
        T.pause(); const y3 = T.getYaw(); move(100, 100); move(500, 400); res.pausedMoves = T.getYaw() !== y3; res.pausedMode = T.mouseMode();
        res.nan = T.MouseLook.filter(NaN, 1, performance.now()) === null && T.MouseLook.filter(Infinity, 0, performance.now()) === null;
        T.MouseLook.lastMag = 5; res.spike = T.MouseLook.filter(900, 0, T.MouseLook.lastAt + 10) === null;
        T.MouseLook.lastMag = 0; let ok = true; for (const d of [60, 180, 320, 400, 260, 90]) ok = ok && !!T.MouseLook.filter(d, 0, T.MouseLook.lastAt + 8); res.flick = ok;
        return res;
      });
      assert.equal(look.afterResume, 'UNLOCKED', 'resume waits for a click to capture');
      assert.ok(!look.unlockedMoves, 'no camera movement before capture');
      assert.ok(!look.captureClickFired, 'the capture click never fires the weapon');
      // Local headless Chromium grants Pointer Lock; the CI runner's may not. When it is granted the
      // locked path must move the camera; otherwise the compatibility path below covers look.
      if (look.capturedMode === 'LOCKED') assert.ok(look.lockedMoves, 'Pointer Lock moves the camera');
      else console.log(`note: Pointer Lock not granted here (${look.capturedMode}); fallback path checked below`);
      assert.ok(look.fallbackMode === 'FALLBACK' && look.fallbackMoves, 'compatibility mode moves the camera');
      assert.ok(!look.freedMoves && look.freedMode === 'MENU', 'freed mouse never moves the camera');
      assert.ok(!look.pausedMoves && look.pausedMode === 'MENU', 'no camera movement in menus');
      assert.ok(look.nan && look.spike && look.flick, 'NaN and isolated spikes are rejected, real flicks are kept');
      assert.deepEqual(errors,[]);
      console.log('PASS mouse-look state machine');
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });
