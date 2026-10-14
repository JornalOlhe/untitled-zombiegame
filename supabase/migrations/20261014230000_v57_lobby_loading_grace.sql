-- v57: longer host/stale grace during the match loading phase (mirrors the local transport).
create or replace function public.lobby_heartbeat(p_lobby uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); l public.lobbies; stale uuid; fresh_host boolean; grace interval := interval '45 seconds';
begin
  update public.lobby_players
  set last_seen = now()
  where lobby_id = p_lobby and user_id = uid;
  if not found then raise exception 'not_in_lobby'; end if;

  select * into l from public.lobbies where id = p_lobby for update;
  -- Loading phase: the first 150 s after START everyone builds the map / compiles shaders;
  -- a busy host must not be evicted or replaced during it.
  if l.started_at is not null and l.started_at > now() - interval '150 seconds' then grace := interval '150 seconds'; end if;

  for stale in
    select user_id
    from public.lobby_players
    where lobby_id = p_lobby and last_seen < now() - grace
  loop
    perform public._lobby_remove(p_lobby, stale);
  end loop;

  select * into l from public.lobbies where id = p_lobby;
  select last_seen > now() - grace
    into fresh_host
    from public.lobby_players
    where lobby_id = p_lobby and user_id = l.host_id;

  if coalesce(fresh_host, false) = false then
    update public.lobbies
    set host_id = (
      select user_id
      from public.lobby_players
      where lobby_id = p_lobby
        and last_seen > now() - grace
      order by joined_at
      limit 1
    ),
    updated_at = now()
    where id = p_lobby
      and exists (
        select 1
        from public.lobby_players
        where lobby_id = p_lobby
          and last_seen > now() - grace
      );
  end if;

  return public._lobby_json(p_lobby);
end $$;

grant execute on function public.lobby_heartbeat(uuid) to authenticated;
