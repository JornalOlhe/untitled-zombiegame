-- Allow duplicate weapons in different loadout slots and make every owned weapon slot usable.
-- Cosmetics remain unique per player. Weapon slot identity is now explicit, so two equal
-- weapons can coexist without both being marked equipped.

alter table public.profiles
  add column if not exists weapon_slot int not null default 0
  check (weapon_slot between 0 and 4);

-- The original all-item uniqueness constraint accidentally prohibited duplicate weapons.
alter table public.player_inventory
  drop constraint if exists player_inventory_user_id_item_type_item_id_key;

-- Cosmetics are still one-copy ownership items. Weapons intentionally have no item-id
-- uniqueness rule; the existing unique slot index remains the weapon invariant.
create unique index if not exists player_inventory_cosmetic_unique
  on public.player_inventory (user_id, item_id)
  where item_type = 'cosmetic';

-- Repair legacy accounts: every already-owned weapon slot gets the common Machete (id 0)
-- when no row exists for that slot. Locked slots are untouched.
insert into public.player_inventory (user_id, item_id, item_type, slot, equipped)
select p.id, '0', 'weapon', s.slot, false
from public.profiles p
cross join lateral generate_series(0, p.weapon_slots_owned - 1) as s(slot)
where not exists (
  select 1
  from public.player_inventory i
  where i.user_id = p.id
    and i.item_type = 'weapon'
    and i.slot = s.slot
);

update public.profiles
set weapon_slot = case
  when weapon_slot between 0 and weapon_slots_owned - 1 then weapon_slot
  else 0
end;

-- Keep exactly one concrete weapon row marked equipped for each profile.
update public.player_inventory
set equipped = false
where item_type = 'weapon';

update public.player_inventory i
set equipped = true
from public.profiles p
where i.user_id = p.id
  and i.item_type = 'weapon'
  and i.slot = p.weapon_slot;

-- Profile JSON now exposes exact equipped weapon slot in addition to weapon id.
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

-- Weapon spins always become pending, even when the same weapon id already exists in
-- another slot. Class behavior stays deduplicated.
create or replace function public.economy_roll(p_kind text, p_lucky boolean, p_payment text, p_request uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles; cost int; v_tier int; result int; in_slots boolean;
  pts int := case when p_lucky then 2 else 1 end; my int; dv int; min_tier int;
begin
  if p_kind not in ('class', 'weapon') or p_payment not in ('ticket', 'coins') then raise exception 'invalid_request'; end if;
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then
    return jsonb_build_object('profile', public._profile_json(uid), 'id',
      case when p_kind = 'class' then coalesce(p.pending_class, p.class_id)
           else coalesce(p.pending_weapon, p.weapon_id) end);
  end if;
  cost := case when p_lucky then round(250 * coalesce((select lucky_cost from public.catalog_items where kind = 'class' and item_id = p.class_id), 1)) else 50 end;
  if p_payment = 'ticket' then
    if (case when p_lucky then p.lucky_tickets else p.normal_tickets end) < 1 then raise exception 'insufficient_funds'; end if;
  elsif p.coins < cost then
    raise exception 'insufficient_funds';
  end if;

  my := least(75, (case when p_kind = 'class' then p.class_mythic_pity else p.weapon_mythic_pity end) + pts);
  dv := least(150, (case when p_kind = 'class' then p.class_divine_pity else p.weapon_divine_pity end) + pts);
  min_tier := case when dv >= 150 then 6 when my >= 75 then 5 else 0 end;
  v_tier := public._draw_tier_min(p_lucky, min_tier);

  select item_id into result
  from public.catalog_items
  where kind = p_kind and catalog_items.tier = v_tier
  order by random()
  limit 1;
  if result is null then raise exception 'catalog_empty'; end if;

  if v_tier >= 6 then my := 0; dv := 0;
  elsif v_tier >= 5 then my := 0;
  end if;

  update public.profiles set
    coins = coins - case when p_payment = 'coins' then cost else 0 end,
    normal_tickets = normal_tickets - case when p_payment = 'ticket' and not p_lucky then 1 else 0 end,
    lucky_tickets = lucky_tickets - case when p_payment = 'ticket' and p_lucky then 1 else 0 end,
    class_mythic_pity = case when p_kind = 'class' then my else class_mythic_pity end,
    class_divine_pity = case when p_kind = 'class' then dv else class_divine_pity end,
    weapon_mythic_pity = case when p_kind = 'weapon' then my else weapon_mythic_pity end,
    weapon_divine_pity = case when p_kind = 'weapon' then dv else weapon_divine_pity end,
    pending_weapon = case when p_kind = 'weapon' then result else pending_weapon end,
    updated_at = now()
  where id = uid;

  if p_kind = 'class' then
    in_slots := exists (
      select 1 from public.player_classes
      where user_id = uid and class_id = result and slot is not null
    );
    update public.profiles
    set pending_class = case when in_slots then null else result end
    where id = uid;
  end if;

  return jsonb_build_object('profile', public._profile_json(uid), 'id', result);
end $$;

-- Equip/replace by slot, never by weapon id. This is what makes duplicate copies safe.
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
      delete from public.player_inventory
      where user_id = uid and item_type = 'weapon' and slot = p_slot;
      insert into public.player_inventory (user_id, item_id, item_type, slot, equipped)
      values (uid, pending::text, 'weapon', p_slot, true);
      update public.profiles set pending_weapon = null where id = uid;
    else
      delete from public.player_classes where user_id = uid and (slot = p_slot or class_id = pending);
      insert into public.player_classes (user_id, class_id, slot) values (uid, pending, p_slot);
      update public.profiles set pending_class = null where id = uid;
    end if;
    target := pending;
  else
    if p_kind = 'weapon' then
      select item_id::int into target
      from public.player_inventory
      where user_id = uid and item_type = 'weapon' and slot = p_slot;
    else
      select class_id into target
      from public.player_classes
      where user_id = uid and slot = p_slot;
    end if;
    if target is null then raise exception 'empty_slot'; end if;
  end if;

  if p_kind = 'weapon' then
    update public.player_inventory
    set equipped = false
    where user_id = uid and item_type = 'weapon';
    update public.player_inventory
    set equipped = true
    where user_id = uid and item_type = 'weapon' and slot = p_slot;
    update public.profiles
    set weapon_id = target, weapon_slot = p_slot, updated_at = now()
    where id = uid;
  else
    update public.profiles set class_id = target, updated_at = now() where id = uid;
    update public.player_classes set equipped = (class_id = target) where user_id = uid;
  end if;

  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

-- Newly purchased weapon slots immediately contain a Machete instead of being empty.
create or replace function public.economy_buy_slot(p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); p public.profiles;
  prices int[] := array[0, 0, 6000, 18000, 45000, 90000];
  price int; new_slot int;
begin
  select * into p from public.profiles where id = uid for update;
  if not public._first_request(uid, p_request) then return jsonb_build_object('profile', public._profile_json(uid)); end if;
  if p.weapon_slots_owned >= 5 then raise exception 'max_slots'; end if;
  price := prices[p.weapon_slots_owned + 2];
  if p.coins < price then raise exception 'insufficient_funds'; end if;

  new_slot := p.weapon_slots_owned;
  update public.profiles
  set coins = coins - price,
      weapon_slots_owned = weapon_slots_owned + 1,
      updated_at = now()
  where id = uid;

  insert into public.player_inventory (user_id, item_id, item_type, slot, equipped)
  select uid, '0', 'weapon', new_slot, false
  where not exists (
    select 1 from public.player_inventory
    where user_id = uid and item_type = 'weapon' and slot = new_slot
  );

  return jsonb_build_object('profile', public._profile_json(uid));
end $$;

-- Functions remain authenticated RPC endpoints; direct table writes stay denied by the
-- existing RLS/grant model.
