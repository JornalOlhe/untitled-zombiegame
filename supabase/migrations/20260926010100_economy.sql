-- Server-authoritative economy: profile bootstrap, spins, loadout, cosmetics and run rewards.
-- All functions are SECURITY DEFINER with an empty search_path and act only on auth.uid().

alter table public.runs add column if not exists party_size int not null default 1;

create or replace function public._uid() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return v;
end $$;

-- Returns true the first time a request id is seen for this user, false on replays.
create or replace function public._first_request(p_uid uuid, p_request uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_request is null then return true; end if;
  insert into public.api_requests (user_id, request_id) values (p_uid, p_request) on conflict do nothing;
  return found;
end $$;

create or replace function public._xp_needed(p_level int) returns int
language sql immutable set search_path = '' as $$ select 250 + 60 * greatest(1, p_level) $$;

-- Grants currency/xp atomically and levels the player up.
create or replace function public._grant(p_uid uuid, p_coins bigint, p_xp bigint, p_normal int default 0, p_lucky int default 0)
returns void language plpgsql security definer set search_path = '' as $$
declare lvl int; x bigint;
begin
  select level, xp + greatest(0, p_xp) into lvl, x from public.profiles where id = p_uid for update;
  while x >= public._xp_needed(lvl) loop
    x := x - public._xp_needed(lvl);
    lvl := lvl + 1;
  end loop;
  update public.profiles set
    coins = least(1000000000, coins + greatest(0, p_coins)),
    normal_tickets = least(100000, normal_tickets + greatest(0, p_normal)),
    lucky_tickets = least(100000, lucky_tickets + greatest(0, p_lucky)),
    xp = x, level = lvl, total_xp = total_xp + greatest(0, p_xp), updated_at = now()
  where id = p_uid;
  if p_coins > 0 then
    update public.player_stats set coins_earned = coins_earned + p_coins, updated_at = now() where user_id = p_uid;
  end if;
end $$;

-- The profile document the game client consumes (same shape as the offline LoadoutEconomy data).
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
    into cslots from generate_series(0, 1) n;
  select coalesce(jsonb_agg(item_id order by obtained_at), '[]'::jsonb) into owned
    from public.player_inventory where user_id = p_uid and item_type = 'cosmetic';
  return jsonb_build_object(
    'userId', p.id, 'username', p.username, 'displayName', p.display_name,
    'level', p.level, 'xp', p.xp, 'xpNeeded', public._xp_needed(p.level), 'totalXp', p.total_xp,
    'coins', p.coins, 'normal', p.normal_tickets, 'lucky', p.lucky_tickets,
    'classId', p.class_id, 'weaponId', p.weapon_id, 'classRosterVersion', 2,
    'classSlots', cslots, 'weaponSlots', wslots, 'weaponSlotsOwned', p.weapon_slots_owned,
    'classPity', p.class_pity, 'weaponPity', p.weapon_pity,
    'pendingLoadout', jsonb_strip_nulls(jsonb_build_object('class', p.pending_class, 'weapon', p.pending_weapon)),
    'cosmetics', p.cosmetics, 'ownedCosmetics', owned, 'settings', p.settings,
    'stats', jsonb_build_object(
      'kills', s.kills, 'deaths', s.deaths, 'headshots', s.headshots, 'bossesKilled', s.bosses_killed,
      'minibossesKilled', s.minibosses_killed, 'highestWave', s.highest_wave, 'gamesPlayed', s.games_played,
      'wins', s.wins, 'losses', s.losses, 'totalPlaytime', s.total_playtime, 'damageDealt', s.damage_dealt,
      'revives', s.revives, 'multiplayerMatches', s.multiplayer_matches, 'coinsEarned', s.coins_earned),
    'createdAt', p.created_at);
end $$;

-- Creates the profile, stats and starter loadout for a user (idempotent).
create or replace function public._bootstrap(p_uid uuid, p_username text, p_display text) returns void
language plpgsql security definer set search_path = '' as $$
declare base text; candidate text; n int := 0;
begin
  if exists (select 1 from public.profiles where id = p_uid) then return; end if;
  base := regexp_replace(coalesce(nullif(p_username, ''), 'survivor'), '[^A-Za-z0-9_]', '', 'g');
  if char_length(base) < 3 then base := 'survivor'; end if;
  base := left(base, 16);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate::extensions.citext) loop
    n := n + 1;
    candidate := left(base, 15) || (floor(random() * 9000) + 1000)::int;
    exit when n > 50;
  end loop;
  insert into public.profiles (id, username, display_name)
    values (p_uid, candidate, left(coalesce(nullif(trim(p_display), ''), candidate), 32))
    on conflict (id) do nothing;
  insert into public.player_stats (user_id) values (p_uid) on conflict do nothing;
  insert into public.player_classes (user_id, class_id, equipped, slot) values (p_uid, 0, true, 0) on conflict do nothing;
  insert into public.player_inventory (user_id, item_id, item_type, slot, equipped) values (p_uid, '1', 'weapon', 0, true) on conflict do nothing;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._bootstrap(new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'username'));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_username ~ '^[A-Za-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles where username = p_username::extensions.citext);
$$;

-- Session bootstrap: returns the profile, creating it if the trigger never ran for this user.
create or replace function public.get_session() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); u record;
begin
  if not exists (select 1 from public.profiles where id = uid) then
    select email, raw_user_meta_data into u from auth.users where id = uid;
    perform public._bootstrap(uid, coalesce(u.raw_user_meta_data ->> 'username', split_part(coalesce(u.email, ''), '@', 1)),
      coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'username'));
  end if;
  perform public._missions_ensure(uid);
  return jsonb_build_object('user', (select username from public.profiles where id = uid), 'profile', public._profile_json(uid));
end $$;

create or replace function public.set_username(p_username text, p_display_name text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid();
begin
  if p_username !~ '^[A-Za-z0-9_]{3,20}$' then raise exception 'invalid_username'; end if;
  if exists (select 1 from public.profiles where username = p_username::extensions.citext and id <> uid) then
    raise exception 'username_taken';
  end if;
  update public.profiles set username = p_username,
    display_name = left(coalesce(nullif(trim(p_display_name), ''), p_username), 32), updated_at = now()
  where id = uid;
  update public.lobby_players set username = p_username where user_id = uid;
  return jsonb_build_object('user', p_username, 'profile', public._profile_json(uid));
end $$;

-- ── Armory ──────────────────────────────────────────────────────────────────────────────────
create or replace function public._draw_tier(p_lucky boolean, p_force boolean) returns int
language plpgsql volatile set search_path = '' as $$
declare rates numeric[] := case when p_lucky then array[0, 0, 0, 59, 37, 3, 1] else array[64.95, 23, 8, 3, 0.9, 0.1, 0.05] end;
  v numeric := random() * 100; t int := 5;
begin
  for i in 1 .. 7 loop
    v := v - rates[i];
    if v < 0 then t := i - 1; exit; end if;
  end loop;
  if p_force then t := greatest(4, t); end if;
  return t;
end $$;

create or replace function public.economy_roll(p_kind text, p_lucky boolean, p_payment text, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; cost int; v_tier int; pity int; result int; in_slots boolean;
begin
  if p_kind not in ('class', 'weapon') or p_payment not in ('ticket', 'coins') then raise exception 'invalid_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then
    return jsonb_build_object('profile', public._profile_json(uid), 'id', case when p_kind = 'class' then coalesce(p.pending_class, p.class_id) else coalesce(p.pending_weapon, p.weapon_id) end);
  end if;
  cost := case when p_lucky then round(150 * coalesce((select lucky_cost from public.catalog_items where kind = 'class' and item_id = p.class_id), 1)) else 50 end;
  if p_payment = 'ticket' then
    if (case when p_lucky then p.lucky_tickets else p.normal_tickets end) < 1 then raise exception 'insufficient_funds'; end if;
  elsif p.coins < cost then raise exception 'insufficient_funds';
  end if;
  pity := case when p_kind = 'class' then p.class_pity else p.weapon_pity end;
  v_tier := public._draw_tier(p_lucky, pity >= 20);
  select item_id into result from public.catalog_items where kind = p_kind and catalog_items.tier = v_tier order by random() limit 1;
  if result is null then raise exception 'catalog_empty'; end if;
  update public.profiles set
    coins = coins - case when p_payment = 'coins' then cost else 0 end,
    normal_tickets = normal_tickets - case when p_payment = 'ticket' and not p_lucky then 1 else 0 end,
    lucky_tickets = lucky_tickets - case when p_payment = 'ticket' and p_lucky then 1 else 0 end,
    class_pity = case when p_kind = 'class' then (case when v_tier >= 4 then 0 else least(20, class_pity + 1) end) else class_pity end,
    weapon_pity = case when p_kind = 'weapon' then (case when v_tier >= 4 then 0 else least(20, weapon_pity + 1) end) else weapon_pity end,
    updated_at = now()
  where id = uid;
  if p_kind = 'weapon' then
    in_slots := exists (select 1 from public.player_inventory where user_id = uid and item_type = 'weapon' and item_id = result::text and slot is not null);
    update public.profiles set pending_weapon = case when in_slots then null else result end where id = uid;
  else
    in_slots := exists (select 1 from public.player_classes where user_id = uid and class_id = result and slot is not null);
    update public.profiles set pending_class = case when in_slots then null else result end where id = uid;
  end if;
  return jsonb_build_object('profile', public._profile_json(uid), 'id', result);
end $$;

-- action: 'equip' (equip an occupied slot), 'replace' (put the pending spin result into slot), 'discard'.
create or replace function public.economy_equip(p_kind text, p_slot int, p_action text, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; pending int; owned int; target int;
begin
  if p_kind not in ('class', 'weapon') or p_action not in ('equip', 'replace', 'discard') then raise exception 'invalid_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  owned := case when p_kind = 'weapon' then p.weapon_slots_owned else 2 end;
  pending := case when p_kind = 'weapon' then p.pending_weapon else p.pending_class end;
  if p_action = 'discard' then
    update public.profiles set pending_weapon = case when p_kind = 'weapon' then null else pending_weapon end,
      pending_class = case when p_kind = 'class' then null else pending_class end where id = uid;
    return jsonb_build_object('profile', public._profile_json(uid));
  end if;
  if p_slot is null or p_slot < 0 or p_slot >= owned then raise exception 'invalid_slot'; end if;
  if p_action = 'replace' then
    if pending is null then raise exception 'nothing_pending'; end if;
    if p_kind = 'weapon' then
      delete from public.player_inventory where user_id = uid and item_type = 'weapon' and (slot = p_slot or item_id = pending::text);
      insert into public.player_inventory (user_id, item_id, item_type, slot) values (uid, pending::text, 'weapon', p_slot);
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
    update public.profiles set weapon_id = target, updated_at = now() where id = uid;
    update public.player_inventory set equipped = (item_id = target::text) where user_id = uid and item_type = 'weapon';
  else
    update public.profiles set class_id = target, updated_at = now() where id = uid;
    update public.player_classes set equipped = (class_id = target) where user_id = uid;
  end if;
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

create or replace function public.economy_buy_slot(p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; prices int[] := array[0, 0, 6000, 18000, 45000, 90000]; price int;
begin
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  if p.weapon_slots_owned >= 5 then raise exception 'max_slots'; end if;
  price := prices[p.weapon_slots_owned + 2];
  if p.coins < price then raise exception 'insufficient_funds'; end if;
  update public.profiles set coins = coins - price, weapon_slots_owned = weapon_slots_owned + 1, updated_at = now() where id = uid;
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

create or replace function public.cosmetic_buy(p_id text, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); c public.catalog_cosmetics; p public.profiles;
begin
  select * into c from public.catalog_cosmetics where id = p_id;
  if not found then raise exception 'invalid_item'; end if;
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  if not exists (select 1 from public.player_inventory where user_id = uid and item_type = 'cosmetic' and item_id = p_id) then
    if p.coins < c.price then raise exception 'insufficient_funds'; end if;
    update public.profiles set coins = coins - c.price where id = uid;
    insert into public.player_inventory (user_id, item_id, item_type) values (uid, p_id, 'cosmetic');
  end if;
  update public.profiles set cosmetics = cosmetics || jsonb_build_object(c.slot, p_id), updated_at = now() where id = uid;
  update public.player_inventory set equipped = (item_id in (select value from jsonb_each_text((select cosmetics from public.profiles where id = uid))))
    where user_id = uid and item_type = 'cosmetic';
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

-- Appearance + settings. Cosmetic slots may only reference owned items (or cosmetic-free styling values).
create or replace function public.save_preferences(p_cosmetics jsonb, p_settings jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); clean jsonb := '{}'::jsonb; k text; v jsonb;
begin
  if jsonb_typeof(p_cosmetics) = 'object' then
    for k, v in select * from jsonb_each(p_cosmetics) loop
      if jsonb_typeof(v) not in ('string', 'number', 'boolean') or length(v::text) > 64 then continue; end if;
      -- A value that names a catalog cosmetic must be owned.
      if jsonb_typeof(v) = 'string' and exists (select 1 from public.catalog_cosmetics where id = v #>> '{}')
         and not exists (select 1 from public.player_inventory where user_id = uid and item_type = 'cosmetic' and item_id = v #>> '{}') then
        continue;
      end if;
      clean := clean || jsonb_build_object(left(k, 32), v);
    end loop;
  end if;
  update public.profiles set cosmetics = clean,
    settings = case when jsonb_typeof(p_settings) = 'object' and pg_column_size(p_settings) < 8000 then p_settings else settings end,
    updated_at = now()
  where id = uid;
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

-- ── Runs and rewards ────────────────────────────────────────────────────────────────────────
create or replace function public.run_start(p_mode text, p_map int, p_difficulty text, p_lobby uuid default null, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; rid uuid; weapons int[]; lob public.lobbies; party int := 1;
begin
  if p_mode not in ('classic', 'infinite', 'timed') then raise exception 'invalid_mode'; end if;
  if not exists (select 1 from public.catalog_maps where map_id = p_map) then raise exception 'invalid_map'; end if;
  if not exists (select 1 from public.catalog_difficulties where id = p_difficulty) then raise exception 'invalid_difficulty'; end if;
  select * into p from public.profiles where id = uid for update;
  if p_lobby is not null then
    select * into lob from public.lobbies where id = p_lobby;
    if not found or not exists (select 1 from public.lobby_players where lobby_id = p_lobby and user_id = uid) then raise exception 'not_in_lobby'; end if;
    if lob.status <> 'in_game' then raise exception 'lobby_not_started'; end if;
    select count(*) into party from public.lobby_players where lobby_id = p_lobby;
    p_mode := lob.mode; p_map := lob.map_id; p_difficulty := lob.difficulty;
  end if;
  -- A client retry with the same request id returns the run that was already opened.
  if p_request is not null and not public._first_request(uid, p_request) then
    select id into rid from public.runs where user_id = uid order by started_at desc limit 1;
    return jsonb_build_object('run', rid, 'profile', public._profile_json(uid));
  end if;
  -- Close abandoned runs so their totals stay final.
  update public.runs set ended_at = coalesce(last_report_at, started_at) where user_id = uid and ended_at is null;
  select coalesce(array_agg(item_id::int order by slot), '{}') into weapons
    from public.player_inventory where user_id = uid and item_type = 'weapon' and slot < p.weapon_slots_owned;
  insert into public.runs (user_id, lobby_id, mode, map_id, difficulty, class_id, weapon_ids, party_size)
    values (uid, p_lobby, p_mode, p_map, p_difficulty, p.class_id, weapons, party)
    returning id into rid;
  return jsonb_build_object('run', rid, 'profile', public._profile_json(uid));
end $$;

-- Clamp a claimed total into what is physically possible for the elapsed server time.
create or replace function public._clamp(p_prev numeric, p_claim numeric, p_cap numeric) returns bigint
language sql immutable set search_path = '' as $$
  select greatest(coalesce(p_prev, 0), least(greatest(coalesce(p_claim, 0), 0), p_cap))::bigint
$$;

create or replace function public._apply_report(p_uid uuid, r public.runs, p jsonb, p_ended boolean, p_result text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prev jsonb := r.totals; el numeric; kcap numeric; wave_cap int; t jsonb; tally jsonb := null; lob public.lobbies;
  v_kills bigint; v_heads bigint; v_wave int; dmg bigint; nod int; rev int; v_bosses jsonb := '{}'::jsonb; fams jsonb := '{}'::jsonb;
  dk bigint; dh bigint; dw int; dd bigint; dn int; dr int; dt int;
  v_coins bigint := 0; v_xp bigint := 0; nt int := 0; lt int := 0; mult numeric; b record; fam text; fam_sum bigint := 0;
  dboss int := 0; dmini int := 0; dfams jsonb := '{}'::jsonb; el_claim numeric; won boolean := false;
begin
  el := extract(epoch from (coalesce(r.ended_at, now()) - r.started_at));
  el_claim := least(greatest(coalesce((p ->> 'elapsed')::numeric, el), 0), el + 5);
  if r.lobby_id is not null then
    select * into lob from public.lobbies where id = r.lobby_id;
    if lob.host_id <> p_uid then
      select host_tally into tally from public.lobby_players where lobby_id = r.lobby_id and user_id = p_uid;
      -- Players who left the lobby keep their last host tally in the run totals.
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
  -- Bosses: bounded by the boss schedule of the reached v_wave.
  for b in select * from public.catalog_bosses loop
    declare cap int; prevb int := coalesce((prev -> 'bosses' ->> b.kind)::int, 0); claim int := coalesce((p -> 'bosses' ->> b.kind)::int, 0); v int;
    begin
      cap := case b.kind when 'demon' then v_wave / 20 when 'yeti' then v_wave / 10 - v_wave / 20 else v_wave / 5 - v_wave / 10 end;
      if tally is not null and r.lobby_id is not null and lob.host_id <> p_uid then
        claim := least(claim, coalesce((tally -> 'bosses' ->> b.kind)::int, 0));
      end if;
      v := greatest(prevb, least(greatest(claim, 0), cap));
      v_bosses := v_bosses || jsonb_build_object(b.kind, v);
      if v > prevb then
        v_coins := v_coins + (v - prevb) * b.coins; nt := nt + (v - prevb) * b.normal; lt := lt + (v - prevb) * b.lucky; v_xp := v_xp + (v - prevb) * b.xp;
        if b.major then dboss := dboss + (v - prevb); else dmini := dmini + (v - prevb); end if;
      end if;
    end;
  end loop;
  -- Kills per weapon family: never more than total v_kills, only families the run actually carried.
  for fam in select distinct c.family from public.catalog_items c where c.kind = 'weapon' and c.item_id = any (r.weapon_ids) loop
    declare prevf bigint := coalesce((prev -> 'families' ->> fam)::bigint, 0); v bigint;
    begin
      v := greatest(prevf, least(greatest(coalesce((p -> 'families' ->> fam)::bigint, 0), 0), v_kills - fam_sum));
      fam_sum := fam_sum + v;
      fams := fams || jsonb_build_object(fam, v);
      if v > prevf then dfams := dfams || jsonb_build_object(fam, v - prevf); end if;
    end;
  end loop;
  dk := v_kills - coalesce((prev ->> 'kills')::bigint, 0);
  dh := v_heads - coalesce((prev ->> 'headshots')::bigint, 0);
  dw := v_wave - coalesce((prev ->> 'wave')::int, 0);
  dd := dmg - coalesce((prev ->> 'damage')::bigint, 0);
  dn := nod - coalesce((prev ->> 'noDamageWaves')::int, 0);
  dr := rev - coalesce((prev ->> 'revives')::int, 0);
  dt := greatest(0, floor(el_claim)::int - coalesce((prev ->> 'elapsed')::int, 0));
  select coins into mult from public.catalog_difficulties where id = r.difficulty;
  v_coins := v_coins + round((dk * 5 + dh * 3) * coalesce(mult, 1));
  v_xp := v_xp + dk * 10 + dh * 4 + dw * 40 + dd / 500 + dr * 60;
  if p_ended and p_result = 'win' and r.mode = 'timed' and el >= 290 then won := true; end if;
  t := jsonb_build_object('kills', v_kills, 'headshots', v_heads, 'wave', v_wave, 'damage', dmg, 'noDamageWaves', nod,
    'revives', rev, 'bosses', v_bosses, 'families', fams, 'elapsed', greatest(coalesce((prev ->> 'elapsed')::int, 0), floor(el_claim)::int),
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
    updated_at = now()
  where user_id = p_uid;
  perform public._grant(p_uid, v_coins, v_xp, nt, lt);
  perform public._missions_progress(p_uid, r, jsonb_build_object(
    'kills', dk, 'headshots', dh, 'waves', dw, 'wave', v_wave, 'damage', dd, 'noDamage', dn, 'revives', dr,
    'bosses', dboss, 'minibosses', dmini, 'families', dfams, 'coins', v_coins,
    'mpMatch', case when p_ended and r.party_size > 1 then 1 else 0 end));
  return jsonb_build_object('coins', v_coins, 'xp', v_xp, 'normal', nt, 'lucky', lt, 'totals', t);
end $$;

create or replace function public.run_report(p_run uuid, p_report jsonb, p_ended boolean default false, p_result text default null, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); r public.runs; rewards jsonb := '{}'::jsonb;
begin
  select * into r from public.runs where id = p_run and user_id = uid for update;
  if not found then raise exception 'run_not_found'; end if;
  if r.ended_at is null and public._first_request(uid, p_request) then
    rewards := public._apply_report(uid, r, coalesce(p_report, '{}'::jsonb), p_ended, p_result);
  end if;
  return jsonb_build_object('profile', public._profile_json(uid), 'rewards', rewards, 'missions', public._missions_json(uid));
end $$;

-- Offline solo runs of a signed-in player, synced later. Each offline run must fit in real,
-- non-overlapping wall-clock time, so replays or fabricated runs cannot mint rewards.
create or replace function public.run_submit_offline(p_request uuid, p_report jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; el numeric; started timestamptz; ended timestamptz; last_end timestamptz;
  r public.runs; mode text := coalesce(p_report ->> 'mode', 'classic'); map int := coalesce((p_report ->> 'map')::int, 0);
  diff text := coalesce(p_report ->> 'difficulty', 'medium'); weapons int[];
begin
  if p_request is null then raise exception 'invalid_request'; end if;
  if not public._first_request(uid, p_request) then
    return jsonb_build_object('profile', public._profile_json(uid), 'duplicate', true);
  end if;
  if mode not in ('classic', 'infinite', 'timed') or not exists (select 1 from public.catalog_maps where map_id = map)
     or not exists (select 1 from public.catalog_difficulties where id = diff) then raise exception 'invalid_request'; end if;
  ended := least(now(), coalesce((p_report ->> 'endedAt')::timestamptz, now()));
  el := least(greatest(coalesce((p_report ->> 'elapsed')::numeric, 0), 0), 3 * 3600);
  started := ended - make_interval(secs => el);
  if started < now() - interval '72 hours' then raise exception 'offline_run_too_old'; end if;
  select max(coalesce(ended_at, last_report_at, started_at)) into last_end from public.runs where user_id = uid;
  if last_end is not null and started < last_end then
    started := last_end;
    if started >= ended then return jsonb_build_object('profile', public._profile_json(uid), 'rejected', 'overlap'); end if;
  end if;
  select * into p from public.profiles where id = uid for update;
  select coalesce(array_agg(item_id::int order by slot), '{}') into weapons
    from public.player_inventory where user_id = uid and item_type = 'weapon' and slot < p.weapon_slots_owned;
  insert into public.runs (user_id, mode, map_id, difficulty, class_id, weapon_ids, started_at, ended_at, offline)
    values (uid, mode, map, diff, p.class_id, weapons, started, ended, true) returning * into r;
  perform public._apply_report(uid, r, p_report, true, p_report ->> 'result');
  return jsonb_build_object('profile', public._profile_json(uid), 'missions', public._missions_json(uid));
end $$;

create or replace function public.mutation_reward(p_run uuid, p_wave int, p_id text, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); r public.runs; m public.catalog_mutations; mult numeric; bonus int; key text := p_id || ':' || p_wave;
begin
  select * into r from public.runs where id = p_run and user_id = uid for update;
  if not found then raise exception 'run_not_found'; end if;
  select * into m from public.catalog_mutations where id = p_id;
  if not found then raise exception 'invalid_mutation'; end if;
  if r.ended_at is null and not (key = any (r.claimed_mutations)) and p_wave between 1 and coalesce((r.totals ->> 'wave')::int, 0) + 1
     and public._first_request(uid, p_request) then
    select coins into mult from public.catalog_difficulties where id = r.difficulty;
    bonus := round((m.reward - 1) * 60 * coalesce(mult, 1));
    update public.runs set claimed_mutations = claimed_mutations || key where id = r.id;
    perform public._grant(uid, bonus, bonus / 2);
  end if;
  return jsonb_build_object('profile', public._profile_json(uid));
end $$;
