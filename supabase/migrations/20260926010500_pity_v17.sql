-- v17 economy: separate Mythic (75) and Divine (150) pity per category, Normal +1 / Lucky +2,
-- Lucky Spin base cost 250 (Engineer discount still applies). Mirrors LoadoutEconomy in the game.
alter table public.profiles
  add column if not exists class_mythic_pity int not null default 0 check (class_mythic_pity between 0 and 75),
  add column if not exists class_divine_pity int not null default 0 check (class_divine_pity between 0 and 150),
  add column if not exists weapon_mythic_pity int not null default 0 check (weapon_mythic_pity between 0 and 75),
  add column if not exists weapon_divine_pity int not null default 0 check (weapon_divine_pity between 0 and 150);
update public.profiles set class_mythic_pity = least(class_pity, 75), class_divine_pity = least(class_pity, 150),
  weapon_mythic_pity = least(weapon_pity, 75), weapon_divine_pity = least(weapon_pity, 150)
  where class_pity > 0 or weapon_pity > 0;

create or replace function public._draw_tier_min(p_lucky boolean, p_min int) returns int
language plpgsql volatile set search_path = '' as $$
declare rates numeric[] := case when p_lucky then array[0, 0, 0, 59, 37, 3, 1] else array[64.95, 23, 8, 3, 0.9, 0.1, 0.05] end;
  v numeric := random() * 100; t int := 5;
begin
  for i in 1 .. 7 loop
    v := v - rates[i];
    if v < 0 then t := i - 1; exit; end if;
  end loop;
  return greatest(p_min, t);
end $$;
revoke execute on function public._draw_tier_min(boolean, int) from public, anon, authenticated;

create or replace function public.economy_roll(p_kind text, p_lucky boolean, p_payment text, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; cost int; v_tier int; result int; in_slots boolean;
  pts int := case when p_lucky then 2 else 1 end; my int; dv int; min_tier int;
begin
  if p_kind not in ('class', 'weapon') or p_payment not in ('ticket', 'coins') then raise exception 'invalid_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then
    return jsonb_build_object('profile', public._profile_json(uid), 'id', case when p_kind = 'class' then coalesce(p.pending_class, p.class_id) else coalesce(p.pending_weapon, p.weapon_id) end);
  end if;
  cost := case when p_lucky then round(250 * coalesce((select lucky_cost from public.catalog_items where kind = 'class' and item_id = p.class_id), 1)) else 50 end;
  if p_payment = 'ticket' then
    if (case when p_lucky then p.lucky_tickets else p.normal_tickets end) < 1 then raise exception 'insufficient_funds'; end if;
  elsif p.coins < cost then raise exception 'insufficient_funds';
  end if;
  my := least(75, (case when p_kind = 'class' then p.class_mythic_pity else p.weapon_mythic_pity end) + pts);
  dv := least(150, (case when p_kind = 'class' then p.class_divine_pity else p.weapon_divine_pity end) + pts);
  min_tier := case when dv >= 150 then 6 when my >= 75 then 5 else 0 end;
  v_tier := public._draw_tier_min(p_lucky, min_tier);
  select item_id into result from public.catalog_items where kind = p_kind and catalog_items.tier = v_tier order by random() limit 1;
  if result is null then raise exception 'catalog_empty'; end if;
  -- Divine resets both; natural Mythic resets only the Mythic counter.
  if v_tier >= 6 then my := 0; dv := 0; elsif v_tier >= 5 then my := 0; end if;
  update public.profiles set
    coins = coins - case when p_payment = 'coins' then cost else 0 end,
    normal_tickets = normal_tickets - case when p_payment = 'ticket' and not p_lucky then 1 else 0 end,
    lucky_tickets = lucky_tickets - case when p_payment = 'ticket' and p_lucky then 1 else 0 end,
    class_mythic_pity = case when p_kind = 'class' then my else class_mythic_pity end,
    class_divine_pity = case when p_kind = 'class' then dv else class_divine_pity end,
    weapon_mythic_pity = case when p_kind = 'weapon' then my else weapon_mythic_pity end,
    weapon_divine_pity = case when p_kind = 'weapon' then dv else weapon_divine_pity end,
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

-- Expose the four counters in the profile document (same keys as the offline save).
create or replace function public._profile_json_v17(p_uid uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('classMythicPity', class_mythic_pity, 'classDivinePity', class_divine_pity,
    'weaponMythicPity', weapon_mythic_pity, 'weaponDivinePity', weapon_divine_pity)
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
    'createdAt', p.created_at) || coalesce(public._profile_json_v17(p_uid), '{}'::jsonb);
end $$;
