-- Realtime: match/lobby channels are PRIVATE. Only members of the lobby may subscribe or
-- broadcast on "lobby:<uuid>".
create or replace function public.can_use_lobby_topic(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare lid uuid;
begin
  if p_topic !~ '^lobby:[0-9a-f-]{36}$' then return false; end if;
  lid := substr(p_topic, 7)::uuid;
  return exists (select 1 from public.lobby_players where lobby_id = lid and user_id = (select auth.uid()));
end $$;
revoke execute on function public.can_use_lobby_topic(text) from public, anon;
grant execute on function public.can_use_lobby_topic(text) to authenticated;

drop policy if exists "lobby members receive" on realtime.messages;
drop policy if exists "lobby members send" on realtime.messages;
create policy "lobby members receive" on realtime.messages for select to authenticated
  using (public.can_use_lobby_topic(realtime.topic()));
create policy "lobby members send" on realtime.messages for insert to authenticated
  with check (public.can_use_lobby_topic(realtime.topic()));
