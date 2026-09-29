-- Guaranteed low-value coin rewards aligned with the 0.31.x client.
-- Every credited zombie pays; completed waves pay a small bonus. This replaces the old
-- 2-coins-per-kill formula so authenticated accounts persist exactly the same pacing as local play.

create or replace function public._wave_coin_reward(p_wave int, p_mult numeric)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select greatest(
    1,
    round((3 + least(12, greatest(1, coalesce(p_wave, 1)))) * coalesce(p_mult, 1))::bigint
  )
$$;

revoke execute on function public._wave_coin_reward(int, numeric) from public, anon, authenticated;

create or replace function public._apply_report(p_uid uuid, r public.runs, p jsonb, p_ended boolean, p_result text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare prev jsonb := r.totals; el numeric; kcap numeric; wave_cap int; t jsonb; tally jsonb := null; lob public.lobbies;
  v_kills bigint; v_heads bigint; v_wave int; v_cleared int; dmg bigint; nod int; rev int; v_bosses jsonb := '{}'::jsonb; fams jsonb := '{}'::jsonb;
  dk bigint; dh bigint; dw int; dc int; dd bigint; dn int; dr int; dt int;
  v_coins bigint := 0; wave_coins bigint := 0; v_xp bigint := 0; nt int := 0; lt int := 0; mult numeric; b record; fam text; fam_sum bigint := 0; i int;
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
  dc := v_cleared - coalesce((prev ->> 'wavesCleared')::int, 0);
  dd := dmg - coalesce((prev ->> 'damage')::bigint, 0);
  dn := nod - coalesce((prev ->> 'noDamageWaves')::int, 0);
  dr := rev - coalesce((prev ->> 'revives')::int, 0);
  dt := greatest(0, floor(el_claim)::int - coalesce((prev ->> 'elapsed')::int, 0));
  select coins into mult from public.catalog_difficulties where id = r.difficulty;
  -- Guaranteed but deliberately low economy:
  -- body kill = round(1 * difficulty), headshot kill = round(2 * difficulty).
  -- Each newly completed wave pays 3 + min(12, wave) before difficulty scaling.
  if dc > 0 then
    for i in (v_cleared - dc + 1)..v_cleared loop
      wave_coins := wave_coins + public._wave_coin_reward(i, coalesce(mult, 1));
    end loop;
  end if;
  v_coins := v_coins
    + greatest(0, dk - dh) * round(coalesce(mult, 1))::bigint
    + dh * round(2 * coalesce(mult, 1))::bigint
    + wave_coins;
  v_xp := v_xp + dk * 10 + dh * 4 + dw * 40 + dd / 500 + dr * 60;
  if p_ended and p_result = 'win' and r.mode = 'timed' and el >= 290 then won := true; end if;
  t := jsonb_build_object('kills', v_kills, 'headshots', v_heads, 'wave', v_wave, 'wavesCleared', v_cleared, 'damage', dmg, 'noDamageWaves', nod,
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
    'kills', dk, 'headshots', dh, 'waves', dc, 'wave', v_wave, 'damage', dd, 'noDamage', dn, 'revives', dr,
    'bosses', dboss, 'minibosses', dmini, 'bossKinds', bkinds, 'families', dfams, 'coins', v_coins, 'seconds', dt,
    'matchEnd', case when p_ended then 1 else 0 end,
    'mpMatch', case when p_ended and r.party_size > 1 then 1 else 0 end));
  return jsonb_build_object('coins', v_coins, 'xp', v_xp, 'normal', nt, 'lucky', lt, 'totals', t);
end $$;
