const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve('android/app/src/main/assets');
const type=f=>f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.jpg')?'image/jpeg':'text/html';
const server=http.createServer((q,r)=>{const f=path.resolve(root,'.'+(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0]));if(!f.startsWith(root+path.sep))return r.writeHead(403).end();fs.readFile(f,(e,d)=>{if(e)return r.writeHead(404).end();r.setHeader('Content-Type',type(f));r.end(d);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:960,height:432}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
  await page.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,null,{timeout:180000});
  // Catalogue + stat rule (must match private.artifact_coin on the server).
  const cat=await page.evaluate(()=>{const A=DeadRecoilTest.Artifacts;localStorage.removeItem(A.KEY);
    return {n:A.ids().length,secrets:Object.keys(A.SECRETS).length,fd:A.info('fortuna_d').stats.coins,ve:A.info('vida_e').stats,sl:A.info('seiva_l').stats,vl:A.info('vento_l').stats,md:A.info('municao_d').stats,tiers:A.TIERS.map(t=>t.name)};});
  assert.equal(cat.n,40,'5 families × 6 rarities + 10 secrets');
  assert.equal(cat.secrets,10,'2 secret artifacts per map');
  assert.deepEqual(cat.tiers,['Comum','Incomum','Raro','Épico','Lendário','Divino']);
  assert.equal(cat.fd,30);assert.deepEqual(cat.ve,{hp:20,coins:5});assert.equal(cat.sl.coins,5);assert.equal(cat.vl.coins,undefined);assert.equal(cat.md.coins,8);
  // Slots, equip limit, crafting (visitor, local).
  const flow=await page.evaluate(async()=>{const T=DeadRecoilTest,A=T.Artifacts;
    A.saveLocal({owned:{vida_c:1,vento_r:1},pieces:{secret_3a:5},slots:1,equipped:[],challenges:[]});
    await A.equip('vida_c');await A.equip('vento_r');const afterFull=A.data().equipped.slice();
    T.Progression.data.coins=20000;await A.buySlot();await A.equip('vento_r');
    await A.craft('secret_3a');
    return {afterFull,eq:A.data().equipped,slots:A.data().slots,coins:T.Progression.data.coins,secret:A.count('secret_3a'),pieces:A.pieces('secret_3a'),tot:A.totals(),locked:T.Challenges.unlocked(0,2)};});
  assert.deepEqual(flow.afterFull,['vida_c'],'second artifact refused while only 1 slot');
  assert.deepEqual(flow.eq,['vida_c','vento_r']);assert.equal(flow.slots,2);assert.equal(flow.coins,8000,'2nd slot costs 12.000');
  assert.equal(flow.secret,1);assert.equal(flow.pieces,0);assert.equal(flow.tot.hp,6);assert.equal(flow.tot.speed,7);
  assert.equal(flow.locked,false,'challenge 2 locked until challenge 1 is cleared');
  // Map → Challenges tab → play → artifacts applied → win drops an artifact.
  await page.click('#play');await page.click('[data-world-map="0"]');
  assert.deepEqual(await page.locator('#stage-tabs [data-stage-tab]').evaluateAll(b=>b.map(x=>x.dataset.stageTab)),['story','challenge','infinite']);
  await page.click('[data-stage-tab="challenge"]');
  assert.equal(await page.locator('#stage-list [data-chal]').count(),5);
  await page.click('#stage-play');
  await page.waitForFunction(()=>DeadRecoilTest.state===DeadRecoilTest.GameState.PLAYING,null,{timeout:120000});
  const run=await page.evaluate(()=>{const T=DeadRecoilTest;return {active:T.Challenges.active(),hp:T.RunMods.art.hp,speed:T.Challenges.rules().speed,mult:T.RunMods.mult('maxHp')};});
  assert.equal(run.active,true);assert.equal(run.hp,6);assert.equal(run.speed,1.25);assert.ok(Math.abs(run.mult-1.06)<1e-9);
  await page.evaluate(()=>{const T=DeadRecoilTest;T.WaveManager.wave=10;T.PlayerController.end(true,true,'challenge');});
  await page.waitForFunction(()=>document.querySelector('#gameoverscreen .loot-card'),null,{timeout:10000});
  const end=await page.evaluate(()=>({title:document.getElementById('endtitle').textContent,clears:DeadRecoilTest.Artifacts.clears(0,1),unlocked:DeadRecoilTest.Challenges.unlocked(0,2)}));
  assert.match(end.title,/CHALLENGE CONCLUÍDO/);assert.equal(end.clears,1);assert.equal(end.unlocked,true);
  // Personalizar › Equipamentos
  await page.evaluate(()=>DeadRecoilTest.GearUI.open());
  await page.locator('#gearscreen:not(.hidden)').waitFor();
  assert.equal(await page.locator('#gear-grid .gear-card').count(),40);
  assert.equal(await page.locator('#gear-slots .gear-slot.full').count(),2);
  assert.deepEqual(errors,[]);
  console.log('PASS artifacts: catalogue, slots, equip, craft, challenge tab, run modifiers, drop, Equipamentos');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
