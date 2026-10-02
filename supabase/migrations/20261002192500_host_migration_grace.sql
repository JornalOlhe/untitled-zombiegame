-- Keep host election aligned with the 45 s stale-player grace window.
-- A 15 s host-only threshold could promote a guest while the real host was still loading,
-- throttled, or briefly stalled, creating competing host state and reconnect loops mid-match.

create or replace function public._lobby_remove(p_lobby uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare l public.lobbies; next_host uuid;
begin
  select * into l from public.lobbies where id = p_lobby for update;
  if not found then return; end if;
  update public.runs r set totals = r.totals || jsonb_build_object('hostTally', lp.host_tally)
    from public.lobby_players lp
    where lp.lobby_id = p_lobby
      and lp.user_id = p_user
      and r.lobby_id = p_lobby
      and r.user_id = p_user
      and r.ended_at is null;
  delete from public.lobby_players where lobby_id = p_lobby and user_id = p_user;
  if l.host_id = p_user then
    select user_id into next_host
    from public.lobby_players
    where lobby_id = p_lobby
    order by last_seen > now() - interval '45 seconds' desc, joined_at
    limit 1;
    if next_host is null then
      update public.lobbies set status = 'closed', updated_at = now() where id = p_lobby;
    else
      update public.lobbies set host_id = next_host, updated_at = now() where id = p_lobby;
    end if;
  else
    update public.lobbies set updated_at = now() where id = p_lobby;
  end if;
end $$;

create or replace function public.lobby_heartbeat(p_lobby uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); l public.lobbies; stale uuid; fresh_host boolean;
begin
  update public.lobby_players
  set last_seen = now()
  where lobby_id = p_lobby and user_id = uid;
  if not found then raise exception 'not_in_lobby'; end if;

  select * into l from public.lobbies where id = p_lobby for update;

  for stale in
    select user_id
    from public.lobby_players
    where lobby_id = p_lobby and last_seen < now() - interval '45 seconds'
  loop
    perform public._lobby_remove(p_lobby, stale);
  end loop;

  select * into l from public.lobbies where id = p_lobby;
  select last_seen > now() - interval '45 seconds'
    into fresh_host
    from public.lobby_players
    where lobby_id = p_lobby and user_id = l.host_id;

  if coalesce(fresh_host, false) = false then
    update public.lobbies
    set host_id = (
      select user_id
      from public.lobby_players
      where lobby_id = p_lobby
        and last_seen > now() - interval '45 seconds'
      order by joined_at
      limit 1
    ),
    updated_at = now()
    where id = p_lobby
      and exists (
        select 1
        from public.lobby_players
        where lobby_id = p_lobby
          and last_seen > now() - interval '45 seconds'
      );
  end if;

  return public._lobby_json(p_lobby);
end $$;

revoke execute on function public._lobby_remove(uuid, uuid) from public, anon, authenticated;
grant execute on function public.lobby_heartbeat(uuid) to authenticated;
