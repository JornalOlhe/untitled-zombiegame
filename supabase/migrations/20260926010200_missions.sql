-- Infinite missions: 3 active at a time, generated server-side with rarity + type weights,
-- respecting what the player has unlocked and avoiding the last few templates.

create or replace function public._rarity_names() returns text[]
language sql immutable set search_path = '' as $$ select array['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'DIVINE'] $$;

create or replace function public._mission_targets(p_type text) returns int[]
language sql immutable set search_path = '' as $$
  select case p_type
    when 'KILL' then array[20, 45, 90, 160, 300, 500, 900]
    when 'WEAPON' then array[10, 25, 50, 90, 160, 280, 450]
    when 'HEADSHOT' then array[8, 20, 40, 75, 140, 250, 400]
    when 'SURVIVAL' then array[5, 10, 18, 30, 50, 80, 120]
    when 'BOSS' then array[1, 1, 2, 3, 5, 8, 12]
    when 'MINIBOSS' then array[1, 2, 3, 5, 8, 12, 20]
    when 'DAMAGE' then array[5000, 12000, 25000, 50000, 100000, 200000, 400000]
    when 'TEAM' then array[1, 2, 4, 6, 10, 16, 25]
    when 'MONEY' then array[150, 400, 800, 1600, 3500, 7000, 14000]
    when 'NO_DAMAGE' then array[1, 2, 3, 4, 6, 8, 10]
    when 'DIFFICULTY' then array[5, 8, 12, 18, 25, 35, 50]
    when 'CLASS' then array[15, 35, 70, 120, 220, 380, 600]
    when 'MAP' then array[5, 8, 12, 18, 25, 35, 50]
    when 'MULTIPLAYER' then array[1, 2, 3, 5, 8, 12, 20]
  end
$$;

create or replace function public._weighted_pick(p_weights numeric[]) returns int
language plpgsql volatile set search_path = '' as $$
declare total numeric := 0; v numeric; w numeric;
begin
  foreach w in array p_weights loop total := total + greatest(w, 0); end loop;
  if total <= 0 then return 1; end if;
  v := random() * total;
  for i in 1 .. array_length(p_weights, 1) loop
    v := v - greatest(p_weights[i], 0);
    if v < 0 then return i; end if;
  end loop;
  return array_length(p_weights, 1);
end $$;

create or replace function public._mission_generate(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl int; hw int; mp bigint;
  types text[] := array['KILL', 'WEAPON', 'HEADSHOT', 'SURVIVAL', 'BOSS', 'MINIBOSS', 'DAMAGE', 'TEAM', 'MONEY', 'NO_DAMAGE', 'DIFFICULTY', 'CLASS', 'MAP', 'MULTIPLAYER'];
  base_w numeric[] := array[18, 12, 12, 12, 6, 8, 8, 4, 8, 5, 5, 8, 6, 4];
  w numeric[]; fams text[]; cls int[]; recent text[]; t text; ri int; rw numeric[]; key text; params jsonb; target int;
  reach_cap int; rc int[] := array[150, 320, 650, 1500, 4000, 10000, 25000]; rx int[] := array[80, 160, 320, 700, 1600, 3500, 8000];
  nt int; lt int; tries int := 0; choice text;
begin
  select level into lvl from public.profiles where id = p_uid;
  select highest_wave, multiplayer_matches into hw, mp from public.player_stats where user_id = p_uid;
  select coalesce(array_agg(distinct c.family), '{}') into fams from public.player_inventory i
    join public.catalog_items c on c.kind = 'weapon' and c.item_id::text = i.item_id
    where i.user_id = p_uid and i.item_type = 'weapon' and i.slot is not null;
  select coalesce(array_agg(class_id), '{}') into cls from public.player_classes where user_id = p_uid and unlocked;
  select coalesce(array_agg(template_key), '{}') into recent from (
    (select template_key from public.missions where user_id = p_uid and not claimed)
    union all
    (select template_key from public.missions where user_id = p_uid and claimed order by claimed_at desc limit 8)) q;
  -- Higher levels shift weight toward rarer (harder, richer) missions.
  rw := array[40, 26, 16, 9 * (1 + lvl / 25.0), 5 * (1 + lvl / 20.0), 2.5 * (1 + lvl / 15.0), 1 * (1 + lvl / 12.0)];
  loop
    tries := tries + 1;
    exit when tries > 60;
    w := base_w;
    if coalesce(hw, 0) < 8 then w[5] := 0; end if;            -- BOSS needs a player who reaches wave 10
    if coalesce(hw, 0) < 3 then w[6] := 0; end if;            -- MINIBOSS (wave 5)
    if coalesce(mp, 0) < 1 then w[8] := 0; end if;            -- TEAM only after a multiplayer match
    if cardinality(fams) = 0 then w[2] := 0; end if;
    if coalesce(hw, 0) < 4 then w[11] := 0; end if;           -- DIFFICULTY needs some experience
    if cardinality(cls) = 0 then w[12] := 0; end if;
    t := types[public._weighted_pick(w)];
    ri := public._weighted_pick(rw);
    params := '{}'::jsonb;
    key := t;
    if t = 'WEAPON' then
      choice := fams[1 + floor(random() * cardinality(fams))::int];
      params := jsonb_build_object('family', choice); key := t || ':' || choice;
    elsif t = 'CLASS' then
      choice := cls[1 + floor(random() * cardinality(cls))::int]::text;
      params := jsonb_build_object('classId', choice::int,
        'className', (select name from public.catalog_items where kind = 'class' and item_id = choice::int)); key := t || ':' || choice;
    elsif t = 'MAP' then
      choice := (floor(random() * 5))::int::text;
      params := jsonb_build_object('mapId', choice::int, 'mapName', (select name from public.catalog_maps where map_id = choice::int));
      key := t || ':' || choice;
    elsif t = 'DIFFICULTY' then
      choice := case when ri >= 5 or random() < 0.5 then 'nightmare' else 'hard' end;
      params := jsonb_build_object('difficulty', choice); key := t || ':' || choice;
    end if;
    continue when key = any (recent);
    target := (public._mission_targets(t))[ri];
    if t in ('DIFFICULTY', 'MAP') then
      -- Never ask for a wave far beyond what the player has already reached.
      reach_cap := greatest(5, coalesce(hw, 0) + 3 + ri * 3);
      if target > reach_cap then
        continue when ri >= 4 and random() < 0.7;              -- prefer another roll over a watered-down epic+
        target := reach_cap;
      end if;
    end if;
    nt := case ri when 3 then 1 when 4 then 2 when 6 then 3 else 0 end;
    lt := case ri when 5 then 1 when 6 then 1 when 7 then 2 + case when random() < 0.25 then 1 else 0 end else 0 end;
    insert into public.missions (user_id, mission_type, template_key, params, target, rarity, reward_coins, reward_xp, reward_normal, reward_lucky)
      values (p_uid, t, key, params, target, (public._rarity_names())[ri], rc[ri], rx[ri], nt, lt);
    return;
  end loop;
  insert into public.missions (user_id, mission_type, template_key, target, rarity, reward_coins, reward_xp)
    values (p_uid, 'KILL', 'KILL', 20, 'COMMON', 150, 80);
end $$;

create or replace function public._missions_ensure(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform 1 from public.profiles where id = p_uid for update;
  select count(*) into n from public.missions where user_id = p_uid and not claimed;
  while n < 3 loop
    perform public._mission_generate(p_uid);
    n := n + 1;
  end loop;
end $$;

create or replace function public._missions_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'type', mission_type, 'params', params, 'target', target, 'progress', least(progress, target),
    'rarity', rarity, 'rewardCoins', reward_coins, 'rewardXp', reward_xp, 'rewardNormal', reward_normal,
    'rewardLucky', reward_lucky, 'completed', completed, 'createdAt', created_at) order by created_at, id), '[]'::jsonb)
  from public.missions where user_id = p_uid and not claimed
$$;

-- Applies one run report's deltas to every active mission.
create or replace function public._missions_progress(p_uid uuid, r public.runs, d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.missions; inc int; newp int; drank int; mrank int;
begin
  select rank into drank from public.catalog_difficulties where id = r.difficulty;
  for m in select * from public.missions where user_id = p_uid and not claimed and not completed for update loop
    inc := 0; newp := null;
    case m.mission_type
      when 'KILL' then inc := (d ->> 'kills')::int;
      when 'WEAPON' then inc := coalesce((d -> 'families' ->> (m.params ->> 'family'))::int, 0);
      when 'HEADSHOT' then inc := (d ->> 'headshots')::int;
      when 'SURVIVAL' then inc := (d ->> 'waves')::int;
      when 'BOSS' then inc := (d ->> 'bosses')::int;
      when 'MINIBOSS' then inc := (d ->> 'minibosses')::int;
      when 'DAMAGE' then inc := least((d ->> 'damage')::bigint, 2000000000)::int;
      when 'TEAM' then inc := (d ->> 'revives')::int;
      when 'MONEY' then inc := least((d ->> 'coins')::bigint, 2000000000)::int;
      when 'NO_DAMAGE' then inc := (d ->> 'noDamage')::int;
      when 'MULTIPLAYER' then inc := (d ->> 'mpMatch')::int;
      when 'CLASS' then if r.class_id = (m.params ->> 'classId')::int then inc := (d ->> 'kills')::int; end if;
      when 'MAP' then if r.map_id = (m.params ->> 'mapId')::int then newp := greatest(m.progress, (d ->> 'wave')::int); end if;
      when 'DIFFICULTY' then
        select rank into mrank from public.catalog_difficulties where id = m.params ->> 'difficulty';
        if drank >= mrank then newp := greatest(m.progress, (d ->> 'wave')::int); end if;
      else null;
    end case;
    if newp is null then newp := m.progress + greatest(coalesce(inc, 0), 0); end if;
    if newp <> m.progress then
      update public.missions set progress = least(newp, target),
        completed = newp >= target, completed_at = case when newp >= target then now() else null end
      where id = m.id;
    end if;
  end loop;
end $$;

create or replace function public.missions_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid();
begin
  perform public._missions_ensure(uid);
  return jsonb_build_object('missions', public._missions_json(uid), 'profile', public._profile_json(uid));
end $$;

-- CLAIM: grant, mark finished, retire it and generate a replacement — all in one transaction.
-- The row lock + claimed flag make a double claim impossible (it returns already_claimed).
create or replace function public.mission_claim(p_mission bigint, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); m public.missions;
begin
  select * into m from public.missions where id = p_mission and user_id = uid for update;
  if not found then raise exception 'mission_not_found'; end if;
  if m.claimed then raise exception 'already_claimed'; end if;
  if not m.completed then raise exception 'mission_incomplete'; end if;
  update public.missions set claimed = true, claimed_at = now() where id = m.id;
  perform public._grant(uid, m.reward_coins, m.reward_xp, m.reward_normal, m.reward_lucky);
  perform public._missions_ensure(uid);
  return jsonb_build_object('claimed', jsonb_build_object('id', m.id, 'type', m.mission_type, 'params', m.params, 'target', m.target,
      'rarity', m.rarity, 'rewardCoins', m.reward_coins, 'rewardXp', m.reward_xp, 'rewardNormal', m.reward_normal, 'rewardLucky', m.reward_lucky),
    'missions', public._missions_json(uid), 'profile', public._profile_json(uid));
end $$;
