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
      assert.deepEqual(await page.evaluate(() => DeadRecoilTest.Progression.economy.rates.lucky), [0,0,0,59,37,3,1]);
      assert.equal(await page.evaluate(() => DeadRecoilTest.Progression.economy.rates.lucky.reduce((a,b)=>a+b,0)),100);
      assert.ok(await page.evaluate(() => DeadRecoilTest.Progression.economy.catalogs.weapon.some(item => item.tier === 6)), 'Divine weapon must exist');
      assert.ok(await page.evaluate(() => DeadRecoilTest.Progression.economy.catalogs.class.some(item => item.tier === 6)), 'Divine class must exist');
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
          e.data.classMythicPity = 33;
          e.data.classDivinePity = 44;
          e.data.weaponMythicPity = 74;
          e.data.weaponDivinePity = 20;
          e.random = () => 0;
          let roll = e.roll("weapon", false, "coins");
          result.normalMythic = {tier:roll?.item?.tier,mythic:e.data.weaponMythicPity,divine:e.data.weaponDivinePity,classMythic:e.data.classMythicPity,classDivine:e.data.classDivinePity};

          e.data.weaponMythicPity = 10;
          e.data.weaponDivinePity = 149;
          e.random = () => 0;
          roll = e.roll("weapon", false, "coins");
          result.normalDivine = {tier:roll?.item?.tier,mythic:e.data.weaponMythicPity,divine:e.data.weaponDivinePity};

          e.data.weaponMythicPity = 73;
          e.data.weaponDivinePity = 40;
          e.random = () => 0;
          roll = e.roll("weapon", true, "coins");
          result.luckyMythic = {tier:roll?.item?.tier,mythic:e.data.weaponMythicPity,divine:e.data.weaponDivinePity};

          e.data.weaponMythicPity = 12;
          e.data.weaponDivinePity = 52;
          e.random = () => 0.975;
          roll = e.roll("weapon", true, "coins");
          result.naturalMythic = {tier:roll?.item?.tier,mythic:e.data.weaponMythicPity,divine:e.data.weaponDivinePity};

          e.data.weaponMythicPity = 25;
          e.data.weaponDivinePity = 70;
          e.random = () => 0.99975;
          roll = e.roll("weapon", false, "coins");
          result.naturalDivine = {tier:roll?.item?.tier,mythic:e.data.weaponMythicPity,divine:e.data.weaponDivinePity};
        } finally {
          e.data = original;
          e.random = originalRandom;
          e.save();
        }
        return result;
      });
      assert.deepEqual(pityMechanics.normalMythic, {tier:5,mythic:0,divine:21,classMythic:33,classDivine:44}, '74/75 + Normal must guarantee Mythic+ and leave Class pity untouched');
      assert.deepEqual(pityMechanics.normalDivine, {tier:6,mythic:0,divine:0}, '149/150 + Normal must guarantee Divine and reset both weapon pities');
      assert.deepEqual(pityMechanics.luckyMythic, {tier:5,mythic:0,divine:42}, '73/75 + Lucky must add 2 pity and guarantee Mythic+');
      assert.deepEqual(pityMechanics.naturalMythic, {tier:5,mythic:0,divine:54}, 'Natural Mythic must reset only Mythic pity while Divine keeps +2');
      assert.deepEqual(pityMechanics.naturalDivine, {tier:6,mythic:0,divine:0}, 'Natural Divine must reset Mythic and Divine pity');
      await page.locator('#loadoutbtn').click();
      await page.locator('#classscreen:not(.hidden)').waitFor({state:'visible'});
      const armoryLayout = await page.evaluate(() => {
        const box = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};
        };
        return {
          inventory: box('.armory-inventory'),
          stage: box('.survivor-stage'),
          details: box('.armory-details'),
          footer: box('.armory-footer'),
          controls: box('#roll-controls'),
          width: innerWidth,
          height: innerHeight,
        };
      });
      assert.ok(armoryLayout.inventory.width > 100 && armoryLayout.stage.width > 180 && armoryLayout.details.width > 140, 'All three Armory columns must remain usable');
      assert.ok(armoryLayout.inventory.left < armoryLayout.stage.left && armoryLayout.stage.left < armoryLayout.details.left, 'Armory columns must stay ordered left-to-right');
      assert.ok(Math.abs(armoryLayout.inventory.top - armoryLayout.stage.top) < 30 && Math.abs(armoryLayout.stage.top - armoryLayout.details.top) < 30, 'Armory columns must remain on the same row');
      assert.ok(armoryLayout.details.right <= armoryLayout.width + 2 && armoryLayout.inventory.left >= -2, 'Armory columns must stay inside the viewport');
      assert.ok(armoryLayout.controls.bottom <= armoryLayout.footer.top + 2, 'Spin controls must not be covered by the footer');
      const previewRatio = await page.evaluate(() => {
        const preview = document.querySelector('#classpreview').getBoundingClientRect();
        const stage = document.querySelector('.survivor-stage').getBoundingClientRect();
        return {height:preview.height, stageHeight:stage.height, ratio:preview.height / Math.max(1, stage.height)};
      });
      assert.ok(previewRatio.height >= 100 && previewRatio.ratio >= 0.48, 'Armory preview must remain visually dominant on compact landscape screens');
      await page.locator('[data-odds-mode="lucky"]').click();
      const luckyRarities = await page.locator('#rarity-board [data-rarity-tier]').evaluateAll(items => items.map(el => el.textContent.trim().replace(/[+−]/g,'').replace(/\s+/g,' ')));
      assert.ok(luckyRarities.length === 4 && luckyRarities.every(text => /ÉPICO|LENDÁRIO|MÍTICO|DIVINO/.test(text)), 'Lucky Spin must expose only Epic+ tiers including Divine');
      assert.ok(luckyRarities.some(text => /DIVINO.*1%/.test(text)), 'Lucky Spin Divine chance must be 1%');
      await page.locator('[data-rarity-tier="4"]').click();
      assert.ok(await page.locator('#rarity-board .rarity-items .rarity-item').count() > 0, 'Clicking a rarity must reveal its items');
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
      await page.screenshot({path:`test-results/armory-${width}.png`});
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
        await page.waitForFunction(() => DeadRecoilTest.Armory.roll?.result?.item?.tier === 4, {timeout:3000});
        const reelMeta = await page.evaluate(() => ({
          targetIndex: DeadRecoilTest.Armory.roll.targetIndex,
          targetOffset: DeadRecoilTest.Armory.roll.targetOffset,
          edgeOffset: DeadRecoilTest.Armory.roll.edgeOffset,
          cardStep: DeadRecoilTest.Armory.roll.cardStep,
          cards: document.querySelectorAll('#roll-strip .reel-card').length
        }));
        assert.ok(reelMeta.targetIndex >= 38 && reelMeta.targetIndex <= 48, 'Spin target index must vary inside the long reel');
        assert.ok(reelMeta.cards >= reelMeta.targetIndex + 24, 'Spin reel must keep a long visual buffer after the winner');
        assert.equal(reelMeta.targetOffset, reelMeta.targetIndex * reelMeta.cardStep, 'Every result must finish exactly centered under the marker');
        assert.ok(Math.abs(reelMeta.edgeOffset - reelMeta.targetOffset) >= 45, 'Spin must be able to brake near a card edge before centering');
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
        await page.waitForFunction(() => DeadRecoilTest.Armory.roll?.result?.item?.tier === 6, null, {timeout:3000});
        await page.waitForFunction(() => document.querySelector('#roll-overlay')?.classList.contains('divine-win'), null, {timeout:8000});
        assert.ok(await page.locator('#roll-overlay').evaluate(el => el.classList.contains('divine-win')), 'Divine result must trigger the dedicated celebration');
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
        await page.screenshot({path:'test-results/armory-confirm-1280.png'});
        await page.locator('#spin-confirm-cancel').click();
        await page.locator('#spin-confirm').waitFor({state:'hidden',timeout:3000});
        await page.evaluate(() => { DeadRecoilTest.Progression.economy.random = Math.random; });
        await page.screenshot({path:'test-results/armory-equipped-1280.png'});
      }
      await page.locator('#armory-back').click();
      await page.locator('#menu:not(.hidden)').waitFor({state:'visible'});
      await page.locator('#play').click();
      await page.locator('#solo').click();
      const cards = await page.locator('#mapcards > button').evaluateAll(items => items.map(el => ({top:el.getBoundingClientRect().top,width:el.getBoundingClientRect().width})));
      assert.equal(cards.length,5);
      assert.ok(cards.every(c => Math.abs(c.top-cards[0].top)<2 && c.width>=140), 'Maps must remain in one horizontal row');
      await page.locator('[data-map="4"]').click();
      await page.screenshot({path:`test-results/maps-${width}.png`});
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
      await page.screenshot({path:`test-results/rules-${width}.png`});
      await page.locator('#deploy').click();
      await page.waitForFunction(() => DeadRecoilTest.state === DeadRecoilTest.GameState.PLAYING);
      assert.equal(await page.evaluate(() => DeadRecoilTest.player.maxhp),150);
      const before = await page.evaluate(() => DeadRecoilTest.player.pos.z);
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(800);
      await page.keyboard.up('KeyW');
      assert.notEqual(await page.evaluate(() => DeadRecoilTest.player.pos.z), before, 'Player must move');
      await page.screenshot({path:`test-results/game-${width}.png`});
      await page.evaluate(() => document.dispatchEvent(new Event('deadrecoil-native-pause')));
      await page.waitForFunction(() => DeadRecoilTest.state === DeadRecoilTest.GameState.PAUSED);
      assert.deepEqual(errors,[]);
      console.log(`PASS ${width}x${height}: maps, modes, difficulty, deployment, movement, pause, no JS errors`);
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode=1; });
