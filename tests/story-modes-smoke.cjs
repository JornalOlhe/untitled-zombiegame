const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('android/app/src/main/assets/index.html','utf8');
const backend = fs.readFileSync('android/app/src/main/assets/js/data/Backend.js','utf8');
const migration = fs.readFileSync('supabase/migrations/20261004225500_v48_story_modes.sql','utf8');

const has = (src, needle, message) => assert.ok(src.includes(needle), message + ' (missing: ' + needle + ')');

// Flow: mode -> map -> difficulty -> Story level only for Story.
assert.ok(html.indexOf('id="modescreen"') < html.indexOf('id="mapscreen"'), 'mode selection must come before maps');
assert.ok(html.indexOf('id="mapscreen"') < html.indexOf('id="rulescreen"'), 'map selection must come before difficulty');
assert.ok(html.indexOf('id="rulescreen"') < html.indexOf('id="storyscreen"'), 'Story level selection must come after difficulty');
has(html, 'if(mode==="classic"){await StoryMode.open();return}await deployPreparedRun()', 'Story must open levels while Infinity/Timed deploy directly');

// Mode and difficulty reward contract.
has(html, 'classic: { label: "Story", coins: 1', 'Story must be x1');
has(html, 'infinite: { label: "Infinity", coins: 1.5', 'Infinity must be x1.5');
has(html, 'timed: { label: "Contra o tempo", coins: 2.5', 'Timed must be x2.5');
has(html, 'easy: { label: "Normal"', 'Normal difficulty must exist');
has(html, 'medium: { label: "Médio"', 'Medium difficulty must exist');
has(html, 'hard: { label: "Hard"', 'Hard difficulty must exist');
has(html, 'nightmare: { label: "Hardcore"', 'Hardcore difficulty must exist');
has(html, 'coins: 1.25', 'Medium must be x1.25');
has(html, 'coins: 1.5', 'Hard/Infinity x1.5 contract must exist');
has(html, 'coins: 2.5', 'Hardcore/Timed x2.5 contract must exist');
has(html, 'difficulty = "easy"', 'Normal must be the internal default');
has(html, 'hardcore-skull', 'Hardcore must render the animated skull');

// Difficulty and mode affect actual enemy combat, not only labels/rewards.
has(html, '* diff[difficulty].enemyHp * modeRules().hp', 'enemy HP must scale with difficulty and mode');
has(html, 'diff[difficulty].speed *\n                modeRules().speed', 'enemy speed must scale with difficulty and mode');
has(html, 'amount *= modeRules().damage;', 'special boss damage must scale with game mode');
has(html, 'if (!fromNet) amount *= modeRules().damage;', 'regular incoming damage must scale with game mode');

// Story: 10 levels, 20 waves, 3 stars/objectives.
has(html, 'Array.from({length:10}', 'Story must render 10 levels');
has(html, 'mk("wavesCleared",20,"Conclua as 20 waves")', 'each Story level must require 20 waves');
has(html, 'if (StoryMode.active() && this.wave >= 20)', 'Story must end after wave 20');
has(html, 'return [mk("wavesCleared",20,"Conclua as 20 waves"),o2,o3]', 'Story must have exactly three objectives');
has(html, 'if (storyLevel < 3) return 0;', 'levels 1-2 must have no scheduled minibosses');
has(html, 'if (storyLevel < 5)', 'levels 3-4 must use the miniboss-only schedule');
has(html, 'if (wave === 5) return 1;', 'level 5+ wave 5 must spawn miniboss I');
has(html, 'if (wave === 10) return 3;', 'level 5+ wave 10 must spawn boss I');
has(html, 'if (wave === 15) return 2;', 'level 5+ wave 15 must spawn miniboss II');
has(html, 'if (wave === 20) return 4;', 'level 5+ wave 20 must spawn the stronger boss II');

// Persistent Story backend and claims.
has(backend, 'run_start_v48', 'client must start v48 Story-aware runs');
has(backend, 'StoryRepository', 'Story repository must exist');
has(migration, 'create table if not exists public.player_story_progress', 'Story progress must persist server-side');
has(migration, 'create table if not exists public.player_story_claims', 'Story reward claims must persist server-side');
has(migration, "when 'medium' then 1.25", 'server Medium multiplier must be x1.25');
has(migration, "when 'hard' then 1.5", 'server Hard multiplier must be x1.5');
has(migration, "when 'nightmare' then 2.5", 'server Hardcore multiplier must be x2.5');
has(migration, "when 'infinite' then 1.5 when 'timed' then 2.5 else 1 end", 'server mode multiplier must match client');
has(migration, 'v_coins := round(v_coins * diff_mult * mode_mult);', 'server rewards must combine mode x difficulty');
has(migration, "perform public._grant(uid,100000,50000,25,10);", '100% Story must grant the large completion reward');
has(migration, "r.mode = 'classic' and r.story_level is not null and v_cleared >= 20", 'completed Story levels must count as wins');

console.log('PASS v48 mode-first flow, combat scaling, Story progression and reward contracts');
