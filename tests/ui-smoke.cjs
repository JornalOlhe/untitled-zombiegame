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
