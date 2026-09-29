// Developer Mode: 10 tabs render, every old command still reachable, debug overlay draws and hides.
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve('android/app/src/main/assets');
const server=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]));fs.readFile(f,(e,d)=>{if(e){r.writeHead(404).end();return;}r.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');r.end(d)})});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));
const b=await chromium.launch({executablePath:process.env.PW_CHROMIUM||undefined,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const p=await b.newPage({viewport:{width:900,height:600}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${server.address().port}/?test=1`);await p.waitForFunction(()=>window.DeadRecoilTest?.WeaponModels?.ready,{timeout:90000});
const res=await p.evaluate(()=>{const T=DeadRecoilTest,D=T.DevMode,out={};
 D.active=D.allowed=true;T.setMap(4);T.PlayerController.start();
 D.ensureUi();D.open=true;
 const tabs=['player','weapons','classes','zombies','bosses','maps','waves','economy','debug','performance'];
 out.tabs={};
 for(const t of tabs){D.tab=t;D.render();out.tabs[t]=document.querySelector('#devmenu .dv-body').innerText.length;}
 out.nav=document.querySelectorAll('#devmenu nav button').length;
 // commands
 D.tab='zombies';D.act('zmap:2',document.createElement('div'));out.zmap=D.zombieMap;
 D.act('spawn-type:0',document.createElement('div'));D.act('perf-stress',document.createElement('div'));
 out.alive=T.ZombieManager.list.length;
 D.act('zmap:-1',document.createElement('div'));
 D.act('spawn-boss:yeti',document.createElement('div'));
 // debug overlay
 for(const k of T.DebugDraw.KEYS)D.flags[k]=true;
 T.DebugDraw.update();out.lines=T.DebugDraw.n;out.visible=T.DebugDraw.mesh?.visible;
 for(const k of T.DebugDraw.KEYS)D.flags[k]=false;
 T.DebugDraw.update();out.hidden=T.DebugDraw.mesh?.visible===false;
 return out;});
console.log(JSON.stringify(res));
const bad=[...errs];
for(const [t,n] of Object.entries(res.tabs))if(n<20)bad.push('tab '+t+' empty');
if(res.nav!==10)bad.push('nav has '+res.nav+' tabs');
if(res.zmap!==2)bad.push('zombie map variant not set');
if(res.alive<41)bad.push('stress spawn failed '+res.alive);
if(!res.visible||res.lines<1)bad.push('debug overlay drew nothing');
if(!res.hidden)bad.push('overlay not hidden when flags off');
await b.close();server.close();
if(bad.length){console.error('FAIL\n'+bad.join('\n'));process.exit(1);}
console.log('PASS dev mode tabs');})().catch(e=>{console.error(e);process.exit(1);});
