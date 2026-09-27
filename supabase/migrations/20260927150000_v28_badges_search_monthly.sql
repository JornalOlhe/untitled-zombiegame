-- Dead Recoil v28 (part 2): lifetime counters, badges (10 tiers per badge), public player search
-- and profiles, and 100 new unique missions every month that accumulate until finished.

-- ── Lifetime counters (weapon families, classes, best wave per map, spins) ──────────────────
create table if not exists public.player_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value bigint not null default 0 check (value >= 0),
  primary key (user_id, key)
);
alter table public.player_counters enable row level security;
revoke all on public.player_counters from anon, authenticated;

create or replace function public._counter_add(p_uid uuid, p_key text, p_delta bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.player_counters (user_id, key, value) values (p_uid, p_key, greatest(p_delta, 0))
  on conflict (user_id, key) do update set value = least(public.player_counters.value + greatest(excluded.value, 0), 9000000000000000)
$$;
create or replace function public._counter_max(p_uid uuid, p_key text, p_value bigint) returns void
language sql security definer set search_path = '' as $$
  insert into public.player_counters (user_id, key, value) values (p_uid, p_key, greatest(p_value, 0))
  on conflict (user_id, key) do update set value = greatest(public.player_counters.value, excluded.value)
$$;

-- ── Badges ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.catalog_badges (
  key text primary key,
  name text not null,
  description text not null,
  category text not null,
  metric text not null,
  thresholds bigint[] not null check (cardinality(thresholds) = 10),
  sort int not null default 0
);
alter table public.catalog_badges enable row level security;
drop policy if exists catalog_badges_read on public.catalog_badges;
create policy catalog_badges_read on public.catalog_badges for select to anon, authenticated using (true);

create table if not exists public.player_badges (
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_key text not null references public.catalog_badges(key) on delete cascade,
  tier int not null default 0 check (tier between 0 and 10),
  seen_tier int not null default 0,
  earned jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, badge_key)
);
alter table public.player_badges enable row level security;
revoke all on public.player_badges from anon, authenticated;

insert into public.catalog_badges (key, name, description, category, metric, thresholds, sort) values
  ('playtime', 'Sobrevivente Incansável', 'Tempo total jogado.', 'Tempo', 'stat:playtime', array[1800,7200,18000,36000,72000,144000,270000,432000,720000,1260000], 1),
  ('kills', 'Exterminador', 'Zumbis eliminados.', 'Combate', 'stat:kills', array[100,500,1500,4000,10000,25000,50000,100000,200000,400000], 2),
  ('headshots', 'Olho de Águia', 'Headshots acertados.', 'Combate', 'stat:headshots', array[50,200,600,1500,4000,10000,25000,50000,100000,200000], 3),
  ('damage', 'Força Bruta', 'Dano total causado.', 'Combate', 'stat:damage', array[10000,50000,150000,400000,1000000,2500000,6000000,15000000,35000000,80000000], 4),
  ('waves', 'Muralha', 'Maior onda alcançada.', 'Sobrevivência', 'stat:wave', array[5,10,15,20,25,30,40,50,65,80], 5),
  ('games', 'Veterano', 'Partidas terminadas.', 'Sobrevivência', 'stat:games', array[5,15,40,80,150,250,400,600,850,1200], 6),
  ('wins', 'Contra o Relógio', 'Vitórias no modo contra o tempo.', 'Sobrevivência', 'stat:wins', array[1,5,15,30,60,100,175,275,400,600], 7),
  ('bosses', 'Matador de Chefes', 'Boss I e Boss II derrotados.', 'Chefes', 'stat:bosses', array[1,5,15,30,60,100,175,275,400,600], 8),
  ('minibosses', 'Caçador de Subchefes', 'Mini-bosses derrotados.', 'Chefes', 'stat:minibosses', array[1,10,25,50,100,200,350,550,800,1200], 9),
  ('multiplayer', 'Esquadrão', 'Partidas multiplayer terminadas.', 'Multiplayer', 'stat:mp', array[1,5,15,30,60,100,175,275,400,600], 10),
  ('revives', 'Anjo da Guarda', 'Aliados revividos.', 'Multiplayer', 'stat:revives', array[1,5,15,30,60,100,175,275,400,600], 11),
  ('spins', 'Apostador', 'Spins de arma e classe.', 'Spins', 'ctr:spins', array[10,50,150,300,600,1000,1750,2750,4000,6000], 12),
  ('coins', 'Magnata', 'Moedas ganhas em partidas.', 'Dinheiro', 'stat:coins', array[1000,5000,20000,50000,120000,300000,600000,1200000,2500000,5000000], 13),
  ('fam_rifle', 'Fuzileiro', 'Eliminações com fuzis.', 'Armas', 'ctr:fam:rifle', array[50,200,600,1500,4000,10000,25000,50000,100000,200000], 20),
  ('fam_shotgun', 'Estraçalhador', 'Eliminações com escopetas.', 'Armas', 'ctr:fam:shotgun', array[50,200,600,1500,4000,10000,25000,50000,100000,200000], 21),
  ('fam_sniper', 'Atirador de Elite', 'Eliminações com rifles de precisão.', 'Armas', 'ctr:fam:sniper', array[50,200,600,1500,4000,10000,25000,50000,100000,200000], 22),
  ('fam_melee', 'Lâmina Fria', 'Eliminações com armas brancas.', 'Armas', 'ctr:fam:melee', array[50,200,600,1500,4000,10000,25000,50000,100000,200000], 23),
  ('fam_bow', 'Arqueiro', 'Eliminações com arcos.', 'Armas', 'ctr:fam:bow', array[50,200,600,1500,4000,10000,25000,50000,100000,200000], 24),
  ('fam_explosive', 'Demolidor', 'Eliminações com explosivos.', 'Armas', 'ctr:fam:explosive', array[50,200,600,1500,4000,10000,25000,50000,100000,200000], 25),
  ('map_0', 'Senhor da Cidade', 'Maior onda na Cidade.', 'Mapas', 'ctr:map:0', array[3,5,8,10,15,20,25,30,40,50], 30),
  ('map_1', 'Plantão Eterno', 'Maior onda no Hospital.', 'Mapas', 'ctr:map:1', array[3,5,8,10,15,20,25,30,40,50], 31),
  ('map_2', 'Guardião da Floresta', 'Maior onda na Floresta Sombria.', 'Mapas', 'ctr:map:2', array[3,5,8,10,15,20,25,30,40,50], 32),
  ('map_3', 'Cobaia Sobrevivente', 'Maior onda no Laboratório.', 'Mapas', 'ctr:map:3', array[3,5,8,10,15,20,25,30,40,50], 33),
  ('map_4', 'Coração de Gelo', 'Maior onda na Base Ártica.', 'Mapas', 'ctr:map:4', array[3,5,8,10,15,20,25,30,40,50], 34)
on conflict (key) do update set name = excluded.name, description = excluded.description, category = excluded.category,
  metric = excluded.metric, thresholds = excluded.thresholds, sort = excluded.sort;
-- One mastery badge per class (kills while playing that class).
insert into public.catalog_badges (key, name, description, category, metric, thresholds, sort)
select 'cls_' || item_id, 'Mestre ' || name, 'Eliminações usando a classe ' || name || '.', 'Classes', 'ctr:cls:' || item_id,
  array[50,200,500,1200,3000,7000,15000,30000,60000,120000]::bigint[], 100 + item_id
from public.catalog_items where kind = 'class'
on conflict (key) do update set name = excluded.name, description = excluded.description, metric = excluded.metric, sort = excluded.sort;

create or replace function public._badge_values(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce((select jsonb_build_object(
      'stat:playtime', s.total_playtime, 'stat:kills', s.kills, 'stat:headshots', s.headshots, 'stat:damage', s.damage_dealt,
      'stat:wave', s.highest_wave, 'stat:games', s.games_played, 'stat:wins', s.wins, 'stat:bosses', s.bosses_killed,
      'stat:minibosses', s.minibosses_killed, 'stat:mp', s.multiplayer_matches, 'stat:revives', s.revives, 'stat:coins', s.coins_earned)
    from public.player_stats s where s.user_id = p_uid), '{}'::jsonb)
  || coalesce((select jsonb_object_agg('ctr:' || key, value) from public.player_counters where user_id = p_uid), '{}'::jsonb)
$$;

create or replace function public._badges_sync(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare vals jsonb := public._badge_values(p_uid); b record; v bigint; t int; cur public.player_badges; ts jsonb; have boolean;
begin
  for b in select * from public.catalog_badges loop
    v := coalesce((vals ->> b.metric)::bigint, 0);
    select count(*)::int into t from unnest(b.thresholds) th where th <= v;
    if t = 0 then continue; end if;
    select * into cur from public.player_badges where user_id = p_uid and badge_key = b.key;
    have := found;
    if have and cur.tier >= t then continue; end if;
    ts := case when have then cur.earned else '{}'::jsonb end;
    for i in (case when have then cur.tier else 0 end) + 1 .. t loop ts := ts || jsonb_build_object(i::text, now()); end loop;
    insert into public.player_badges (user_id, badge_key, tier, earned, updated_at) values (p_uid, b.key, t, ts, now())
    on conflict (user_id, badge_key) do update set tier = excluded.tier, earned = excluded.earned, updated_at = now();
  end loop;
end $$;

create or replace function public._badges_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  with vals as (select public._badge_values(p_uid) v)
  select coalesce(jsonb_agg(jsonb_build_object(
      'key', c.key, 'name', c.name, 'desc', c.description, 'category', c.category, 'thresholds', to_jsonb(c.thresholds),
      'value', coalesce((vals.v ->> c.metric)::bigint, 0), 'tier', coalesce(pb.tier, 0), 'earned', coalesce(pb.earned, '{}'::jsonb))
    order by c.sort), '[]'::jsonb)
  from public.catalog_badges c cross join vals
  left join public.player_badges pb on pb.user_id = p_uid and pb.badge_key = c.key
$$;

create or replace function public.badges_list(p_user uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := coalesce(p_user, public._uid());
begin
  if p_user is null then perform public._badges_sync(uid); end if;
  return jsonb_build_object('badges', public._badges_json(uid));
end $$;

create or replace function public.badges_ack() returns jsonb
language sql security definer set search_path = '' as $$
  update public.player_badges set seen_tier = tier where user_id = public._uid() and seen_tier < tier;
  select jsonb_build_object('ok', true)
$$;

-- Profile JSON gains the not-yet-announced badge tiers (for the in-match toast).
create or replace function public._profile_json_v17(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('classMythicPity', 0, 'weaponMythicPity', 0,
    'classDivinePity', p.class_divine_pity, 'weaponDivinePity', p.weapon_divine_pity,
    'classSecretPity', p.class_secret_pity, 'weaponSecretPity', p.weapon_secret_pity,
    'classSlotsOwned', p.class_slots_owned, 'pityVersion', 28,
    'badgesNew', coalesce((select jsonb_agg(jsonb_build_object('key', pb.badge_key, 'name', c.name, 'tier', pb.tier) order by pb.updated_at)
       from public.player_badges pb join public.catalog_badges c on c.key = pb.badge_key
       where pb.user_id = p_uid and pb.tier > pb.seen_tier), '[]'::jsonb))
  from public.profiles p where p.id = p_uid
$$;

-- ── Hooks: count families / classes / maps / spins and sync badges ─────────────────────────
create or replace function public._v28_after_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare prev jsonb := coalesce(old.totals, '{}'::jsonb); cur jsonb := coalesce(new.totals, '{}'::jsonb); dk bigint; f record;
begin
  dk := coalesce((cur ->> 'kills')::bigint, 0) - coalesce((prev ->> 'kills')::bigint, 0);
  if dk > 0 and new.class_id is not null then perform public._counter_add(new.user_id, 'cls:' || new.class_id, dk); end if;
  for f in select key, value from jsonb_each_text(coalesce(cur -> 'families', '{}'::jsonb)) loop
    if f.value::bigint > coalesce((prev -> 'families' ->> f.key)::bigint, 0) then
      perform public._counter_add(new.user_id, 'fam:' || f.key, f.value::bigint - coalesce((prev -> 'families' ->> f.key)::bigint, 0));
    end if;
  end loop;
  if new.map_id is not null then perform public._counter_max(new.user_id, 'map:' || new.map_id, coalesce((cur ->> 'wave')::bigint, 0)); end if;
  perform public._badges_sync(new.user_id);
  return new;
end $$;
drop trigger if exists runs_v28_counters on public.runs;
create trigger runs_v28_counters after update of totals on public.runs for each row
  when (old.totals is distinct from new.totals) execute function public._v28_after_report();

create or replace function public._v28_after_spin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (new.class_divine_pity, new.class_secret_pity, new.weapon_divine_pity, new.weapon_secret_pity)
     is distinct from (old.class_divine_pity, old.class_secret_pity, old.weapon_divine_pity, old.weapon_secret_pity)
     and (new.normal_tickets < old.normal_tickets or new.lucky_tickets < old.lucky_tickets or new.coins < old.coins) then
    perform public._counter_add(new.id, 'spins', 1);
    perform public._badges_sync(new.id);
  end if;
  return new;
end $$;
drop trigger if exists profiles_v28_spins on public.profiles;
create trigger profiles_v28_spins after update on public.profiles for each row execute function public._v28_after_spin();

-- ── Player search and public profiles ───────────────────────────────────────────────────────
create or replace function public.profile_search(p_query text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := regexp_replace(coalesce(p_query, ''), '[^A-Za-z0-9_]', '', 'g');
begin
  if length(q) < 2 then return jsonb_build_object('results', '[]'::jsonb); end if;
  return jsonb_build_object('results', coalesce((
    select jsonb_agg(x order by x ->> 'username') from (
      select jsonb_build_object('userId', p.id, 'username', p.username, 'displayName', p.display_name, 'level', p.level,
        'highestWave', s.highest_wave, 'kills', s.kills,
        'badges', (select count(*) from public.player_badges b where b.user_id = p.id and b.tier > 0)) x
      from public.profiles p left join public.player_stats s on s.user_id = p.id
      where p.username::text ilike q || '%'
      order by p.username limit 20) t), '[]'::jsonb));
end $$;

create or replace function public.profile_public(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare p public.profiles; s public.player_stats;
begin
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'not_found'; end if;
  select * into s from public.player_stats where user_id = p_user;
  return jsonb_build_object(
    'userId', p.id, 'username', p.username, 'displayName', p.display_name, 'level', p.level, 'totalXp', p.total_xp,
    'classId', p.class_id, 'weaponId', p.weapon_id, 'cosmetics', p.cosmetics, 'createdAt', p.created_at,
    'stats', jsonb_build_object('kills', s.kills, 'headshots', s.headshots, 'bossesKilled', s.bosses_killed,
      'minibossesKilled', s.minibosses_killed, 'highestWave', s.highest_wave, 'gamesPlayed', s.games_played, 'wins', s.wins,
      'totalPlaytime', s.total_playtime, 'damageDealt', s.damage_dealt, 'revives', s.revives, 'multiplayerMatches', s.multiplayer_matches),
    'badges', public._badges_json(p_user));
end $$;

-- ── Monthly unique missions: 100 per month, the same set for everyone, never expire ─────────
create or replace function public._monthly_generate(p_uid uuid, p_month text) returns void
language plpgsql security definer set search_path = '' as $$
declare i int; h bigint; k int; t text; params jsonb; target int; rar text; coins int; xp int; nt int; lt int; lvl numeric;
  fams text[] := array['rifle', 'shotgun', 'sniper', 'melee', 'bow', 'explosive'];
  kinds text[] := array['quarterback','roadblock','juggernaut','wrecker','surgeon','patient_zero','butcher','plague_host','forest_stalker','gravekeeper','wendigo','demon','mutant','prototype_x','abomination','omega','frost_brute','cryo_hunter','yeti','avalanche_titan'];
  types text[] := array['KILL','HEADSHOT','WEAPON','CLASS','BOSS_KIND','MINIBOSS','BOSS','DAMAGE','REACH_WAVE','MAP','DIFFICULTY','NO_DAMAGE','SURVIVAL','PLAYTIME','MULTIPLAYER','TEAM','MONEY','MATCHES'];
begin
  if exists (select 1 from public.missions where user_id = p_uid and category = 'unique' and period_key = p_month) then return; end if;
  for i in 1 .. 100 loop
    h := abs(hashtext(p_month || ':' || i)::bigint);
    t := types[1 + (h % cardinality(types))::int];
    lvl := 0.35 + ((h / 97) % 100) / 100.0 * 0.65; -- 0.35 .. 1.0 difficulty
    params := '{}'::jsonb;
    target := case t
      when 'KILL' then round(2000 + lvl * 18000) when 'HEADSHOT' then round(500 + lvl * 4500)
      when 'WEAPON' then round(400 + lvl * 3600) when 'CLASS' then round(300 + lvl * 2700)
      when 'BOSS_KIND' then 1 + round(lvl * 6) when 'MINIBOSS' then round(10 + lvl * 50) when 'BOSS' then round(4 + lvl * 26)
      when 'DAMAGE' then round(200000 + lvl * 2800000) when 'REACH_WAVE' then round(15 + lvl * 30)
      when 'MAP' then round(10 + lvl * 25) when 'DIFFICULTY' then round(10 + lvl * 20) when 'NO_DAMAGE' then round(5 + lvl * 25)
      when 'SURVIVAL' then round(100 + lvl * 500) when 'PLAYTIME' then round(18000 + lvl * 54000)
      when 'MULTIPLAYER' then round(5 + lvl * 25) when 'TEAM' then round(10 + lvl * 50) when 'MONEY' then round(5000 + lvl * 35000)
      else round(20 + lvl * 80) end;
    k := ((h / 7919) % 100)::int;
    if t = 'WEAPON' then params := jsonb_build_object('family', fams[1 + k % 6]);
    elsif t = 'CLASS' then
      params := (select jsonb_build_object('classId', item_id, 'className', name) from public.catalog_items where kind = 'class' and tier < 7 order by item_id offset (k % 22) limit 1);
    elsif t = 'BOSS_KIND' then params := jsonb_build_object('kind', kinds[1 + k % 20]);
    elsif t = 'MAP' then params := jsonb_build_object('mapId', k % 5, 'mapName', (select name from public.catalog_maps where map_id = k % 5));
    elsif t = 'DIFFICULTY' then params := jsonb_build_object('difficulty', case when k % 2 = 0 then 'hard' else 'nightmare' end);
    end if;
    rar := case when lvl > 0.93 then 'DIVINE' when lvl > 0.82 then 'MYTHIC' when lvl > 0.68 then 'LEGENDARY' when lvl > 0.52 then 'EPIC' else 'RARE' end;
    coins := round((1500 + lvl * 6500) / 10) * 10; -- scaled x0.4 by the insert trigger
    xp := round(500 + lvl * 2500);
    nt := case when lvl > 0.6 then 1 else 0 end + case when lvl > 0.9 then 1 else 0 end;
    lt := case when lvl > 0.8 then 1 else 0 end;
    insert into public.missions (user_id, category, period_key, slot, mission_type, template_key, params, target, rarity,
      reward_coins, reward_xp, reward_normal, reward_lucky)
    values (p_uid, 'unique', p_month, i, t, 'm:' || p_month || ':' || i, params, greatest(1, target), rar, coins, xp, nt, lt)
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
  perform public._monthly_generate(p_uid, to_char(now() at time zone 'utc', 'YYYY-MM'));
end $$;

create or replace function public._missions_json(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'category', category, 'slot', slot, 'final', is_final, 'type', mission_type, 'params', params, 'target', target,
    'progress', least(progress, target), 'rarity', rarity, 'rewardCoins', reward_coins, 'rewardXp', reward_xp,
    'rewardNormal', reward_normal, 'rewardLucky', reward_lucky, 'completed', completed, 'claimed', claimed,
    'month', case when category = 'unique' then period_key end,
    'createdAt', created_at) order by case category when 'daily' then 0 when 'weekly' then 1 else 2 end, period_key nulls first, slot nulls last, id), '[]'::jsonb)
  from public.missions
  where user_id = p_uid and (
    (category = 'daily' and period_key = public._period_key('daily')) or
    (category = 'weekly' and period_key = public._period_key('weekly')) or category = 'unique')
$$;

-- Backfill badges for existing players from lifetime stats.
do $$ declare u record; begin
  for u in select user_id from public.player_stats loop perform public._badges_sync(u.user_id); end loop;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.badges_list(uuid), public.badges_ack(), public.profile_search(text), public.profile_public(uuid) to authenticated;
revoke execute on function public._counter_add(uuid, text, bigint), public._counter_max(uuid, text, bigint), public._badge_values(uuid),
  public._badges_sync(uuid), public._badges_json(uuid), public._monthly_generate(uuid, text), public._v28_after_report(), public._v28_after_spin(),
  public._profile_json_v17(uuid), public._missions_json(uuid), public._missions_ensure(uuid)
  from authenticated;
