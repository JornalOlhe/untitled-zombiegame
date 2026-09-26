-- Multiplayer lobbies (1-4 players). Lobby rows are the durable state; realtime channels carry
-- the fast in-match traffic. The host is authoritative; host migration promotes the earliest
-- fresh member when the host stops heartbeating.

create or replace function public._lobby_json(p_lobby uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', l.id, 'code', l.lobby_code, 'hostId', l.host_id, 'map', l.map_id, 'difficulty', l.difficulty, 'mode', l.mode,
    'status', l.status, 'isPublic', l.is_public, 'maxPlayers', l.max_players, 'seed', l.match_seed,
    'wave', l.host_wave, 'startedAt', l.started_at,
    'players', coalesce((select jsonb_agg(jsonb_build_object('userId', p.user_id, 'username', p.username, 'ready', p.ready,
        'host', p.user_id = l.host_id, 'joinedAt', p.joined_at, 'lastSeen', p.last_seen) order by p.joined_at)
      from public.lobby_players p where p.lobby_id = l.id), '[]'::jsonb))
  from public.lobbies l where l.id = p_lobby
$$;

create or replace function public._lobby_code() returns text
language plpgsql volatile set search_path = '' as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; code text;
begin
  loop
    code := '';
    for i in 1 .. 6 loop code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.lobbies where lobby_code = code);
  end loop;
  return code;
end $$;

-- Removes a member; promotes a new host or closes an empty lobby.
create or replace function public._lobby_remove(p_lobby uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies; next_host uuid;
begin
  select * into l from public.lobbies where id = p_lobby for update;
  if not found then return; end if;
  -- Keep the departing player's last host tally inside their run so rewards stay capped.
  update public.runs r set totals = r.totals || jsonb_build_object('hostTally', lp.host_tally)
    from public.lobby_players lp where lp.lobby_id = p_lobby and lp.user_id = p_user and r.lobby_id = p_lobby and r.user_id = p_user and r.ended_at is null;
  delete from public.lobby_players where lobby_id = p_lobby and user_id = p_user;
  if l.host_id = p_user then
    select user_id into next_host from public.lobby_players where lobby_id = p_lobby order by last_seen > now() - interval '15 seconds' desc, joined_at limit 1;
    if next_host is null then
      update public.lobbies set status = 'closed', updated_at = now() where id = p_lobby;
    else
      update public.lobbies set host_id = next_host, updated_at = now() where id = p_lobby;
    end if;
  else
    update public.lobbies set updated_at = now() where id = p_lobby;
  end if;
end $$;

create or replace function public._lobby_leave_all(p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare lid uuid;
begin
  for lid in select lobby_id from public.lobby_players where user_id = p_uid loop
    perform public._lobby_remove(lid, p_uid);
  end loop;
end $$;

create or replace function public._lobby_add(p_lobby uuid, p_uid uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lobby_players (lobby_id, user_id, username)
    values (p_lobby, p_uid, (select username::text from public.profiles where id = p_uid))
    on conflict (lobby_id, user_id) do update set last_seen = now();
  update public.lobbies set updated_at = now() where id = p_lobby;
end $$;

create or replace function public.lobby_create(p_map int default 0, p_difficulty text default 'medium', p_mode text default 'classic', p_public boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); lid uuid;
begin
  perform public._bootstrap(uid, null, null);
  perform public._lobby_leave_all(uid);
  insert into public.lobbies (lobby_code, host_id, map_id, difficulty, mode, is_public)
    values (public._lobby_code(), uid, p_map, p_difficulty, p_mode, coalesce(p_public, false)) returning id into lid;
  perform public._lobby_add(lid, uid);
  return public._lobby_json(lid);
end $$;

create or replace function public._lobby_join_checked(p_lobby uuid, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies; n int;
begin
  select * into l from public.lobbies where id = p_lobby for update;
  if not found or l.status = 'closed' then raise exception 'lobby_not_found'; end if;
  if exists (select 1 from public.lobby_players where lobby_id = p_lobby and user_id = p_uid) then
    update public.lobby_players set last_seen = now() where lobby_id = p_lobby and user_id = p_uid;
    return public._lobby_json(p_lobby);                         -- reconnect: same row, no duplicate
  end if;
  if exists (select 1 from public.lobby_bans where lobby_id = p_lobby and user_id = p_uid) then raise exception 'lobby_banned'; end if;
  if l.status <> 'open' then raise exception 'lobby_in_game'; end if;
  select count(*) into n from public.lobby_players where lobby_id = p_lobby;
  if n >= l.max_players then raise exception 'lobby_full'; end if;
  perform public._lobby_leave_all(p_uid);
  perform public._lobby_add(p_lobby, p_uid);
  return public._lobby_json(p_lobby);
end $$;

create or replace function public.lobby_join(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); lid uuid;
begin
  perform public._bootstrap(uid, null, null);
  select id into lid from public.lobbies where lobby_code = upper(trim(p_code)) and status <> 'closed';
  if lid is null then raise exception 'lobby_not_found'; end if;
  return public._lobby_join_checked(lid, uid);
end $$;

create or replace function public.lobby_quick_play(p_map int default null, p_difficulty text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); lid uuid;
begin
  perform public._bootstrap(uid, null, null);
  select l.id into lid from public.lobbies l
    where l.status = 'open' and l.is_public
      and (p_difficulty is null or l.difficulty = p_difficulty)
      and not exists (select 1 from public.lobby_bans b where b.lobby_id = l.id and b.user_id = uid)
      and (select count(*) from public.lobby_players p where p.lobby_id = l.id) < l.max_players
      and exists (select 1 from public.lobby_players p where p.lobby_id = l.id and p.user_id = l.host_id and p.last_seen > now() - interval '30 seconds')
      and not exists (select 1 from public.lobby_players p where p.lobby_id = l.id and p.user_id = uid)
    order by (select count(*) from public.lobby_players p where p.lobby_id = l.id) desc, l.created_at
    limit 1;
  if lid is not null then return public._lobby_join_checked(lid, uid) || jsonb_build_object('quickPlay', 'joined'); end if;
  return public.lobby_create(coalesce(p_map, 0), coalesce(p_difficulty, 'medium'), 'classic', true) || jsonb_build_object('quickPlay', 'created');
end $$;

create or replace function public.lobby_leave(p_lobby uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public._lobby_remove(p_lobby, public._uid());
end $$;

create or replace function public.lobby_state(p_lobby uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.lobby_players where lobby_id = p_lobby and user_id = public._uid()) then raise exception 'not_in_lobby'; end if;
  return public._lobby_json(p_lobby);
end $$;

create or replace function public.lobby_set_ready(p_lobby uuid, p_ready boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid();
begin
  update public.lobby_players set ready = p_ready, last_seen = now() where lobby_id = p_lobby and user_id = uid;
  if not found then raise exception 'not_in_lobby'; end if;
  update public.lobbies set updated_at = now() where id = p_lobby;
  return public._lobby_json(p_lobby);
end $$;

create or replace function public._require_host(p_lobby uuid) returns public.lobbies
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies;
begin
  select * into l from public.lobbies where id = p_lobby for update;
  if not found then raise exception 'lobby_not_found'; end if;
  if l.host_id <> public._uid() then raise exception 'not_host'; end if;
  return l;
end $$;

create or replace function public.lobby_update(p_lobby uuid, p_map int, p_difficulty text, p_mode text, p_public boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies := public._require_host(p_lobby);
begin
  if l.status <> 'open' then raise exception 'lobby_in_game'; end if;
  update public.lobbies set map_id = coalesce(p_map, map_id), difficulty = coalesce(p_difficulty, difficulty),
    mode = coalesce(p_mode, mode), is_public = coalesce(p_public, is_public), updated_at = now() where id = p_lobby;
  -- Changing the rules invalidates everybody's READY.
  update public.lobby_players set ready = false where lobby_id = p_lobby and user_id <> l.host_id;
  return public._lobby_json(p_lobby);
end $$;

create or replace function public.lobby_kick(p_lobby uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies := public._require_host(p_lobby);
begin
  if p_user = l.host_id then raise exception 'invalid_request'; end if;
  insert into public.lobby_bans values (p_lobby, p_user) on conflict do nothing;
  perform public._lobby_remove(p_lobby, p_user);
  return public._lobby_json(p_lobby);
end $$;

create or replace function public.lobby_start(p_lobby uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies := public._require_host(p_lobby);
begin
  if l.status <> 'open' then raise exception 'lobby_in_game'; end if;
  if exists (select 1 from public.lobby_players where lobby_id = p_lobby and user_id <> l.host_id and not ready) then
    raise exception 'players_not_ready';
  end if;
  update public.lobby_players set host_tally = '{}'::jsonb, last_seen = now() where lobby_id = p_lobby;
  update public.lobbies set status = 'in_game', started_at = now(), ended_at = null, host_wave = 0,
    match_seed = floor(random() * 2147483647)::int, updated_at = now() where id = p_lobby;
  return public._lobby_json(p_lobby);
end $$;

-- Presence + host migration. Returns the lobby state (with the possibly new host).
create or replace function public.lobby_heartbeat(p_lobby uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); l public.lobbies; stale uuid; fresh_host boolean;
begin
  update public.lobby_players set last_seen = now() where lobby_id = p_lobby and user_id = uid;
  if not found then raise exception 'not_in_lobby'; end if;
  select * into l from public.lobbies where id = p_lobby for update;
  for stale in select user_id from public.lobby_players where lobby_id = p_lobby and last_seen < now() - interval '45 seconds' loop
    perform public._lobby_remove(p_lobby, stale);
  end loop;
  select * into l from public.lobbies where id = p_lobby;
  select last_seen > now() - interval '15 seconds' into fresh_host from public.lobby_players where lobby_id = p_lobby and user_id = l.host_id;
  if coalesce(fresh_host, false) = false then
    update public.lobbies set host_id = (select user_id from public.lobby_players where lobby_id = p_lobby
      and last_seen > now() - interval '15 seconds' order by joined_at limit 1), updated_at = now()
    where id = p_lobby and exists (select 1 from public.lobby_players where lobby_id = p_lobby and last_seen > now() - interval '15 seconds');
  end if;
  return public._lobby_json(p_lobby);
end $$;

-- Host-only authoritative match report: wave reached and per-player tallies used to cap each
-- player's own reward claims.
create or replace function public.lobby_report(p_lobby uuid, p_wave int, p_tallies jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies := public._require_host(p_lobby); el numeric; k text; v jsonb;
begin
  if l.status <> 'in_game' then return; end if;
  el := extract(epoch from now() - l.started_at);
  update public.lobbies set host_wave = greatest(host_wave, least(p_wave, floor(el / 10)::int + 2)) where id = p_lobby;
  if jsonb_typeof(p_tallies) = 'object' then
    for k, v in select * from jsonb_each(p_tallies) loop
      update public.lobby_players set host_tally = v where lobby_id = p_lobby and user_id::text = k and jsonb_typeof(v) = 'object';
    end loop;
  end if;
end $$;

create or replace function public.lobby_finish(p_lobby uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies := public._require_host(p_lobby);
begin
  update public.lobbies set status = 'open', ended_at = now(), updated_at = now() where id = p_lobby and status = 'in_game';
  update public.lobby_players set ready = false where lobby_id = p_lobby;
  return public._lobby_json(p_lobby);
end $$;

-- Only the SECURITY DEFINER entry points are callable by players; internals are private.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.get_session(), public.set_username(text, text),
  public.economy_roll(text, boolean, text, uuid), public.economy_equip(text, int, text, uuid), public.economy_buy_slot(uuid),
  public.cosmetic_buy(text, uuid), public.save_preferences(jsonb, jsonb),
  public.run_start(text, int, text, uuid, uuid), public.run_report(uuid, jsonb, boolean, text, uuid),
  public.run_submit_offline(uuid, jsonb), public.mutation_reward(uuid, int, text, uuid),
  public.missions_list(), public.mission_claim(bigint, uuid),
  public.lobby_create(int, text, text, boolean), public.lobby_join(text), public.lobby_quick_play(int, text),
  public.lobby_leave(uuid), public.lobby_state(uuid), public.lobby_set_ready(uuid, boolean),
  public.lobby_update(uuid, int, text, text, boolean), public.lobby_kick(uuid, uuid), public.lobby_start(uuid),
  public.lobby_heartbeat(uuid), public.lobby_report(uuid, int, jsonb), public.lobby_finish(uuid)
  to authenticated;
revoke execute on function public._uid(), public._first_request(uuid, uuid), public._grant(uuid, bigint, bigint, int, int),
  public._profile_json(uuid), public._bootstrap(uuid, text, text), public._apply_report(uuid, public.runs, jsonb, boolean, text),
  public._mission_generate(uuid), public._missions_ensure(uuid), public._missions_json(uuid),
  public._missions_progress(uuid, public.runs, jsonb), public._lobby_json(uuid), public._lobby_remove(uuid, uuid),
  public._lobby_leave_all(uuid), public._lobby_add(uuid, uuid), public._lobby_join_checked(uuid, uuid),
  public._require_host(uuid), public.handle_new_user(), public._clamp(numeric, numeric, numeric), public._xp_needed(int),
  public._draw_tier(boolean, boolean), public._rarity_names(), public._mission_targets(text), public._weighted_pick(numeric[]),
  public._lobby_code()
  from authenticated;
-- is_lobby_member is used by RLS policies evaluated as the calling role.
grant execute on function public.is_lobby_member(uuid) to authenticated;
