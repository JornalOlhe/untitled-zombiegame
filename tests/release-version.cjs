const assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('android/app/src/main/assets/index.html','utf8');
const gradle=fs.readFileSync('android/app/build.gradle','utf8');
const desktop=JSON.parse(fs.readFileSync('desktop/package.json','utf8')).version;
const game=html.match(/const GAME_VERSION = "([^"]+)"/)[1];
const android=gradle.match(/versionName '([^']+)'/)[1];
assert.equal(game,desktop,'WebView READY version must match installed desktop version');
assert.equal(game,android,'WebView READY version must match installed Android version');
console.log('PASS release version identity:',game);
