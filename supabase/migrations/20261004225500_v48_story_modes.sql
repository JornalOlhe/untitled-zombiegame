-- Dead Recoil v48: mode-first flow, difficulty/mode coin multipliers and persistent Story progression.
-- Internal IDs remain classic/easy/nightmare for backwards compatibility; the client labels them
-- Story/Normal/Hardcore.

update public.catalog_difficulties set coins = case id
  when 'easy' then 1
  when 'medium' then 1.25
  when 'hard' then 1.5
  when 'nightmare' then 2.5
  else coins end;

alter table public.runs
  add column if not exists story_level int check (story_level between 1 and 10);

create table if not exists public.player_story_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  map_id int not null references public.catalog_maps(map_id),
  story_level int not null check (story_level between 1 and 10),
  difficulty text not null references public.catalog_difficulties(id),
  stars int not null default 0 check (stars between 0 and 3),
  claimed_stars int not null default 0 check (claimed_stars between 0 and 3),
  best jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, map_id, story_level, difficulty)
);
create index if not exists idx_story_user_map on public.player_story_progress(user_id,map_id,difficulty,story_level);

create table if not exists public.player_story_claims (
  user_id uuid not null references public.profiles(id) on delete cascade,
  claim_key text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, claim_key)
);

alter table public.player_story_progress enable row level security;
alter table public.player_story_claims enable row level security;
drop policy if exists "own story progress" on public.player_story_progress;
create policy "own story progress" on public.player_story_progress for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "own story claims" on public.player_story_claims;
create policy "own story claims" on public.player_story_claims for select to authenticated
  using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.player_story_progress, public.player_story_claims from anon, authenticated;

create or replace function public._story_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'progress', coalesce((
      select jsonb_agg(jsonb_build_object(
        'map', s.map_id, 'level', s.story_level, 'difficulty', s.difficulty,
        'stars', s.stars, 'claimedStars', s.claimed_stars, 'best', s.best
      ) order by s.map_id, s.difficulty, s.story_level)
      from public.player_story_progress s where s.user_id = p_uid
    ), '[]'::jsonb),
    'claims', coalesce((
      select jsonb_agg(c.claim_key order by c.claim_key)
      from public.player_story_claims c where c.user_id = p_uid
    ), '[]'::jsonb)
  )
$$;
revoke execute on function public._story_json(uuid) from public, anon, authenticated;

create or replace function public._story_star_count(p_map int, p_level int, p_report jsonb, p_result text)
returns int language plpgsql immutable set search_path = '' as $$
declare
  k bigint := greatest(0, coalesce((p_report->>'kills')::bigint,0));
  h bigint := greatest(0, coalesce((p_report->>'headshots')::bigint,0));
  n int := greatest(0, coalesce((p_report->>'noDamageWaves')::int,0));
  d bigint := greatest(0, coalesce((p_report->>'damage')::bigint,0));
  w int := greatest(0, coalesce((p_report->>'wavesCleared')::int,0));
  stars int := 0;
  seed int := p_map + p_level;
  seed3 int := p_map * 2 + p_level;
begin
  if p_result <> 'win' or w < 20 or p_level not between 1 and 10 or p_map not between 0 and 4 then return 0; end if;
  stars := 1;
  if case mod(seed,3)
    when 0 then k >= 90 + p_level * 12
    when 1 then h >= 15 + p_level * 4
    else n >= 2 + floor(p_level / 2.0)::int
  end then stars := 2; else return stars; end if;
  if case mod(seed3,3)
    when 0 then d >= 12000 + p_level * 2500
    when 1 then k >= 120 + p_level * 15
    else h >= 25 + p_level * 5
  end then stars := 3; end if;
  return stars;
end $$;
revoke execute on function public._story_star_count(int,int,jsonb,text) from public, anon, authenticated;

create or replace function public._story_finish(p_uid uuid, r public.runs, p_report jsonb, p_result text)
returns void language plpgsql security definer set search_path = '' as $$
declare s int;
begin
  if r.mode <> 'classic' or r.lobby_id is not null or r.story_level is null then return; end if;
  s := public._story_star_count(r.map_id, r.story_level, p_report, p_result);
  if s < 1 then return; end if;
  insert into public.player_story_progress(user_id,map_id,story_level,difficulty,stars,best,completed_at)
  values(p_uid,r.map_id,r.story_level,r.difficulty,s,
    jsonb_build_object('kills',coalesce((p_report->>'kills')::bigint,0),'headshots',coalesce((p_report->>'headshots')::bigint,0),
      'damage',coalesce((p_report->>'damage')::bigint,0),'noDamageWaves',coalesce((p_report->>'noDamageWaves')::int,0)),
    now())
  on conflict(user_id,map_id,story_level,difficulty) do update set
    stars = greatest(public.player_story_progress.stars, excluded.stars),
    best = case when excluded.stars >= public.player_story_progress.stars then excluded.best else public.player_story_progress.best end,
    completed_at = coalesce(public.player_story_progress.completed_at, excluded.completed_at),
    updated_at = now();
end $$;
revoke execute on function public._story_finish(uuid,public.runs,jsonb,text) from public, anon, authenticated;

create or replace function public.story_list() returns jsonb
language sql stable security definer set search_path = '' as $$
  select public._story_json(public._uid())
$$;
revoke execute on function public.story_list() from public, anon;
grant execute on function public.story_list() to authenticated;

create or replace function public.run_start_v48(
  p_mode text, p_map int, p_difficulty text, p_lobby uuid default null,
  p_request uuid default null, p_story_level int default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; rid uuid; weapons int[]; lob public.lobbies; party int := 1;
begin
  if p_mode not in ('classic','infinite','timed') then raise exception 'invalid_mode'; end if;
  if not exists(select 1 from public.catalog_maps where map_id=p_map) then raise exception 'invalid_map'; end if;
  if not exists(select 1 from public.catalog_difficulties where id=p_difficulty) then raise exception 'invalid_difficulty'; end if;
  if p_lobby is null and p_mode='classic' and (p_story_level is null or p_story_level not between 1 and 10) then raise exception 'invalid_story_level'; end if;
  if p_mode <> 'classic' then p_story_level := null; end if;
  select * into p from public.profiles where id=uid for update;
  if p_lobby is not null then
    select * into lob from public.lobbies where id=p_lobby;
    if not found or not exists(select 1 from public.lobby_players where lobby_id=p_lobby and user_id=uid) then raise exception 'not_in_lobby'; end if;
    if lob.status <> 'in_game' then raise exception 'lobby_not_started'; end if;
    select count(*) into party from public.lobby_players where lobby_id=p_lobby;
    p_mode:=lob.mode; p_map:=lob.map_id; p_difficulty:=lob.difficulty; p_story_level:=null;
  end if;
  if p_request is not null and not public._first_request(uid,p_request) then
    select id into rid from public.runs where user_id=uid order by started_at desc limit 1;
    return jsonb_build_object('run',rid,'profile',public._profile_json(uid),'story',public._story_json(uid));
  end if;
  update public.runs set ended_at=coalesce(last_report_at,started_at) where user_id=uid and ended_at is null;
  select coalesce(array_agg(item_id::int order by slot),'{}') into weapons
    from public.player_inventory where user_id=uid and item_type='weapon' and slot<p.weapon_slots_owned;
  insert into public.runs(user_id,lobby_id,mode,map_id,difficulty,class_id,weapon_ids,party_size,story_level)
    values(uid,p_lobby,p_mode,p_map,p_difficulty,p.class_id,weapons,party,p_story_level) returning id into rid;
  return jsonb_build_object('run',rid,'profile',public._profile_json(uid),'story',public._story_json(uid));
end $$;
revoke execute on function public.run_start_v48(text,int,text,uuid,uuid,int) from public, anon;
grant execute on function public.run_start_v48(text,int,text,uuid,uuid,int) to authenticated;

create or replace function public._apply_report(p_uid uuid, r public.runs, p jsonb, p_ended boolean, p_result text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prev jsonb := r.totals; el numeric; kcap numeric; wave_cap int; t jsonb; tally jsonb := null; lob public.lobbies;
  v_kills bigint; v_heads bigint; v_wave int; v_cleared int; v_boss_spawns int; dmg bigint; nod int; rev int; v_bosses jsonb := '{}'::jsonb; fams jsonb := '{}'::jsonb;
  dk bigint; dh bigint; dw int; dc int; dspawn int; dd bigint; dn int; dr int; dt int;
  v_coins bigint := 0; type_coins bigint := 0; typed_kills bigint := 0; v_xp bigint := 0; nt int := 0; lt int := 0; b record; fam text; fam_sum bigint := 0;
  dboss int := 0; dmini int := 0; dfams jsonb := '{}'::jsonb; el_claim numeric; won boolean := false; bkinds jsonb := '{}'::jsonb;
  types jsonb := '{}'::jsonb; e record; type_sum bigint := 0;
  diff_mult numeric := 1; mode_mult numeric := 1;
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
  -- `wavesCleared` is explicit on current clients. The v_wave-1 fallback keeps older
  -- clients/multiplayer peers compatible without awarding the currently active wave early.
  v_cleared := public._clamp(
    coalesce((prev ->> 'wavesCleared')::numeric, 0),
    greatest(coalesce((p ->> 'wavesCleared')::numeric, 0), greatest(v_wave - 1, 0)),
    v_wave
  );
  dmg := public._clamp((prev ->> 'damage')::numeric, (p ->> 'damage')::numeric, el_claim * 4000 + 2000);
  nod := public._clamp((prev ->> 'noDamageWaves')::numeric, (p ->> 'noDamageWaves')::numeric, v_wave);
  rev := public._clamp((prev ->> 'revives')::numeric, (p ->> 'revives')::numeric, case when r.party_size > 1 then floor(el_claim / 5) else 0 end);
  if tally is not null and r.lobby_id is not null and lob.host_id <> p_uid then
    v_kills := greatest((prev ->> 'kills')::bigint, least(v_kills, coalesce((tally ->> 'kills')::bigint, 0)));
    v_heads := greatest((prev ->> 'headshots')::bigint, least(v_heads, coalesce((tally ->> 'headshots')::bigint, 0), v_kills));
    dmg := greatest((prev ->> 'damage')::bigint, least(dmg, coalesce((tally ->> 'damage')::bigint, 0)));
    rev := greatest((prev ->> 'revives')::bigint, least(rev, coalesce((tally ->> 'revives')::bigint, 0)));
    v_wave := greatest((prev ->> 'wave')::int, least(v_wave, lob.host_wave));
    v_cleared := least(v_cleared, v_wave);
  end if;
  v_boss_spawns := public._clamp(
    coalesce((prev ->> 'bossSpawns')::numeric, 0),
    coalesce((p ->> 'bossSpawns')::numeric, 0),
    case when r.mode = 'classic' and r.story_level is not null and r.lobby_id is null and r.story_level < 3
      then 0 else greatest(0, v_wave / 5) end
  );
  if tally is not null and r.lobby_id is not null and lob.host_id <> p_uid then
    v_boss_spawns := greatest(
      coalesce((prev ->> 'bossSpawns')::int, 0),
      least(v_boss_spawns, coalesce((tally ->> 'bossSpawns')::int, 0))
    );
  end if;
  for b in select * from public.catalog_bosses loop
    declare cap int; prevb int := coalesce((prev -> 'bosses' ->> b.kind)::int, 0); claim int := coalesce((p -> 'bosses' ->> b.kind)::int, 0); v int;
    begin
      -- v28: four-step hierarchy per map (Miniboss I 5/25/45…, Miniboss II 15/35…, Boss I 10/30…, Boss II 20/40…).
      if r.mode = 'classic' and r.story_level is not null and r.lobby_id is null then
        cap := case
          when r.story_level < 3 then 0
          when r.story_level < 5 then
            case b.rank
              when 1 then (case when v_wave >= 5 then 1 else 0 end) + (case when v_wave >= 15 then 1 else 0 end)
              when 2 then (case when v_wave >= 10 then 1 else 0 end) + (case when v_wave >= 20 then 1 else 0 end)
              else 0
            end
          else
            case b.rank
              when 1 then case when v_wave >= 5 then 1 else 0 end
              when 2 then case when v_wave >= 15 then 1 else 0 end
              when 3 then case when v_wave >= 10 then 1 else 0 end
              when 4 then case when v_wave >= 20 then 1 else 0 end
              else 0
            end
        end;
      else
        cap := case b.rank when 4 then v_wave / 20 when 3 then v_wave / 10 - v_wave / 20 when 1 then (v_wave + 15) / 20 else (v_wave + 5) / 20 end;
      end if;
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
    declare prevt bigint := coalesce((prev -> 'types' ->> e.enemy_key)::bigint, 0); claimt bigint; give bigint;
    begin
      claimt := coalesce((p -> 'types' ->> e.enemy_key)::bigint, 0);
      if tally is not null and r.lobby_id is not null and lob.host_id <> p_uid then
        claimt := least(claimt, coalesce((tally -> 'types' ->> e.enemy_key)::bigint, 0));
      end if;
      give := least(greatest(claimt - prevt, 0), type_sum);
      type_sum := type_sum - give;
      typed_kills := typed_kills + give;
      type_coins := type_coins + give * public._enemy_coin_reward(e.enemy_key);
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
  dc := v_cleared - coalesce((prev ->> 'wavesCleared')::int, 0);
  dspawn := v_boss_spawns - coalesce((prev ->> 'bossSpawns')::int, 0);
  dd := dmg - coalesce((prev ->> 'damage')::bigint, 0);
  dn := nod - coalesce((prev ->> 'noDamageWaves')::int, 0);
  dr := rev - coalesce((prev ->> 'revives')::int, 0);
  dt := greatest(0, floor(el_claim)::int - coalesce((prev ->> 'elapsed')::int, 0));
  -- Exact deterministic coin economy. Boss coins were added from catalog_bosses above.
  -- Current clients report per-enemy types. Untyped legacy regular kills safely fall back to 10.
  v_coins := v_coins
    + type_coins
    + greatest(0, dk - dboss - dmini - typed_kills) * 10
    + greatest(0, dspawn) * 10
    + greatest(0, dc) * 50;
  select coalesce(coins, 1) into diff_mult from public.catalog_difficulties where id = r.difficulty;
  mode_mult := case r.mode when 'infinite' then 1.5 when 'timed' then 2.5 else 1 end;
  v_coins := round(v_coins * diff_mult * mode_mult);
  v_xp := v_xp + dk * 10 + dh * 4 + dw * 40 + dd / 500 + dr * 60;
  won := p_ended and p_result = 'win' and ((r.mode = 'timed' and el >= 290) or (r.mode = 'classic' and r.story_level is not null and v_cleared >= 20));
  t := jsonb_build_object('kills', v_kills, 'headshots', v_heads, 'wave', v_wave, 'wavesCleared', v_cleared, 'bossSpawns', v_boss_spawns, 'damage', dmg, 'noDamageWaves', nod,
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
    -- _grant() is the single source of truth for coins_earned; do not add v_coins here too.
    updated_at = now()
  where user_id = p_uid;
  perform public._grant(p_uid, v_coins, v_xp, nt, lt);
  perform public._missions_ensure(p_uid);
  perform public._missions_progress(p_uid, r, jsonb_build_object(
    'kills', dk, 'headshots', dh, 'waves', dc, 'wave', v_wave, 'damage', dd, 'noDamage', dn, 'revives', dr,
    'bosses', dboss, 'minibosses', dmini, 'bossKinds', bkinds, 'families', dfams, 'coins', v_coins, 'seconds', dt,
    'matchEnd', case when p_ended then 1 else 0 end,
    'mpMatch', case when p_ended and r.party_size > 1 then 1 else 0 end));
  return jsonb_build_object('coins', v_coins, 'xp', v_xp, 'normal', nt, 'lucky', lt, 'totals', t);
end $$;


create or replace function public.run_report(p_run uuid, p_report jsonb, p_ended boolean default false, p_result text default null, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); r public.runs; rewards jsonb := '{}'::jsonb;
begin
  select * into r from public.runs where id=p_run and user_id=uid for update;
  if not found then raise exception 'run_not_found'; end if;
  if r.ended_at is null and public._first_request(uid,p_request) then
    rewards := public._apply_report(uid,r,coalesce(p_report,'{}'::jsonb),p_ended,p_result);
    if p_ended then perform public._story_finish(uid,r,coalesce(p_report,'{}'::jsonb),p_result); end if;
  end if;
  return jsonb_build_object('profile',public._profile_json(uid),'rewards',rewards,'missions',public._missions_json(uid),'story',public._story_json(uid));
end $$;

create or replace function public.run_submit_offline(p_request uuid, p_report jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; el numeric; started timestamptz; ended timestamptz; last_end timestamptz;
  r public.runs; mode text := coalesce(p_report->>'mode','classic'); map int := coalesce((p_report->>'map')::int,0);
  diff text := coalesce(p_report->>'difficulty','medium'); weapons int[];
  story int := case when p_report ? 'storyLevel' then (p_report->>'storyLevel')::int else null end;
begin
  if p_request is null then raise exception 'invalid_request'; end if;
  if not public._first_request(uid,p_request) then
    return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),'duplicate',true);
  end if;
  if mode not in ('classic','infinite','timed') or not exists(select 1 from public.catalog_maps where map_id=map)
     or not exists(select 1 from public.catalog_difficulties where id=diff) then raise exception 'invalid_request'; end if;
  if mode='classic' and (story is null or story not between 1 and 10) then raise exception 'invalid_story_level'; end if;
  if mode<>'classic' then story:=null; end if;
  ended:=least(now(),coalesce((p_report->>'endedAt')::timestamptz,now()));
  el:=least(greatest(coalesce((p_report->>'elapsed')::numeric,0),0),3*3600);
  started:=ended-make_interval(secs=>el);
  if started<now()-interval '72 hours' then raise exception 'offline_run_too_old'; end if;
  select max(coalesce(ended_at,last_report_at,started_at)) into last_end from public.runs where user_id=uid;
  if last_end is not null and started<last_end then
    started:=last_end;
    if started>=ended then return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),'rejected','overlap'); end if;
  end if;
  select * into p from public.profiles where id=uid for update;
  select coalesce(array_agg(item_id::int order by slot),'{}') into weapons
    from public.player_inventory where user_id=uid and item_type='weapon' and slot<p.weapon_slots_owned;
  insert into public.runs(user_id,mode,map_id,difficulty,class_id,weapon_ids,started_at,ended_at,offline,story_level)
    values(uid,mode,map,diff,p.class_id,weapons,started,ended,true,story) returning * into r;
  perform public._apply_report(uid,r,p_report,true,p_report->>'result');
  perform public._story_finish(uid,r,p_report,p_report->>'result');
  return jsonb_build_object('profile',public._profile_json(uid),'missions',public._missions_json(uid),'story',public._story_json(uid));
end $$;

create or replace function public.mutation_reward(p_run uuid,p_wave int,p_id text,p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid:=public._uid(); r public.runs; m public.catalog_mutations; diff_mult numeric:=1; mode_mult numeric:=1; bonus int; key text:=p_id||':'||p_wave;
begin
  select * into r from public.runs where id=p_run and user_id=uid for update;
  if not found then raise exception 'run_not_found'; end if;
  select * into m from public.catalog_mutations where id=p_id;
  if not found then raise exception 'invalid_mutation'; end if;
  if r.ended_at is null and not(key=any(r.claimed_mutations)) and p_wave between 1 and coalesce((r.totals->>'wave')::int,0)+1
     and public._first_request(uid,p_request) then
    select coalesce(coins,1) into diff_mult from public.catalog_difficulties where id=r.difficulty;
    mode_mult:=case r.mode when 'infinite' then 1.5 when 'timed' then 2.5 else 1 end;
    bonus:=round((m.reward-1)*60*diff_mult*mode_mult);
    update public.runs set claimed_mutations=claimed_mutations||key where id=r.id;
    perform public._grant(uid,bonus,bonus/2);
  end if;
  return jsonb_build_object('profile',public._profile_json(uid));
end $$;

create or replace function public.story_claim_level(p_map int,p_level int,p_difficulty text,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=public._uid(); s public.player_story_progress; d numeric:=1; delta int; coins bigint; xp bigint; nt int:=0; lt int:=0;
begin
  if p_request is null then raise exception 'invalid_request'; end if;
  select * into s from public.player_story_progress where user_id=uid and map_id=p_map and story_level=p_level and difficulty=p_difficulty for update;
  if not found or s.stars<1 then raise exception 'story_incomplete'; end if;
  if not public._first_request(uid,p_request) then return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),'duplicate',true); end if;
  delta:=greatest(0,s.stars-s.claimed_stars);
  if delta=0 then raise exception 'story_reward_claimed'; end if;
  select coalesce(coins,1) into d from public.catalog_difficulties where id=p_difficulty;
  coins:=round((150+p_level*75)*d)*delta;
  xp:=round(coins/2.0);
  if s.claimed_stars<3 and s.stars>=3 then nt:=1; if p_level=10 then lt:=1; end if; end if;
  update public.player_story_progress set claimed_stars=stars,updated_at=now()
    where user_id=uid and map_id=p_map and story_level=p_level and difficulty=p_difficulty;
  perform public._grant(uid,coins,xp,nt,lt);
  return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),
    'reward',jsonb_build_object('coins',coins,'xp',xp,'normal',nt,'lucky',lt));
end $$;
revoke execute on function public.story_claim_level(int,int,text,uuid) from public, anon;
grant execute on function public.story_claim_level(int,int,text,uuid) to authenticated;

create or replace function public.story_claim_chapter(p_map int,p_difficulty text,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=public._uid(); key text:='chapter:'||p_map||':'||p_difficulty; d numeric:=1; coins bigint;
begin
  if p_request is null then raise exception 'invalid_request'; end if;
  if (select count(*) from public.player_story_progress where user_id=uid and map_id=p_map and difficulty=p_difficulty and stars>=1)<>10
    then raise exception 'story_chapter_incomplete'; end if;
  if exists(select 1 from public.player_story_claims where user_id=uid and claim_key=key) then raise exception 'story_reward_claimed'; end if;
  if not public._first_request(uid,p_request) then return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),'duplicate',true); end if;
  select coalesce(coins,1) into d from public.catalog_difficulties where id=p_difficulty;
  coins:=round(5000*d);
  insert into public.player_story_claims(user_id,claim_key) values(uid,key);
  perform public._grant(uid,coins,2500,3,1);
  return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),
    'reward',jsonb_build_object('coins',coins,'xp',2500,'normal',3,'lucky',1));
end $$;
revoke execute on function public.story_claim_chapter(int,text,uuid) from public, anon;
grant execute on function public.story_claim_chapter(int,text,uuid) to authenticated;

create or replace function public.story_claim_master(p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid:=public._uid();
begin
  if p_request is null then raise exception 'invalid_request'; end if;
  if (select count(*) from public.player_story_progress where user_id=uid and stars>=1)<>200 then raise exception 'story_master_incomplete'; end if;
  if exists(select 1 from public.player_story_claims where user_id=uid and claim_key='master') then raise exception 'story_reward_claimed'; end if;
  if not public._first_request(uid,p_request) then return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),'duplicate',true); end if;
  insert into public.player_story_claims(user_id,claim_key) values(uid,'master');
  perform public._grant(uid,100000,50000,25,10);
  return jsonb_build_object('profile',public._profile_json(uid),'story',public._story_json(uid),
    'reward',jsonb_build_object('coins',100000,'xp',50000,'normal',25,'lucky',10));
end $$;
revoke execute on function public.story_claim_master(uuid) from public, anon;
grant execute on function public.story_claim_master(uuid) to authenticated;
