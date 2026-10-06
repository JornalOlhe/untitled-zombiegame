const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');

const skinPath = 'android/app/src/main/assets/textures/survivor-skin.png';
const skin = fs.readFileSync(skinPath);
const sha = crypto.createHash('sha256').update(skin).digest('hex');

// Exact 256x256 survivor skin produced by tools/skin/build_skin.py from the supplied
// FRONT/LEFT/BACK/RIGHT cargo-pants model sheet.
assert.equal(
  sha,
  'ea27aaa29ef226e4e54e7063b518ab0a819b6b722ffd48e33058e75a427746c6',
  'survivor skin must remain byte-identical to the approved reference sheet output'
);
console.log('PASS v53 survivor reference lock:', sha);
