-- v32 pity: Normal spin +1, Lucky spin +2. Guaranteed Mythic at 75, Divine at 150, Secret at 300.
-- Reward resets: Mythic -> mythic; Divine -> divine + mythic; Secret -> all three.
create or replace function public._profile_json_v17(p_uid uuid)
 returns jsonb language sql stable security definer set search_path to ''
as $function$
  select jsonb_build_object('classMythicPity', p.class_mythic_pity, 'weaponMythicPity', p.weapon_mythic_pity,
    'classDivinePity', p.class_divine_pity, 'weaponDivinePity', p.weapon_divine_pity,
    'classSecretPity', p.class_secret_pity, 'weaponSecretPity', p.weapon_secret_pity,
    'classSlotsOwned', p.class_slots_owned, 'pityVersion', 32,
    'badgesNew', coalesce((select jsonb_agg(jsonb_build_object('key', pb.badge_key, 'name', c.name, 'tier', pb.tier) order by pb.updated_at)
       from public.player_badges pb join public.catalog_badges c on c.key = pb.badge_key
       where pb.user_id = p_uid and pb.tier > pb.seen_tier), '[]'::jsonb))
  from public.profiles p where p.id = p_uid
$function$;

create or replace function public.economy_roll(p_kind text, p_lucky boolean, p_payment text, p_request uuid default null, p_pref integer default null)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare uid uuid := public._uid(); p public.profiles; cost int; v_tier int; result int; in_slots boolean;
  pts int := case when p_lucky then 2 else 1 end; my int; dv int; sc int; min_tier int; n int; pref_tier int;
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
  my := least(75, greatest(0, (case when p_kind = 'class' then p.class_mythic_pity else p.weapon_mythic_pity end)) + pts);
  dv := least(150, greatest(0, (case when p_kind = 'class' then p.class_divine_pity else p.weapon_divine_pity end)) + pts);
  sc := least(300, greatest(0, (case when p_kind = 'class' then p.class_secret_pity else p.weapon_secret_pity end)) + pts);
  min_tier := case when sc >= 300 then 7 when dv >= 150 then 6 when my >= 75 then 5 else 0 end;
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
  if v_tier >= 7 then sc := 0; dv := 0; my := 0;
  elsif v_tier >= 6 then dv := 0; my := 0;
  elsif v_tier >= 5 then my := 0;
  end if;
  update public.profiles set
    coins = coins - case when p_payment = 'coins' then cost else 0 end,
    normal_tickets = normal_tickets - case when p_payment = 'ticket' and not p_lucky then 1 else 0 end,
    lucky_tickets = lucky_tickets - case when p_payment = 'ticket' and p_lucky then 1 else 0 end,
    class_mythic_pity = case when p_kind = 'class' then my else class_mythic_pity end,
    class_divine_pity = case when p_kind = 'class' then dv else class_divine_pity end,
    class_secret_pity = case when p_kind = 'class' then sc else class_secret_pity end,
    weapon_mythic_pity = case when p_kind = 'weapon' then my else weapon_mythic_pity end,
    weapon_divine_pity = case when p_kind = 'weapon' then dv else weapon_divine_pity end,
    weapon_secret_pity = case when p_kind = 'weapon' then sc else weapon_secret_pity end,
    pending_weapon = case when p_kind = 'weapon' then result else pending_weapon end,
    updated_at = now()
  where id = uid;
  if p_kind = 'class' then
    in_slots := exists (select 1 from public.player_classes where user_id = uid and class_id = result and slot is not null);
    update public.profiles set pending_class = case when in_slots then null else result end where id = uid;
  end if;
  return jsonb_build_object('profile', public._profile_json(uid), 'id', result);
end $function$;
