-- Dead Recoil v58: Challenges (5 per map) and Artifacts.
-- Challenge runs are solo runs with mode 'challenge'. Winning one (10 waves cleared) rolls an
-- artifact server-side: rarity weights depend on the difficulty, plus a low chance of a secret
-- piece (2 secret artifacts per map, 5 pieces each, crafted in Personalizar > Equipamentos).
-- Equipped artifacts snapshot a coin bonus at run start (private.run_bonus) that _apply_report
-- applies to every coin payout of that run. All state lives in the unexposed `private` schema.
create schema if not exists private;

create table if not exists private.player_artifacts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  artifact_id text not null,
  count int not null default 0 check (count >= 0),
  first_at timestamptz not null default now(),
  primary key (user_id, artifact_id)
);
create table if not exists private.player_artifact_pieces (
  user_id uuid not null references public.profiles(id) on delete cascade,
  secret_id text not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, secret_id)
);
create table if not exists private.player_artifact_loadout (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  slots_owned int not null default 1 check (slots_owned between 1 and 4),
  equipped text[] not null default '{}'
);
create table if not exists private.player_challenges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  map_id int not null,
  challenge int not null check (challenge between 1 and 5),
  difficulty text not null,
  clears int not null default 0,
  primary key (user_id, map_id, challenge, difficulty)
);
create table if not exists private.run_challenge (
  run_id uuid primary key references public.runs(id) on delete cascade,
  challenge int not null check (challenge between 1 and 5),
  reward jsonb
);
create table if not exists private.run_bonus (
  run_id uuid primary key references public.runs(id) on delete cascade,
  coin_bonus numeric not null default 0
);

-- Family order: vida, fortuna, municao, vento, seiva. Tiers: c u r e l d (0..5).
-- Epic adds the next family's common value, Legendary the next two, Divine the other four (uncommon).
create or replace function private.artifact_coin(p_id text) returns numeric
language plpgsql immutable set search_path = '' as $$
declare fams text[] := array['vida','fortuna','municao','vento','seiva']; f text; t int; fi int; k int; n int;
begin
  if p_id like 'secret_%' then
    return case p_id when 'secret_0a' then 0.10 when 'secret_0b' then 0.35 when 'secret_3a' then 0.15 when 'secret_4b' then 0.40 else 0 end;
  end if;
  f := split_part(p_id, '_', 1);
  t := case split_part(p_id, '_', 2) when 'c' then 0 when 'u' then 1 when 'r' then 2 when 'e' then 3 when 'l' then 4 when 'd' then 5 else -1 end;
  fi := array_position(fams, f) - 1;
  if fi is null or t < 0 then return 0; end if;
  if f = 'fortuna' then return (array[0.05,0.08,0.12,0.16,0.22,0.30])[t + 1]; end if;
  k := mod(1 - fi + 5, 5);
  n := case t when 3 then 1 when 4 then 2 when 5 then 4 else 0 end;
  if k between 1 and n then return case when t = 5 then 0.08 else 0.05 end; end if;
  return 0;
end $$;

create or replace function private.artifact_valid(p_id text) returns boolean
language sql immutable set search_path = '' as $$
  select p_id ~ '^(vida|fortuna|municao|vento|seiva)_[cureld]$' or p_id ~ '^secret_[0-4][ab]$'
$$;

create or replace function private.artifacts_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'owned', coalesce((select jsonb_object_agg(artifact_id, count) from private.player_artifacts where user_id = p_uid and count > 0), '{}'::jsonb),
    'pieces', coalesce((select jsonb_object_agg(secret_id, count) from private.player_artifact_pieces where user_id = p_uid and count > 0), '{}'::jsonb),
    'slots', coalesce((select slots_owned from private.player_artifact_loadout where user_id = p_uid), 1),
    'equipped', coalesce((select to_jsonb(equipped) from private.player_artifact_loadout where user_id = p_uid), '[]'::jsonb),
    'challenges', coalesce((select jsonb_agg(jsonb_build_object('map', map_id, 'challenge', challenge, 'difficulty', difficulty, 'clears', clears))
      from private.player_challenges where user_id = p_uid), '[]'::jsonb)
  )
$$;

create or replace function public.artifacts_state() returns jsonb
language sql stable security definer set search_path = '' as $$ select private.artifacts_json(public._uid()) $$;
grant execute on function public.artifacts_state() to authenticated;

create or replace function public.artifacts_equip(p_equipped text[], p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); slots int; a text; clean text[] := '{}';
begin
  insert into private.player_artifact_loadout(user_id) values (uid) on conflict do nothing;
  select slots_owned into slots from private.player_artifact_loadout where user_id = uid for update;
  foreach a in array coalesce(p_equipped, '{}') loop
    if a = any (clean) then continue; end if;
    if not exists (select 1 from private.player_artifacts where user_id = uid and artifact_id = a and count > 0) then raise exception 'artifact_not_owned'; end if;
    clean := clean || a;
  end loop;
  if coalesce(array_length(clean, 1), 0) > slots then raise exception 'artifact_slots_full'; end if;
  update private.player_artifact_loadout set equipped = clean where user_id = uid;
  return jsonb_build_object('artifacts', private.artifacts_json(uid), 'profile', public._profile_json(uid));
end $$;
grant execute on function public.artifacts_equip(text[], uuid) to authenticated;

create or replace function public.artifacts_buy_slot(p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); slots int; price int; prices int[] := array[0, 12000, 35000, 90000]; c bigint;
begin
  insert into private.player_artifact_loadout(user_id) values (uid) on conflict do nothing;
  if p_request is not null and not public._first_request(uid, p_request) then
    return jsonb_build_object('artifacts', private.artifacts_json(uid), 'profile', public._profile_json(uid));
  end if;
  select slots_owned into slots from private.player_artifact_loadout where user_id = uid for update;
  if slots >= 4 then raise exception 'max_slots'; end if;
  price := prices[slots + 1];
  select coins into c from public.profiles where id = uid for update;
  if c < price then raise exception 'insufficient_coins'; end if;
  update public.profiles set coins = coins - price, updated_at = now() where id = uid;
  update private.player_artifact_loadout set slots_owned = slots_owned + 1 where user_id = uid;
  return jsonb_build_object('artifacts', private.artifacts_json(uid), 'profile', public._profile_json(uid));
end $$;
grant execute on function public.artifacts_buy_slot(uuid) to authenticated;

create or replace function public.artifacts_craft(p_secret text, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); have int;
begin
  if p_secret !~ '^secret_[0-4][ab]$' then raise exception 'invalid_artifact'; end if;
  if p_request is not null and not public._first_request(uid, p_request) then
    return jsonb_build_object('artifacts', private.artifacts_json(uid), 'profile', public._profile_json(uid));
  end if;
  select count into have from private.player_artifact_pieces where user_id = uid and secret_id = p_secret for update;
  if coalesce(have, 0) < 5 then raise exception 'not_enough_pieces'; end if;
  update private.player_artifact_pieces set count = count - 5 where user_id = uid and secret_id = p_secret;
  insert into private.player_artifacts(user_id, artifact_id, count) values (uid, p_secret, 1)
    on conflict (user_id, artifact_id) do update set count = private.player_artifacts.count + 1;
  return jsonb_build_object('artifacts', private.artifacts_json(uid), 'profile', public._profile_json(uid));
end $$;
grant execute on function public.artifacts_craft(text, uuid) to authenticated;

-- Rolls the challenge reward once per run (idempotent on run_challenge.reward).
create or replace function private.challenge_finish(p_uid uuid, r public.runs) returns void
language plpgsql security definer set search_path = '' as $$
declare rc private.run_challenge; w int[]; roll numeric; acc int := 0; t int := 0; tiers text[] := array['c','u','r','e','l','d'];
  fams text[] := array['vida','fortuna','municao','vento','seiva']; art text; piece text := null; pchance numeric;
begin
  select * into rc from private.run_challenge where run_id = r.id for update;
  if not found or rc.reward is not null then return; end if;
  w := case r.difficulty
    when 'easy' then array[60,30,10,0,0,0]
    when 'medium' then array[30,38,24,8,0,0]
    when 'hard' then array[10,25,35,22,7,1]
    else array[0,10,30,33,22,5] end;
  roll := random() * 100;
  for i in 1..6 loop
    acc := acc + w[i];
    if roll < acc then t := i; exit; end if;
  end loop;
  if t = 0 then t := 1; end if;
  art := fams[1 + floor(random() * 5)::int] || '_' || tiers[t];
  insert into private.player_artifacts(user_id, artifact_id, count) values (p_uid, art, 1)
    on conflict (user_id, artifact_id) do update set count = private.player_artifacts.count + 1;
  pchance := (case r.difficulty when 'easy' then 2 when 'medium' then 4 when 'hard' then 7 else 12 end) + (rc.challenge - 1);
  if random() * 100 < pchance then
    piece := 'secret_' || r.map_id || (case when random() < 0.5 then 'a' else 'b' end);
    insert into private.player_artifact_pieces(user_id, secret_id, count) values (p_uid, piece, 1)
      on conflict (user_id, secret_id) do update set count = private.player_artifact_pieces.count + 1;
  end if;
  insert into private.player_challenges(user_id, map_id, challenge, difficulty, clears) values (p_uid, r.map_id, rc.challenge, r.difficulty, 1)
    on conflict (user_id, map_id, challenge, difficulty) do update set clears = private.player_challenges.clears + 1;
  update private.run_challenge set reward = jsonb_build_object('artifact', art, 'piece', piece) where run_id = r.id;
end $$;

-- Starts any run: wraps run_start_v48, snapshots the equipped coin bonus and the challenge number.
create or replace function public.run_start_v58(
  p_mode text, p_map int, p_difficulty text, p_lobby uuid default null,
  p_request uuid default null, p_story_level int default null, p_challenge int default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); res jsonb; rid uuid; bonus numeric := 0; a text;
begin
  if p_mode = 'challenge' and (p_lobby is not null or p_challenge is null or p_challenge not between 1 and 5) then raise exception 'invalid_challenge'; end if;
  res := public.run_start_v48(p_mode, p_map, p_difficulty, p_lobby, p_request, p_story_level);
  rid := (res ->> 'run')::uuid;
  for a in select unnest(equipped) from private.player_artifact_loadout where user_id = uid loop
    bonus := bonus + private.artifact_coin(a);
  end loop;
  insert into private.run_bonus(run_id, coin_bonus) values (rid, least(bonus, 1.5)) on conflict do nothing;
  if p_mode = 'challenge' then insert into private.run_challenge(run_id, challenge) values (rid, p_challenge) on conflict do nothing; end if;
  return res || jsonb_build_object('artifacts', private.artifacts_json(uid));
end $$;
grant execute on function public.run_start_v58(text,int,text,uuid,uuid,int,int) to authenticated;

create or replace function public.challenge_result(p_run uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('reward', (select c.reward from private.run_challenge c join public.runs r on r.id = c.run_id
    where c.run_id = p_run and r.user_id = public._uid()), 'artifacts', private.artifacts_json(public._uid()))
$$;
grant execute on function public.challenge_result(uuid) to authenticated;

-- Patch the live functions in place (keeps every other rule of v48/v39 intact).
do $patch$
declare d text;
begin
  d := pg_get_functiondef('public.run_start_v48(text,int,text,uuid,uuid,int)'::regprocedure);
  if position('''challenge''' in d) = 0 then
    d := replace(d, 'p_mode not in (''classic'',''infinite'',''timed'')', 'p_mode not in (''classic'',''infinite'',''timed'',''challenge'')');
    if position('''timed'',''challenge''' in d) = 0 then raise exception 'run_start patch failed'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public._apply_report(uuid,public.runs,jsonb,boolean,text)'::regprocedure);
  if position('run_bonus' in d) = 0 then
    d := replace(d, 'when ''timed'' then 2.5 else 1 end;', 'when ''timed'' then 2.5 when ''challenge'' then 1.25 else 1 end;');
    d := replace(d, 'v_coins := round(v_coins * diff_mult * mode_mult);',
      'v_coins := round(v_coins * diff_mult * mode_mult * (1 + coalesce((select coin_bonus from private.run_bonus where run_id = r.id), 0)));');
    d := replace(d, 'or (r.mode = ''classic'' and lvl is not null and v_cleared >= 20));',
      'or (r.mode = ''classic'' and lvl is not null and v_cleared >= 20) or (r.mode = ''challenge'' and r.lobby_id is null and v_cleared >= 10));');
    d := replace(d, '  perform public._grant(p_uid, v_coins, v_xp, nt, lt);',
      '  perform public._grant(p_uid, v_coins, v_xp, nt, lt);' || chr(10) || '  if won and r.mode = ''challenge'' then perform private.challenge_finish(p_uid, r); end if;');
    if position('run_bonus' in d) = 0 or position('challenge_finish' in d) = 0 or position('''challenge'' then 1.25' in d) = 0 or position('v_cleared >= 10' in d) = 0 then raise exception 'apply_report patch failed'; end if;
    execute d;
  end if;
end $patch$;
