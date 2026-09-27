-- Dead Recoil v28: economy balance, per-map boss hierarchy, Divine/Secret pity, class slots,
-- progressive weapon slots, preference boost on spins and the server-side developer whitelist.
-- Applies the v25 catalog (secret items + 8-tier rates) first: it had not reached the server
-- because the tier check still stopped at Divine (6).
alter table public.catalog_items drop constraint if exists catalog_items_tier_check;
alter table public.catalog_items add constraint catalog_items_tier_check check (tier between 0 and 7);
alter table public.player_classes drop constraint if exists player_classes_slot_check;
alter table public.player_classes add constraint player_classes_slot_check check (slot between 0 and 2);

-- Dead Recoil v25: finalized class roster + Secret rarity.
-- Existing numeric IDs are preserved for save/account compatibility; new classes append at 21+.

insert into public.catalog_items (kind, item_id, tier, lucky_cost, family, name) values
  ('class',0,0,1,null,'Recruit'),
  ('class',1,0,1,null,'Scout'),
  ('class',2,0,1,null,'Medic'),
  ('class',3,1,1,null,'Guardian'),
  ('class',4,0,1,null,'Gunslinger'),
  ('class',5,1,1,null,'Engineer'),
  ('class',6,2,1,null,'Berserker'),
  ('class',7,2,1,null,'Phantom'),
  ('class',8,2,1,null,'Demolitionist'),
  ('class',9,3,1,null,'Vanguard'),
  ('class',10,3,1,null,'Revenant'),
  ('class',11,3,1,null,'Storm Caller'),
  ('class',12,4,1,null,'Warlord'),
  ('class',13,4,1,null,'Juggernaut'),
  ('class',14,4,1,null,'Deadeye'),
  ('class',15,6,1,null,'Reaper'),
  ('class',16,5,1,null,'Void Walker'),
  ('class',17,5,1,null,'Vampire'),
  ('class',18,5,1,null,'Archon'),
  ('class',19,6,1,null,'Serafim'),
  ('class',20,6,1,null,'Deathless'),
  ('class',21,1,1,null,'Sharpshooter'),
  ('class',22,7,1,null,'Archangel'),
  ('class',23,7,1,null,'Archdemon'),
  ('weapon',21,7,1,'melee','Demonic Fury'),
  ('weapon',22,7,1,'melee','Angelic Specter')
on conflict (kind, item_id) do update
set tier = excluded.tier,
    lucky_cost = excluded.lucky_cost,
    family = excluded.family,
    name = excluded.name;

-- Secret is the same shared tier for class and weapon rolls.
-- Prototype v25 rates: Normal 0.01%, Lucky 0.10%. Pity remains 75 Mythic+ / 150 Divine+.
create or replace function public._draw_tier_min(p_lucky boolean, p_min int) returns int
language plpgsql volatile set search_path = '' as $$
declare
  rates numeric[] := case
    when p_lucky then array[0, 0, 0, 58.9, 37, 3, 1, 0.1]
    else array[64.94, 23, 8, 3, 0.9, 0.1, 0.05, 0.01]
  end;
  v numeric := random() * 100;
  t int := 7;
begin
  for i in 1 .. 8 loop
    v := v - rates[i];
    if v < 0 then
      t := i - 1;
      exit;
    end if;
  end loop;
  return greatest(p_min, t);
end $$;

revoke execute on function public._draw_tier_min(boolean, int) from public, anon, authenticated;


-- ── Economy ──────────────────────────────────────────────────────────────────────────────
update public.catalog_difficulties set coins = case id when 'easy' then 1 when 'medium' then 1.25 when 'hard' then 1.5 when 'nightmare' then 2 else coins end;

-- ── Boss hierarchy per map ───────────────────────────────────────────────────────────────
alter table public.catalog_bosses add column if not exists map_id int, add column if not exists rank int not null default 1;
insert into public.catalog_bosses (kind, major, coins, normal, lucky, xp, map_id, rank) values
  ('quarterback', false, 40, 1, 0, 160, 0, 1), ('roadblock', false, 60, 1, 0, 220, 0, 2), ('juggernaut', true, 120, 2, 1, 450, 0, 3), ('wrecker', true, 200, 0, 3, 900, 0, 4),
  ('surgeon', false, 40, 1, 0, 160, 1, 1), ('patient_zero', false, 60, 1, 0, 220, 1, 2), ('butcher', true, 120, 2, 1, 450, 1, 3), ('plague_host', true, 200, 0, 3, 900, 1, 4),
  ('forest_stalker', false, 40, 1, 0, 160, 2, 1), ('gravekeeper', false, 60, 1, 0, 220, 2, 2), ('wendigo', true, 120, 2, 1, 450, 2, 3), ('demon', true, 200, 0, 3, 900, 2, 4),
  ('mutant', false, 40, 1, 0, 160, 3, 1), ('prototype_x', false, 60, 1, 0, 220, 3, 2), ('abomination', true, 120, 2, 1, 450, 3, 3), ('omega', true, 200, 0, 3, 900, 3, 4),
  ('frost_brute', false, 40, 1, 0, 160, 4, 1), ('cryo_hunter', false, 60, 1, 0, 220, 4, 2), ('yeti', true, 120, 2, 1, 450, 4, 3), ('avalanche_titan', true, 200, 0, 3, 900, 4, 4)
on conflict (kind) do update set major = excluded.major, coins = excluded.coins, normal = excluded.normal, lucky = excluded.lucky,
  xp = excluded.xp, map_id = excluded.map_id, rank = excluded.rank;
insert into public.catalog_enemies (enemy_key, boss, sort) values
  ('quarterback', true, 20), ('roadblock', true, 21), ('juggernaut', true, 22), ('wrecker', true, 23),
  ('surgeon', true, 24), ('patient_zero', true, 25), ('butcher', true, 26), ('plague_host', true, 27),
  ('forest_stalker', true, 28), ('gravekeeper', true, 29), ('wendigo', true, 30), ('demon', true, 31),
  ('mutant', true, 32), ('prototype_x', true, 33), ('abomination', true, 34), ('omega', true, 35),
  ('frost_brute', true, 36), ('cryo_hunter', true, 37), ('yeti', true, 38), ('avalanche_titan', true, 39)
on conflict (enemy_key) do update set boss = excluded.boss, sort = excluded.sort;

create or replace function public._apply_report(p_uid uuid, r public.runs, p jsonb, p_ended boolean, p_result text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prev jsonb := r.totals; el numeric; kcap numeric; wave_cap int; t jsonb; tally jsonb := null; lob public.lobbies;
  v_kills bigint; v_heads bigint; v_wave int; dmg bigint; nod int; rev int; v_bosses jsonb := '{}'::jsonb; fams jsonb := '{}'::jsonb;
  dk bigint; dh bigint; dw int; dd bigint; dn int; dr int; dt int;
  v_coins bigint := 0; v_xp bigint := 0; nt int := 0; lt int := 0; mult numeric; b record; fam text; fam_sum bigint := 0;
  dboss int := 0; dmini int := 0; dfams jsonb := '{}'::jsonb; el_claim numeric; won boolean := false; bkinds jsonb := '{}'::jsonb;
  types jsonb := '{}'::jsonb; e record; type_sum bigint := 0;
begin
  el := extract(epoch from (coalesce(r.ended_at, now()) - r.started_at));
  el_claim := least(greatest(coalesce((p ->> 'elapsed')::numeric, el), 0), el + 5);
  if r.lobby_id is not null then
    select * into lob from public.lobbies where id = r.lobby_id;
    if lob.host_id <> p_uid then
      select host_tally into tally from public.lobby_players where lobby_id = r.lobby_id and user_id = p_uid;
      tally := coalesce(tally, prev -> 'hostTally', prev);
    end if;
  end if;
  kcap := floor(el_claim * 6) + 40;
  wave_cap := floor(el_claim / 10)::int + 2;
  v_kills := public._clamp((prev ->> 'kills')::numeric, (p ->> 'kills')::numeric, kcap);
  v_heads := public._clamp((prev ->> 'headshots')::numeric, (p ->> 'headshots')::numeric, v_kills);
  v_wave := public._clamp((prev ->> 'wave')::numeric, (p ->> 'wave')::numeric, wave_cap);
  dmg := public._clamp((prev ->> 'damage')::numeric, (p ->> 'damage')::numeric, el_claim * 4000 + 2000);
  nod := public._clamp((prev ->> 'noDamageWaves')::numeric, (p ->> 'noDamageWaves')::numeric, v_wave);
  rev := public._clamp((prev ->> 'revives')::numeric, (p ->> 'revives')::numeric, case when r.party_size > 1 then floor(el_claim / 5) else 0 end);
  if tally is not null and r.lobby_id is not null and lob.host_id <> p_uid then
    v_kills := greatest((prev ->> 'kills')::bigint, least(v_kills, coalesce((tally ->> 'kills')::bigint, 0)));
    v_heads := greatest((prev ->> 'headshots')::bigint, least(v_heads, coalesce((tally ->> 'headshots')::bigint, 0), v_kills));
    dmg := greatest((prev ->> 'damage')::bigint, least(dmg, coalesce((tally ->> 'damage')::bigint, 0)));
    rev := greatest((prev ->> 'revives')::bigint, least(rev, coalesce((tally ->> 'revives')::bigint, 0)));
    v_wave := greatest((prev ->> 'wave')::int, least(v_wave, lob.host_wave));
  end if;
  for b in select * from public.catalog_bosses loop
    declare cap int; prevb int := coalesce((prev -> 'bosses' ->> b.kind)::int, 0); claim int := coalesce((p -> 'bosses' ->> b.kind)::int, 0); v int;
    begin
      -- v28: four-step hierarchy per map (Miniboss I 5/25/45…, Miniboss II 15/35…, Boss I 10/30…, Boss II 20/40…).
      cap := case b.rank when 4 then v_wave / 20 when 3 then v_wave / 10 - v_wave / 20 when 1 then (v_wave + 15) / 20 else (v_wave + 5) / 20 end;
      if b.map_id is not null and r.map_id is not null and b.map_id <> r.map_id then cap := 0; end if;
      if tally is not null and r.lobby_id is not null and lob.host_id <> p_uid then
        claim := least(claim, coalesce((tally -> 'bosses' ->> b.kind)::int, 0));
      end if;
      v := greatest(prevb, least(greatest(claim, 0), cap));
      v_bosses := v_bosses || jsonb_build_object(b.kind, v);
      if v > prevb then
        v_coins := v_coins + (v - prevb) * b.coins; nt := nt + (v - prevb) * b.normal; lt := lt + (v - prevb) * b.lucky; v_xp := v_xp + (v - prevb) * b.xp;
        bkinds := bkinds || jsonb_build_object(b.kind, v - prevb);
        if b.major then dboss := dboss + (v - prevb); else dmini := dmini + (v - prevb); end if;
      end if;
    end;
  end loop;
  for fam in select distinct c.family from public.catalog_items c where c.kind = 'weapon' and c.item_id = any (r.weapon_ids) loop
    declare prevf bigint := coalesce((prev -> 'families' ->> fam)::bigint, 0); v bigint;
    begin
      v := greatest(prevf, least(greatest(coalesce((p -> 'families' ->> fam)::bigint, 0), 0), v_kills - fam_sum));
      fam_sum := fam_sum + v;
      fams := fams || jsonb_build_object(fam, v);
      if v > prevf then dfams := dfams || jsonb_build_object(fam, v - prevf); end if;
    end;
  end loop;
  type_sum := greatest(0, v_kills - coalesce((prev ->> 'kills')::bigint, 0));
  for e in select enemy_key from public.catalog_enemies where not boss order by sort loop
    declare prevt bigint := coalesce((prev -> 'types' ->> e.enemy_key)::bigint, 0); give bigint;
    begin
      give := least(greatest(coalesce((p -> 'types' ->> e.enemy_key)::bigint, 0) - prevt, 0), type_sum);
      type_sum := type_sum - give;
      types := types || jsonb_build_object(e.enemy_key, prevt + give);
      if give > 0 then perform public._bestiary_add(p_uid, e.enemy_key, give); end if;
    end;
  end loop;
  for e in select key, value from jsonb_each_text(bkinds) loop
    perform public._bestiary_add(p_uid, e.key, e.value::bigint);
  end loop;
  dk := v_kills - coalesce((prev ->> 'kills')::bigint, 0);
  dh := v_heads - coalesce((prev ->> 'headshots')::bigint, 0);
  dw := v_wave - coalesce((prev ->> 'wave')::int, 0);
  dd := dmg - coalesce((prev ->> 'damage')::bigint, 0);
  dn := nod - coalesce((prev ->> 'noDamageWaves')::int, 0);
  dr := rev - coalesce((prev ->> 'revives')::int, 0);
  dt := greatest(0, floor(el_claim)::int - coalesce((prev ->> 'elapsed')::int, 0));
  select coins into mult from public.catalog_difficulties where id = r.difficulty;
  -- v28 economy: 2 coins per kill, +1 per headshot (mirrors the client HUD).
  v_coins := v_coins + round((dk * 2 + dh) * coalesce(mult, 1));
  v_xp := v_xp + dk * 10 + dh * 4 + dw * 40 + dd / 500 + dr * 60;
  if p_ended and p_result = 'win' and r.mode = 'timed' and el >= 290 then won := true; end if;
  t := jsonb_build_object('kills', v_kills, 'headshots', v_heads, 'wave', v_wave, 'damage', dmg, 'noDamageWaves', nod,
    'revives', rev, 'bosses', v_bosses, 'families', fams, 'types', types, 'elapsed', greatest(coalesce((prev ->> 'elapsed')::int, 0), floor(el_claim)::int),
    'coins', coalesce((prev ->> 'coins')::bigint, 0) + v_coins, 'xp', coalesce((prev ->> 'xp')::bigint, 0) + v_xp);
  update public.runs set totals = t, last_report_at = now(), ended_at = case when p_ended then coalesce(ended_at, now()) else ended_at end where id = r.id;
  update public.player_stats set
    kills = kills + dk, headshots = headshots + dh, damage_dealt = damage_dealt + dd, revives = revives + dr,
    bosses_killed = bosses_killed + dboss, minibosses_killed = minibosses_killed + dmini,
    highest_wave = greatest(highest_wave, v_wave), total_playtime = total_playtime + dt,
    games_played = games_played + case when p_ended then 1 else 0 end,
    deaths = deaths + case when p_ended and p_result = 'loss' then 1 else 0 end,
    losses = losses + case when p_ended and p_result = 'loss' then 1 else 0 end,
    wins = wins + case when won then 1 else 0 end,
    multiplayer_matches = multiplayer_matches + case when p_ended and r.party_size > 1 then 1 else 0 end,
    coins_earned = coins_earned + v_coins,
    updated_at = now()
  where user_id = p_uid;
  perform public._grant(p_uid, v_coins, v_xp, nt, lt);
  perform public._missions_ensure(p_uid);
  perform public._missions_progress(p_uid, r, jsonb_build_object(
    'kills', dk, 'headshots', dh, 'waves', dw, 'wave', v_wave, 'damage', dd, 'noDamage', dn, 'revives', dr,
    'bosses', dboss, 'minibosses', dmini, 'bossKinds', bkinds, 'families', dfams, 'coins', v_coins, 'seconds', dt,
    'matchEnd', case when p_ended then 1 else 0 end,
    'mpMatch', case when p_ended and r.party_size > 1 then 1 else 0 end));
  return jsonb_build_object('coins', v_coins, 'xp', v_xp, 'normal', nt, 'lucky', lt, 'totals', t);
end $$;


-- Mission and Index rewards were far too generous next to the new per-kill income.
create or replace function public._missions_scale_rewards() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.reward_coins := greatest(10, (round(new.reward_coins * 0.4 / 10) * 10)::int);
  return new;
end $$;
drop trigger if exists missions_scale_rewards on public.missions;
create trigger missions_scale_rewards before insert on public.missions for each row execute function public._missions_scale_rewards();
update public.missions set reward_coins = greatest(10, (round(reward_coins * 0.4 / 10) * 10)::int) where not claimed;

create or replace function public._bestiary_reward(p_boss boolean, p_tier int) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'coins', case when p_boss then 60 + p_tier * 50 else 15 + round(power(p_tier, 1.45) * 18) end,
    'xp', case when p_boss then 120 + p_tier * 90 else 30 + p_tier * 35 end,
    'normal', case when p_boss then case when p_tier % 2 = 0 then 1 else 0 end else case when p_tier % 3 = 0 then 1 else 0 end end,
    'lucky', case when p_boss then case when p_tier % 4 = 0 then 1 else 0 end else case when p_tier % 8 = 0 then 1 else 0 end end)
$$;

-- ── Pity: Mythic pity removed; Divine = 100, Secret = 300 (Normal +1, Lucky +2) ───────────
alter table public.profiles
  add column if not exists class_secret_pity int not null default 0 check (class_secret_pity between 0 and 300),
  add column if not exists weapon_secret_pity int not null default 0 check (weapon_secret_pity between 0 and 300),
  add column if not exists class_slots_owned int not null default 1 check (class_slots_owned between 1 and 3);
update public.profiles set class_divine_pity = least(class_divine_pity, 100), weapon_divine_pity = least(weapon_divine_pity, 100),
  class_mythic_pity = 0, weapon_mythic_pity = 0;
-- Everyone who already used the old free second class slot keeps it.
update public.profiles p set class_slots_owned = 2
  where class_slots_owned < 2 and exists (select 1 from public.player_classes c where c.user_id = p.id and c.slot = 1);

create or replace function public._profile_json_v17(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('classMythicPity', 0, 'weaponMythicPity', 0,
    'classDivinePity', class_divine_pity, 'weaponDivinePity', weapon_divine_pity,
    'classSecretPity', class_secret_pity, 'weaponSecretPity', weapon_secret_pity,
    'classSlotsOwned', class_slots_owned, 'pityVersion', 28)
  from public.profiles where id = p_uid
$$;
revoke execute on function public._profile_json_v17(uuid) from public, anon, authenticated;

create or replace function public._profile_json(p_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles; s public.player_stats; wslots jsonb; cslots jsonb; owned jsonb;
begin
  select * into p from public.profiles where id = p_uid;
  if not found then return null; end if;
  select * into s from public.player_stats where user_id = p_uid;
  select jsonb_agg((select item_id::int from public.player_inventory i where i.user_id = p_uid and i.item_type = 'weapon' and i.slot = n) order by n)
    into wslots from generate_series(0, 4) n;
  select jsonb_agg((select class_id from public.player_classes c where c.user_id = p_uid and c.slot = n) order by n)
    into cslots from generate_series(0, 2) n;
  select coalesce(jsonb_agg(item_id order by obtained_at), '[]'::jsonb) into owned
    from public.player_inventory where user_id = p_uid and item_type = 'cosmetic';
  return jsonb_build_object(
    'userId', p.id, 'username', p.username, 'displayName', p.display_name,
    'level', p.level, 'xp', p.xp, 'xpNeeded', public._xp_needed(p.level), 'totalXp', p.total_xp,
    'coins', p.coins, 'normal', p.normal_tickets, 'lucky', p.lucky_tickets,
    'classId', p.class_id, 'weaponId', p.weapon_id, 'weaponSlot', p.weapon_slot, 'classRosterVersion', 2,
    'classSlots', cslots, 'weaponSlots', wslots, 'weaponSlotsOwned', p.weapon_slots_owned,
    'classPity', p.class_pity, 'weaponPity', p.weapon_pity,
    'pendingLoadout', jsonb_strip_nulls(jsonb_build_object('class', p.pending_class, 'weapon', p.pending_weapon)),
    'cosmetics', p.cosmetics, 'ownedCosmetics', owned, 'settings', p.settings,
    'stats', jsonb_build_object(
      'kills', s.kills, 'deaths', s.deaths, 'headshots', s.headshots, 'bossesKilled', s.bosses_killed,
      'minibossesKilled', s.minibosses_killed, 'highestWave', s.highest_wave, 'gamesPlayed', s.games_played,
      'wins', s.wins, 'losses', s.losses, 'totalPlaytime', s.total_playtime, 'damageDealt', s.damage_dealt,
      'revives', s.revives, 'multiplayerMatches', s.multiplayer_matches, 'coinsEarned', s.coins_earned),
    'createdAt', p.created_at
  ) || coalesce(public._profile_json_v17(p_uid), '{}'::jsonb);
end $$;

-- Spin with pity (Divine 100 / Secret 300) and an optional preferred item: when the drawn rarity
-- matches the preferred item's rarity it weighs 1.5x inside that rarity — a small boost, never
-- a guarantee.
drop function if exists public.economy_roll(text, boolean, text, uuid);
create or replace function public.economy_roll(p_kind text, p_lucky boolean, p_payment text, p_request uuid default null, p_pref int default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; cost int; v_tier int; result int; in_slots boolean;
  pts int := case when p_lucky then 2 else 1 end; dv int; sc int; min_tier int; n int; pref_tier int;
begin
  if p_kind not in ('class', 'weapon') or p_payment not in ('ticket', 'coins') then raise exception 'invalid_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then
    return jsonb_build_object('profile', public._profile_json(uid), 'id',
      case when p_kind = 'class' then coalesce(p.pending_class, p.class_id) else coalesce(p.pending_weapon, p.weapon_id) end);
  end if;
  cost := case when p_lucky then round(250 * coalesce((select lucky_cost from public.catalog_items where kind = 'class' and item_id = p.class_id), 1)) else 50 end;
  if p_payment = 'ticket' then
    if (case when p_lucky then p.lucky_tickets else p.normal_tickets end) < 1 then raise exception 'insufficient_funds'; end if;
  elsif p.coins < cost then
    raise exception 'insufficient_funds';
  end if;
  dv := least(100, greatest(0, (case when p_kind = 'class' then p.class_divine_pity else p.weapon_divine_pity end)) + pts);
  sc := least(300, greatest(0, (case when p_kind = 'class' then p.class_secret_pity else p.weapon_secret_pity end)) + pts);
  min_tier := case when sc >= 300 then 7 when dv >= 100 then 6 else 0 end;
  v_tier := public._draw_tier_min(p_lucky, min_tier);
  select count(*) into n from public.catalog_items where kind = p_kind and tier = v_tier;
  select tier into pref_tier from public.catalog_items where kind = p_kind and item_id = p_pref;
  if p_pref is not null and pref_tier = v_tier and n > 1 and random() < 1.5 / (n + 0.5) then
    result := p_pref;
  else
    select item_id into result from public.catalog_items
      where kind = p_kind and tier = v_tier and (n <= 1 or p_pref is null or pref_tier is distinct from v_tier or item_id <> p_pref)
      order by random() limit 1;
  end if;
  if result is null then raise exception 'catalog_empty'; end if;
  if v_tier >= 7 then sc := 0; dv := 0;
  elsif v_tier >= 6 then dv := 0;
  end if;
  update public.profiles set
    coins = coins - case when p_payment = 'coins' then cost else 0 end,
    normal_tickets = normal_tickets - case when p_payment = 'ticket' and not p_lucky then 1 else 0 end,
    lucky_tickets = lucky_tickets - case when p_payment = 'ticket' and p_lucky then 1 else 0 end,
    class_divine_pity = case when p_kind = 'class' then dv else class_divine_pity end,
    class_secret_pity = case when p_kind = 'class' then sc else class_secret_pity end,
    weapon_divine_pity = case when p_kind = 'weapon' then dv else weapon_divine_pity end,
    weapon_secret_pity = case when p_kind = 'weapon' then sc else weapon_secret_pity end,
    class_mythic_pity = 0, weapon_mythic_pity = 0,
    pending_weapon = case when p_kind = 'weapon' then result else pending_weapon end,
    updated_at = now()
  where id = uid;
  if p_kind = 'class' then
    in_slots := exists (select 1 from public.player_classes where user_id = uid and class_id = result and slot is not null);
    update public.profiles set pending_class = case when in_slots then null else result end where id = uid;
  end if;
  return jsonb_build_object('profile', public._profile_json(uid), 'id', result);
end $$;

-- Equip/replace by slot; class slots now respect class_slots_owned.
create or replace function public.economy_equip(p_kind text, p_slot int, p_action text, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; pending int; owned int; target int;
begin
  if p_kind not in ('class', 'weapon') or p_action not in ('equip', 'replace', 'discard') then raise exception 'invalid_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  owned := case when p_kind = 'weapon' then p.weapon_slots_owned else p.class_slots_owned end;
  pending := case when p_kind = 'weapon' then p.pending_weapon else p.pending_class end;
  if p_action = 'discard' then
    update public.profiles
    set pending_weapon = case when p_kind = 'weapon' then null else pending_weapon end,
        pending_class = case when p_kind = 'class' then null else pending_class end
    where id = uid;
    return jsonb_build_object('profile', public._profile_json(uid));
  end if;
  if p_slot is null or p_slot < 0 or p_slot >= owned then raise exception 'invalid_slot'; end if;
  if p_action = 'replace' then
    if pending is null then raise exception 'nothing_pending'; end if;
    if p_kind = 'weapon' then
      delete from public.player_inventory where user_id = uid and item_type = 'weapon' and slot = p_slot;
      insert into public.player_inventory (user_id, item_id, item_type, slot, equipped) values (uid, pending::text, 'weapon', p_slot, true);
      update public.profiles set pending_weapon = null where id = uid;
    else
      delete from public.player_classes where user_id = uid and (slot = p_slot or class_id = pending);
      insert into public.player_classes (user_id, class_id, slot) values (uid, pending, p_slot);
      update public.profiles set pending_class = null where id = uid;
    end if;
    target := pending;
  else
    if p_kind = 'weapon' then
      select item_id::int into target from public.player_inventory where user_id = uid and item_type = 'weapon' and slot = p_slot;
    else
      select class_id into target from public.player_classes where user_id = uid and slot = p_slot;
    end if;
    if target is null then raise exception 'empty_slot'; end if;
  end if;
  if p_kind = 'weapon' then
    update public.player_inventory set equipped = false where user_id = uid and item_type = 'weapon';
    update public.player_inventory set equipped = true where user_id = uid and item_type = 'weapon' and slot = p_slot;
    update public.profiles set weapon_id = target, weapon_slot = p_slot, updated_at = now() where id = uid;
  else
    update public.profiles set class_id = target, updated_at = now() where id = uid;
    update public.player_classes set equipped = (class_id = target) where user_id = uid;
  end if;
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

-- Weapon slots: 1 → 5, progressive, the 5th costs 300 000.
create or replace function public.economy_buy_slot(p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles;
  prices int[] := array[0, 0, 15000, 45000, 120000, 300000];
  price int; new_slot int;
begin
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  if p.weapon_slots_owned >= 5 then raise exception 'max_slots'; end if;
  price := prices[p.weapon_slots_owned + 2];
  if p.coins < price then raise exception 'insufficient_funds'; end if;
  new_slot := p.weapon_slots_owned;
  update public.profiles set coins = coins - price, weapon_slots_owned = weapon_slots_owned + 1, updated_at = now() where id = uid;
  insert into public.player_inventory (user_id, item_id, item_type, slot, equipped)
  select uid, '0', 'weapon', new_slot, false
  where not exists (select 1 from public.player_inventory where user_id = uid and item_type = 'weapon' and slot = new_slot);
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

-- Class slots: 1 → 3; the last one costs 1 000 000.
create or replace function public.economy_buy_class_slot(p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; prices int[] := array[0, 150000, 1000000]; price int;
begin
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  if p.class_slots_owned >= 3 then raise exception 'max_slots'; end if;
  price := prices[p.class_slots_owned + 1];
  if p.coins < price then raise exception 'insufficient_funds'; end if;
  update public.profiles set coins = coins - price, class_slots_owned = class_slots_owned + 1, updated_at = now() where id = uid;
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

-- ── Developer mode: powers are granted only to whitelisted user ids ──────────────────────
create table if not exists public.dev_whitelist (user_id uuid primary key references auth.users(id) on delete cascade, note text, created_at timestamptz not null default now());
alter table public.dev_whitelist enable row level security;
revoke all on public.dev_whitelist from anon, authenticated;

create or replace function public.dev_status() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('dev', exists (select 1 from public.dev_whitelist where user_id = public._uid()))
$$;

create or replace function public.dev_action(p_action text, p_args jsonb default '{}'::jsonb, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); v int; s int; k text;
begin
  if not exists (select 1 from public.dev_whitelist where user_id = uid) then raise exception 'not_authorized'; end if;
  perform 1 from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  if p_action = 'set_wallet' then
    update public.profiles set
      coins = least(greatest(coalesce((p_args ->> 'coins')::bigint, coins), 0), 1000000000),
      normal_tickets = least(greatest(coalesce((p_args ->> 'normal')::int, normal_tickets), 0), 100000),
      lucky_tickets = least(greatest(coalesce((p_args ->> 'lucky')::int, lucky_tickets), 0), 100000),
      updated_at = now() where id = uid;
  elsif p_action = 'unlock_slots' then
    update public.profiles set weapon_slots_owned = 5, class_slots_owned = 3, updated_at = now() where id = uid;
    insert into public.player_inventory (user_id, item_id, item_type, slot, equipped)
    select uid, '0', 'weapon', n, false from generate_series(0, 4) n
    where not exists (select 1 from public.player_inventory i where i.user_id = uid and i.item_type = 'weapon' and i.slot = n);
  elsif p_action = 'give' then
    k := p_args ->> 'kind'; v := (p_args ->> 'id')::int; s := coalesce((p_args ->> 'slot')::int, 0);
    if k not in ('weapon', 'class') or not exists (select 1 from public.catalog_items where kind = k and item_id = v) then raise exception 'invalid_request'; end if;
    if k = 'weapon' then
      if s < 0 or s >= (select weapon_slots_owned from public.profiles where id = uid) then raise exception 'invalid_slot'; end if;
      delete from public.player_inventory where user_id = uid and item_type = 'weapon' and slot = s;
      insert into public.player_inventory (user_id, item_id, item_type, slot, equipped) values (uid, v::text, 'weapon', s, true);
      update public.player_inventory set equipped = (slot = s) where user_id = uid and item_type = 'weapon';
      update public.profiles set weapon_id = v, weapon_slot = s, pending_weapon = null, updated_at = now() where id = uid;
    else
      if s < 0 or s >= (select class_slots_owned from public.profiles where id = uid) then raise exception 'invalid_slot'; end if;
      delete from public.player_classes where user_id = uid and (slot = s or class_id = v);
      insert into public.player_classes (user_id, class_id, slot) values (uid, v, s);
      update public.player_classes set equipped = (class_id = v) where user_id = uid;
      update public.profiles set class_id = v, pending_class = null, updated_at = now() where id = uid;
    end if;
  elsif p_action = 'reset_pity' then
    update public.profiles set class_divine_pity = 0, weapon_divine_pity = 0, class_secret_pity = 0, weapon_secret_pity = 0 where id = uid;
  else
    raise exception 'invalid_request';
  end if;
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.economy_roll(text, boolean, text, uuid, int), public.economy_equip(text, int, text, uuid),
  public.economy_buy_slot(uuid), public.economy_buy_class_slot(uuid), public.dev_status(), public.dev_action(text, jsonb, uuid) to authenticated;
revoke execute on function public._apply_report(uuid, public.runs, jsonb, boolean, text), public._missions_scale_rewards(),
  public._bestiary_reward(boolean, int), public._profile_json(uuid) from authenticated;
