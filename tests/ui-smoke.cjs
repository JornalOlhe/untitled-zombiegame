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
      await page.locator('#classesbtn').click();
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
          cardStep: DeadRecoilTest.Armory.roll.cardStep,
          cards: document.querySelectorAll('#roll-strip .reel-card').length
        }));
        assert.ok(reelMeta.targetIndex >= 38 && reelMeta.targetIndex <= 48, 'Spin target index must vary inside the long reel');
        assert.ok(reelMeta.cards >= reelMeta.targetIndex + 24, 'Spin reel must keep a long visual buffer after the winner');
        assert.ok(Math.abs(reelMeta.targetOffset - reelMeta.targetIndex * reelMeta.cardStep) <= 38, 'Winner stop must stay inside a safe randomized card zone');
        await page.locator('#spin-confirm:not(.hidden)').waitFor({state:'visible',timeout:10000});
        assert.equal(await page.locator('#spin-confirm-rarity').textContent(),'LENDÁRIO');
        await page.waitForTimeout(220);
        await page.screenshot({path:'test-results/armory-confirm-1280.png'});
        await page.locator('#spin-confirm-accept').click();
        await page.locator('#spin-confirm').waitFor({state:'hidden',timeout:5000});
        assert.notEqual(await page.evaluate(() => DeadRecoilTest.Progression.data.weaponId), previousWeapon, 'Legendary confirmation must replace/equip the rolled weapon');
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
        assert.ok(await page.locator('#spin-confirm').evaluate(el => el.classList.contains('hidden')), 'Divine must auto-equip without the Legendary/Mythic confirmation');
        assert.notEqual(await page.evaluate(() => DeadRecoilTest.Progression.data.weaponId), legendaryWeapon, 'Divine spin must replace/equip automatically');
        await page.evaluate(() => { DeadRecoilTest.Progression.economy.random = Math.random; });
        await page.screenshot({path:'test-results/armory-equipped-1280.png'});
      }
      await page.locator('#armory-back').click();
      await page.locator('#menu:not(.hidden)').waitFor({state:'visible'});
      await page.locator('#play').click();
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
