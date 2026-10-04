const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.resolve(root,'.'+(q.url.split('?')[0]==='/'?'/index.html':q.url.split('?')[0]));if(!f.startsWith(root+path.sep))return r.writeHead(403).end();fs.readFile(f,(e,d)=>{if(e)return r.writeHead(404).end();r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':'text/html');r.end(d);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage({viewport:{width:320,height:180}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await page.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,null,{timeout:90000});
const rows=await page.evaluate(()=>{const T=DeadRecoilTest,rows=[];T.SettingsManager.data.graphics='low';T.SettingsManager.apply();T.setMap(4);T.PlayerController.start();T.pause();for(let i=0;i<4;i++){T.MapManager.build(4);T.scene.updateMatrixWorld(true);T.renderer.render(T.scene,T.camera);rows.push({...T.renderer.info.memory});}return rows;});
console.log(JSON.stringify(rows));assert.deepEqual(rows.at(-1),rows[1],'rebuilding same map must release old geometry and textures');assert.deepEqual(errors,[]);console.log('PASS repeated map resource lifecycle');
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1});
