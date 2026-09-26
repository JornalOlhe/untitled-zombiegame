-- Missions v2 (daily / weekly / unique) and the Index (bestiary). Applied to the project as
-- missions_v2_bestiary_part1..3 + missions_v2_fix_pool_cast; this file is their combined source.

-- ── Mission categories ────────────────────────────────────────────────────────────────────
alter table public.missions add column if not exists category text not null default 'infinite';
alter table public.missions add column if not exists period_key text;
alter table public.missions add column if not exists slot int;
alter table public.missions add column if not exists is_final boolean not null default false;
alter table public.missions drop constraint if exists missions_category_check;
alter table public.missions add constraint missions_category_check check (category in ('infinite', 'daily', 'weekly', 'unique'));
alter table public.missions drop constraint if exists missions_mission_type_check;
alter table public.missions add constraint missions_mission_type_check check (mission_type in
  ('KILL', 'WEAPON', 'HEADSHOT', 'SURVIVAL', 'BOSS', 'MINIBOSS', 'DAMAGE', 'TEAM', 'MONEY', 'NO_DAMAGE', 'DIFFICULTY',
   'CLASS', 'MAP', 'MULTIPLAYER', 'PLAYTIME', 'MATCHES', 'FINAL', 'REACH_WAVE', 'BOSS_KIND', 'LEVEL', 'ENEMY'));
create unique index if not exists missions_period_slot on public.missions (user_id, category, period_key, slot)
  where category in ('daily', 'weekly');
create unique index if not exists missions_unique_key on public.missions (user_id, template_key) where category = 'unique';
-- Retire the old infinite missions, paying out the ones already completed.
do $$
declare m record;
begin
  for m in select * from public.missions where category = 'infinite' and not claimed and completed loop
    perform public._grant(m.user_id, m.reward_coins, m.reward_xp, m.reward_normal, m.reward_lucky);
  end loop;
  update public.missions set claimed = true, claimed_at = coalesce(claimed_at, now()) where category = 'infinite' and not claimed;
end $$;

-- ── Index (bestiary) ──────────────────────────────────────────────────────────────────────
create table if not exists public.player_bestiary (
  user_id uuid not null references public.profiles (id) on delete cascade,
  enemy_key text not null,
  kills bigint not null default 0 check (kills >= 0),
  claimed_tier int not null default 0 check (claimed_tier >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, enemy_key)
);
alter table public.player_bestiary enable row level security;
drop policy if exists "own bestiary" on public.player_bestiary;
create policy "own bestiary" on public.player_bestiary for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.player_bestiary from anon, authenticated;

create table if not exists public.catalog_enemies (
  enemy_key text primary key,
  boss boolean not null default false,
  sort int not null
);
insert into public.catalog_enemies values
  ('zombie', false, 1), ('skeleton', false, 2), ('crawler', false, 3), ('constructor', false, 4), ('cyborg', false, 5),
  ('swat', false, 6), ('screamer', false, 7), ('brute', false, 8), ('stalker', false, 9), ('parasite_host', false, 10),
  ('tank', false, 11), ('parasite', false, 12), ('quarterback', true, 20), ('mutant', true, 21), ('yeti', true, 22), ('demon', true, 23)
on conflict (enemy_key) do update set boss = excluded.boss, sort = excluded.sort;
alter table public.catalog_enemies enable row level security;
drop policy if exists "read enemies" on public.catalog_enemies;
create policy "read enemies" on public.catalog_enemies for select to anon, authenticated using (true);

-- ── Periods (reset at midnight / Monday, Brasília time) ──────────────────────────────────
create or replace function public._period_key(p_cat text) returns text
language sql stable set search_path = '' as $$
  select case p_cat
    when 'daily' then to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')
    when 'weekly' then to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-"W"IW')
    else null end
$$;

create or replace function public._period_ends(p_cat text) returns timestamptz
language sql stable set search_path = '' as $$
  select case p_cat
    when 'daily' then (date_trunc('day', now() at time zone 'America/Sao_Paulo') + interval '1 day') at time zone 'America/Sao_Paulo'
    when 'weekly' then (date_trunc('week', now() at time zone 'America/Sao_Paulo') + interval '1 week') at time zone 'America/Sao_Paulo'
    else null end
$$;

create or replace function public._period_mission(p_uid uuid, p_cat text, p_key text, p_slot int, p_type text, p_params jsonb,
  p_target int, p_rarity text, p_coins int, p_xp int, p_normal int default 0, p_lucky int default 0, p_final boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.missions (user_id, category, period_key, slot, is_final, mission_type, template_key, params, target, rarity,
    reward_coins, reward_xp, reward_normal, reward_lucky)
  values (p_uid, p_cat, p_key, p_slot, p_final, p_type, p_cat || ':' || p_key || ':' || p_slot || ':' || p_type, coalesce(p_params, '{}'),
    greatest(1, p_target), p_rarity, p_coins, p_xp, p_normal, p_lucky)
  on conflict do nothing
$$;

-- Slots 1-2 are fixed (play time, kills); 3-6 come from a pool filtered by what the player can do;
-- slot 7 is the final reward for completing the other six.
create or replace function public._period_generate(p_uid uuid, p_cat text) returns void
language plpgsql security definer set search_path = '' as $$
declare k text := public._period_key(p_cat); weekly boolean := p_cat = 'weekly'; sc int := case when p_cat = 'weekly' then 5 else 1 end;
  hw int; mp bigint; fams text[]; cls int[]; pool text[]; chosen text[] := '{}'; t text; i int := 3; tries int := 0; params jsonb; target int; choice text;
begin
  if exists (select 1 from public.missions where user_id = p_uid and category = p_cat and period_key = k) then return; end if;
  select highest_wave, multiplayer_matches into hw, mp from public.player_stats where user_id = p_uid;
  select coalesce(array_agg(distinct c.family), '{}') into fams from public.player_inventory inv
    join public.catalog_items c on c.kind = 'weapon' and c.item_id::text = inv.item_id
    where inv.user_id = p_uid and inv.item_type = 'weapon' and inv.slot is not null;
  select coalesce(array_agg(class_id), '{}') into cls from public.player_classes where user_id = p_uid and unlocked;
  perform public._period_mission(p_uid, p_cat, k, 1, 'PLAYTIME', '{}', case when weekly then 7200 else 1800 end, case when weekly then 'EPIC' else 'UNCOMMON' end,
    case when weekly then 900 else 180 end, case when weekly then 700 else 150 end, case when weekly then 1 else 0 end);
  perform public._period_mission(p_uid, p_cat, k, 2, 'KILL', '{}', case when weekly then 1500 else 150 end, case when weekly then 'EPIC' else 'COMMON' end,
    case when weekly then 800 else 150 end, case when weekly then 600 else 120 end);
  pool := array['HEADSHOT', 'SURVIVAL', 'DAMAGE', 'MATCHES', 'NO_DAMAGE', 'MONEY'];
  if cardinality(fams) > 0 then pool := pool || 'WEAPON'::text; end if;
  if cardinality(cls) > 0 then pool := pool || 'CLASS'::text; end if;
  if coalesce(hw, 0) >= 3 then pool := pool || 'MINIBOSS'::text; end if;
  if coalesce(hw, 0) >= 6 then pool := pool || 'MAP'::text; end if;
  if weekly and coalesce(hw, 0) >= 9 then pool := pool || 'BOSS'::text; end if;
  if coalesce(mp, 0) >= 1 then pool := pool || array['MULTIPLAYER', 'TEAM']; end if;
  while i <= 6 and tries < 50 loop
    tries := tries + 1;
    t := pool[1 + floor(random() * cardinality(pool))::int];
    continue when t = any (chosen);
    params := '{}'::jsonb;
    target := case t
      when 'HEADSHOT' then 40 * sc when 'SURVIVAL' then 12 * sc when 'DAMAGE' then 15000 * sc when 'MATCHES' then 3 * sc
      when 'NO_DAMAGE' then 2 * sc when 'MONEY' then 600 * sc when 'WEAPON' then 60 * sc when 'CLASS' then 80 * sc
      when 'MINIBOSS' then case when weekly then 5 else 1 end when 'MAP' then least(greatest(5, coalesce(hw, 0) - 1), case when weekly then 20 else 10 end)
      when 'BOSS' then 2 when 'MULTIPLAYER' then case when weekly then 5 else 1 end when 'TEAM' then 2 * sc else 10 end;
    if t = 'WEAPON' then
      choice := fams[1 + floor(random() * cardinality(fams))::int];
      params := jsonb_build_object('family', choice);
    elsif t = 'CLASS' then
      choice := cls[1 + floor(random() * cardinality(cls))::int]::text;
      params := jsonb_build_object('classId', choice::int, 'className', (select name from public.catalog_items where kind = 'class' and item_id = choice::int));
    elsif t = 'MAP' then
      choice := (floor(random() * 5))::int::text;
      params := jsonb_build_object('mapId', choice::int, 'mapName', (select name from public.catalog_maps where map_id = choice::int));
    end if;
    perform public._period_mission(p_uid, p_cat, k, i, t, params, target, case when weekly then 'RARE' else 'COMMON' end,
      case when weekly then 700 else 140 end + floor(random() * 5)::int * 10 * sc, case when weekly then 500 else 110 end);
    chosen := chosen || t;
    i := i + 1;
  end loop;
  perform public._period_mission(p_uid, p_cat, k, 7, 'FINAL', '{}', 6, case when weekly then 'MYTHIC' else 'LEGENDARY' end,
    case when weekly then 4000 else 700 end, case when weekly then 2500 else 450 end, case when weekly then 3 else 1 end, case when weekly then 2 else 0 end, true);
end $$;

-- One-time achievements, seeded from lifetime stats so veterans start with their real progress.
create or replace function public._unique_ensure(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare s public.player_stats; lvl int; d record;
begin
  select * into s from public.player_stats where user_id = p_uid;
  select level into lvl from public.profiles where id = p_uid;
  for d in select * from (values
    ('U_KILL_500', 'KILL', '{}'::jsonb, 500, 'UNCOMMON', 600, 400, 1, 0, coalesce(s.kills, 0)),
    ('U_KILL_5000', 'KILL', '{}'::jsonb, 5000, 'EPIC', 3000, 2000, 2, 1, coalesce(s.kills, 0)),
    ('U_KILL_25000', 'KILL', '{}'::jsonb, 25000, 'MYTHIC', 12000, 8000, 5, 3, coalesce(s.kills, 0)),
    ('U_HEAD_1000', 'HEADSHOT', '{}'::jsonb, 1000, 'RARE', 1500, 1000, 1, 1, coalesce(s.headshots, 0)),
    ('U_WAVE_15', 'REACH_WAVE', '{}'::jsonb, 15, 'RARE', 1200, 900, 1, 0, coalesce(s.highest_wave, 0)),
    ('U_WAVE_30', 'REACH_WAVE', '{}'::jsonb, 30, 'LEGENDARY', 5000, 3000, 2, 2, coalesce(s.highest_wave, 0)),
    ('U_WAVE_50', 'REACH_WAVE', '{}'::jsonb, 50, 'DIVINE', 15000, 9000, 5, 5, coalesce(s.highest_wave, 0)),
    ('U_YETI', 'BOSS_KIND', '{"kind":"yeti"}'::jsonb, 1, 'EPIC', 2000, 1200, 1, 1, 0),
    ('U_DEMON', 'BOSS_KIND', '{"kind":"demon"}'::jsonb, 1, 'LEGENDARY', 4000, 2500, 2, 2, 0),
    ('U_MINI_25', 'MINIBOSS', '{}'::jsonb, 25, 'EPIC', 2500, 1800, 2, 1, coalesce(s.minibosses_killed, 0)),
    ('U_DAMAGE_1M', 'DAMAGE', '{}'::jsonb, 1000000, 'LEGENDARY', 5000, 3000, 2, 1, least(coalesce(s.damage_dealt, 0), 2000000000)),
    ('U_TIME_10H', 'PLAYTIME', '{}'::jsonb, 36000, 'EPIC', 3000, 2000, 2, 1, least(coalesce(s.total_playtime, 0), 2000000000)),
    ('U_MP_10', 'MULTIPLAYER', '{}'::jsonb, 10, 'RARE', 1500, 1000, 1, 1, coalesce(s.multiplayer_matches, 0)),
    ('U_REVIVE_25', 'TEAM', '{}'::jsonb, 25, 'RARE', 1500, 1000, 1, 0, coalesce(s.revives, 0)),
    ('U_NIGHTMARE_10', 'DIFFICULTY', '{"difficulty":"nightmare"}'::jsonb, 10, 'LEGENDARY', 5000, 3000, 2, 2, 0),
    ('U_LEVEL_25', 'LEVEL', '{}'::jsonb, 25, 'EPIC', 2500, 0, 2, 1, coalesce(lvl, 1)),
    ('U_LEVEL_50', 'LEVEL', '{}'::jsonb, 50, 'MYTHIC', 8000, 0, 4, 3, coalesce(lvl, 1))
  ) as v(k, t, params, target, rarity, coins, xp, normal, lucky, seed) loop
    insert into public.missions (user_id, category, mission_type, template_key, params, target, progress, rarity, reward_coins, reward_xp,
      reward_normal, reward_lucky, completed, completed_at)
    values (p_uid, 'unique', d.t, d.k, d.params, d.target, least(d.seed, d.target), d.rarity, d.coins, d.xp, d.normal, d.lucky,
      d.seed >= d.target, case when d.seed >= d.target then now() end)
    on conflict do nothing;
  end loop;
end $$;

create or replace function public._missions_ensure(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.profiles where id = p_uid for update;
  perform public._period_generate(p_uid, 'daily');
  perform public._period_generate(p_uid, 'weekly');
  perform public._unique_ensure(p_uid);
end $$;

create or replace function public._missions_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'category', category, 'slot', slot, 'final', is_final, 'type', mission_type, 'params', params, 'target', target,
    'progress', least(progress, target), 'rarity', rarity, 'rewardCoins', reward_coins, 'rewardXp', reward_xp,
    'rewardNormal', reward_normal, 'rewardLucky', reward_lucky, 'completed', completed, 'claimed', claimed,
    'createdAt', created_at) order by case category when 'daily' then 0 when 'weekly' then 1 else 2 end, slot nulls last, id), '[]'::jsonb)
  from public.missions
  where user_id = p_uid and (
    (category = 'daily' and period_key = public._period_key('daily')) or
    (category = 'weekly' and period_key = public._period_key('weekly')) or category = 'unique')
$$;

create or replace function public._missions_meta() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('dailyEnds', public._period_ends('daily'), 'weeklyEnds', public._period_ends('weekly'), 'now', now())
$$;

create or replace function public._missions_progress(p_uid uuid, r public.runs, d jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.missions; inc bigint; newp bigint; drank int; mrank int; lvl int; dk text := public._period_key('daily'); wk text := public._period_key('weekly');
begin
  select rank into drank from public.catalog_difficulties where id = r.difficulty;
  select level into lvl from public.profiles where id = p_uid;
  for m in select * from public.missions where user_id = p_uid and not claimed and not completed and not is_final
      and ((category = 'daily' and period_key = dk) or (category = 'weekly' and period_key = wk) or category = 'unique') for update loop
    inc := 0; newp := null;
    case m.mission_type
      when 'KILL' then inc := (d ->> 'kills')::bigint;
      when 'WEAPON' then inc := coalesce((d -> 'families' ->> (m.params ->> 'family'))::bigint, 0);
      when 'HEADSHOT' then inc := (d ->> 'headshots')::bigint;
      when 'SURVIVAL' then inc := (d ->> 'waves')::bigint;
      when 'BOSS' then inc := (d ->> 'bosses')::bigint;
      when 'MINIBOSS' then inc := (d ->> 'minibosses')::bigint;
      when 'BOSS_KIND' then inc := coalesce((d -> 'bossKinds' ->> (m.params ->> 'kind'))::bigint, 0);
      when 'DAMAGE' then inc := (d ->> 'damage')::bigint;
      when 'TEAM' then inc := (d ->> 'revives')::bigint;
      when 'MONEY' then inc := (d ->> 'coins')::bigint;
      when 'NO_DAMAGE' then inc := (d ->> 'noDamage')::bigint;
      when 'MULTIPLAYER' then inc := (d ->> 'mpMatch')::bigint;
      when 'MATCHES' then inc := coalesce((d ->> 'matchEnd')::bigint, 0);
      when 'PLAYTIME' then inc := coalesce((d ->> 'seconds')::bigint, 0);
      when 'LEVEL' then newp := greatest(m.progress, coalesce(lvl, 1));
      when 'REACH_WAVE' then newp := greatest(m.progress, (d ->> 'wave')::bigint);
      when 'CLASS' then if r.class_id = (m.params ->> 'classId')::int then inc := (d ->> 'kills')::bigint; end if;
      when 'MAP' then if r.map_id = (m.params ->> 'mapId')::int then newp := greatest(m.progress, (d ->> 'wave')::bigint); end if;
      when 'DIFFICULTY' then
        select rank into mrank from public.catalog_difficulties where id = m.params ->> 'difficulty';
        if drank >= mrank then newp := greatest(m.progress, (d ->> 'wave')::bigint); end if;
      else null;
    end case;
    if newp is null then newp := m.progress + greatest(coalesce(inc, 0), 0); end if;
    newp := least(newp, 2000000000);
    if newp <> m.progress then
      update public.missions set progress = least(newp, target)::int,
        completed = newp >= target, completed_at = case when newp >= target then now() else null end
      where id = m.id;
    end if;
  end loop;
  update public.missions f set progress = least(f.target, q.done), completed = q.done >= f.target,
    completed_at = case when q.done >= f.target then coalesce(f.completed_at, now()) else null end
  from (select category, period_key, count(*) filter (where completed)::int as done from public.missions
        where user_id = p_uid and not is_final and category in ('daily', 'weekly') and period_key in (dk, wk) group by category, period_key) q
  where f.user_id = p_uid and f.is_final and not f.claimed and f.category = q.category and f.period_key = q.period_key;
end $$;

-- ── Index milestones: 1, 5, 25, 50, 100, 250, 500, 1000, then ×1.6; bosses climb slower ──────
create or replace function public._bestiary_milestone(p_boss boolean, p_tier int) returns bigint
language sql immutable set search_path = '' as $$
  select case
    when p_tier < 1 then 0
    when not p_boss and p_tier <= 8 then (array[1, 5, 25, 50, 100, 250, 500, 1000])[p_tier]
    when not p_boss then (round(1000 * power(1.6, p_tier - 8) / 50) * 50)::bigint
    when p_tier <= 12 then (array[1, 3, 5, 8, 10, 15, 20, 30, 40, 50, 75, 100])[p_tier]
    else (round(100 * power(1.4, p_tier - 12) / 5) * 5)::bigint end
$$;

create or replace function public._bestiary_reward(p_boss boolean, p_tier int) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'coins', case when p_boss then 150 + p_tier * 120 else 40 + round(power(p_tier, 1.45) * 45) end,
    'xp', case when p_boss then 120 + p_tier * 90 else 30 + p_tier * 35 end,
    'normal', case when p_boss then case when p_tier % 2 = 0 then 1 else 0 end else case when p_tier % 3 = 0 then 1 else 0 end end,
    'lucky', case when p_boss then case when p_tier % 4 = 0 then 1 else 0 end else case when p_tier % 8 = 0 then 1 else 0 end end)
$$;

create or replace function public._bestiary_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'key', e.enemy_key, 'boss', e.boss, 'kills', coalesce(b.kills, 0), 'claimedTier', coalesce(b.claimed_tier, 0),
    'next', public._bestiary_milestone(e.boss, coalesce(b.claimed_tier, 0) + 1),
    'nextReward', public._bestiary_reward(e.boss, coalesce(b.claimed_tier, 0) + 1),
    'claimable', (select count(*) from generate_series(coalesce(b.claimed_tier, 0) + 1, coalesce(b.claimed_tier, 0) + 40) t
                  where public._bestiary_milestone(e.boss, t) <= coalesce(b.kills, 0)))
    order by e.sort), '[]'::jsonb)
  from public.catalog_enemies e
  left join public.player_bestiary b on b.user_id = p_uid and b.enemy_key = e.enemy_key
$$;

create or replace function public._bestiary_add(p_uid uuid, p_key text, p_n bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.player_bestiary (user_id, enemy_key, kills) select p_uid, p_key, p_n
    where p_n > 0 and exists (select 1 from public.catalog_enemies where enemy_key = p_key)
  on conflict (user_id, enemy_key) do update set kills = public.player_bestiary.kills + excluded.kills, updated_at = now()
$$;

create or replace function public.bestiary_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid();
begin
  return jsonb_build_object('bestiary', public._bestiary_json(uid));
end $$;

-- Claims every milestone already reached for one enemy, atomically.
create or replace function public.bestiary_claim(p_enemy text, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); b public.player_bestiary; boss boolean; t int; coins bigint := 0; xp bigint := 0; nt int := 0; lt int := 0; rw jsonb; claimed int := 0;
begin
  select e.boss into boss from public.catalog_enemies e where e.enemy_key = p_enemy;
  if not found then raise exception 'invalid_enemy'; end if;
  select * into b from public.player_bestiary where user_id = uid and enemy_key = p_enemy for update;
  if not found then raise exception 'nothing_to_claim'; end if;
  if not public._first_request(uid, p_request) then
    return jsonb_build_object('bestiary', public._bestiary_json(uid), 'profile', public._profile_json(uid), 'duplicate', true);
  end if;
  t := b.claimed_tier;
  while public._bestiary_milestone(boss, t + 1) <= b.kills and claimed < 40 loop
    t := t + 1; claimed := claimed + 1;
    rw := public._bestiary_reward(boss, t);
    coins := coins + (rw ->> 'coins')::bigint; xp := xp + (rw ->> 'xp')::bigint;
    nt := nt + (rw ->> 'normal')::int; lt := lt + (rw ->> 'lucky')::int;
  end loop;
  if claimed = 0 then raise exception 'nothing_to_claim'; end if;
  update public.player_bestiary set claimed_tier = t, updated_at = now() where user_id = uid and enemy_key = p_enemy;
  perform public._grant(uid, coins, xp, nt, lt);
  return jsonb_build_object('claimed', jsonb_build_object('enemy', p_enemy, 'tiers', claimed, 'tier', t, 'coins', coins, 'xp', xp, 'normal', nt, 'lucky', lt),
    'bestiary', public._bestiary_json(uid), 'profile', public._profile_json(uid));
end $$;

-- ── Run reports: per-enemy kills (clamped to the run's real kill delta) feed the Index ─────────
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
      cap := case b.kind when 'demon' then v_wave / 20 when 'yeti' then v_wave / 10 - v_wave / 20 else v_wave / 5 - v_wave / 10 end;
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
  v_coins := v_coins + round((dk * 5 + dh * 3) * coalesce(mult, 1));
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

create or replace function public.missions_list() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid();
begin
  perform public._missions_ensure(uid);
  perform public._missions_progress(uid, null::public.runs, '{}'::jsonb);
  return jsonb_build_object('missions', public._missions_json(uid), 'meta', public._missions_meta(), 'profile', public._profile_json(uid));
end $$;

create or replace function public.mission_claim(p_mission bigint, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); m public.missions;
begin
  select * into m from public.missions where id = p_mission and user_id = uid for update;
  if not found then raise exception 'mission_not_found'; end if;
  if m.claimed then raise exception 'already_claimed'; end if;
  if not m.completed then raise exception 'mission_incomplete'; end if;
  if m.category in ('daily', 'weekly') and m.period_key <> public._period_key(m.category) then raise exception 'mission_expired'; end if;
  update public.missions set claimed = true, claimed_at = now() where id = m.id;
  perform public._grant(uid, m.reward_coins, m.reward_xp, m.reward_normal, m.reward_lucky);
  perform public._missions_progress(uid, null::public.runs, '{}'::jsonb);
  return jsonb_build_object('claimed', jsonb_build_object('id', m.id, 'category', m.category, 'final', m.is_final, 'type', m.mission_type,
      'params', m.params, 'target', m.target, 'rarity', m.rarity, 'rewardCoins', m.reward_coins, 'rewardXp', m.reward_xp,
      'rewardNormal', m.reward_normal, 'rewardLucky', m.reward_lucky),
    'missions', public._missions_json(uid), 'meta', public._missions_meta(), 'profile', public._profile_json(uid));
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.bestiary_list(), public.bestiary_claim(text, uuid), public.missions_list(), public.mission_claim(bigint, uuid) to authenticated;
revoke execute on function public._period_key(text), public._period_ends(text), public._period_mission(uuid, text, text, int, text, jsonb, int, text, int, int, int, int, boolean),
  public._period_generate(uuid, text), public._unique_ensure(uuid), public._missions_meta(), public._bestiary_milestone(boolean, int),
  public._bestiary_reward(boolean, int), public._bestiary_json(uuid), public._bestiary_add(uuid, text, bigint),
  public._missions_ensure(uuid), public._missions_json(uuid), public._missions_progress(uuid, public.runs, jsonb),
  public._apply_report(uuid, public.runs, jsonb, boolean, text)
  from authenticated;
