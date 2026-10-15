const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve('android/app/src/main/assets');
const server = http.createServer((q,r)=>{
  const f=path.resolve(root,'.'+(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0]));
  if(!f.startsWith(root+path.sep)) return r.writeHead(403).end();
  fs.readFile(f,(e,d)=>{if(e)return r.writeHead(404).end();r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(d);});
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:640,height:360}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);
    await page.waitForFunction(()=>!!window.DeadRecoilTest, null, {timeout:60000});
    await page.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready, null, {timeout:90000});
    const r=await page.evaluate(async()=>{
      const T=DeadRecoilTest,V=THREE.Vector3;
      T.setMap(0);T.setMode('classic');T.setDifficulty('easy');T.PlayerController.start();
      await new Promise(r=>{const i=setInterval(()=>{if(T.state===T.GameState.PLAYING){clearInterval(i);r()}},100)});
      const w=()=>({player:T.player.coins,prog:T.Progression.data.coins,hud:document.getElementById('wallethud').textContent.split('↻')[0]});
      const before=w();
      T.WaveManager.remaining=0;T.ZombieManager.clear();
      const a=T.ZombieManager.spawn(0,null,new V(T.player.pos.x+3,0,T.player.pos.z-4));
      T.ZombieManager.hit(a,99999,true,a.group.position.clone().add(new V(0,1.7,0)),T.WeaponSystem.current());
      const after=w();
      await new Promise(r=>setTimeout(r,400));const hudLater=w();
      T.UIManager.menu?T.UIManager.menu():null;
      await new Promise(r=>setTimeout(r,800));
      const P2={prog:T.Progression.data.coins,player:T.player.coins,signed:T.Account.signedIn?.(),run:!!T.Account.run};
      return {P2,before,after,hudLater,state:T.state,chip2:document.getElementById("profilechip").textContent.replace(/\s+/g," "),chip:document.getElementById('profilechip').textContent.replace(/\s+/g,' ')};
    });
    assert.ok(r.after.player>r.before.player,'kill pays coins immediately '+JSON.stringify(r));
    assert.equal(r.after.hud,'◈ '+r.after.player,'in-run HUD shows live wallet');
    assert.equal(r.state,'MENU');
    assert.ok(r.chip.includes('◈ '+r.P2.prog),'lobby chip shows the coins earned in the run '+r.chip);
    assert.deepEqual(errors,[]);
    console.log('PASS economy lobby',JSON.stringify(r));
  } finally { await browser.close(); server.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
