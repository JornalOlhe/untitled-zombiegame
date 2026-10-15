-- v56: free Season Pass ("Temporada 1 · Rastro Vermelho").
-- Progress = XP earned since the player first opened this season (profiles.total_xp delta), so every
-- XP source (matches, missions, story) advances it. 30 tiers of 1000 XP. Claims are server-validated,
-- idempotent per request and grant currencies only. State lives in the unexposed `private` schema.
create schema if not exists private;
create table if not exists private.player_season (
  user_id uuid not null references public.profiles(id) on delete cascade,
  season text not null,
  base_xp bigint not null,
  claimed int[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (user_id, season)
);

create or replace function private.season_reward(p_tier int) returns jsonb language sql immutable set search_path = '' as $$
  select case
    when p_tier % 10 = 0 then jsonb_build_object('coins', 1500, 'normal', 1, 'lucky', 1)
    when p_tier % 5 = 0 then jsonb_build_object('coins', 0, 'normal', 2, 'lucky', 0)
    when p_tier % 3 = 0 then jsonb_build_object('coins', 0, 'normal', 1, 'lucky', 0)
    else jsonb_build_object('coins', 300 + 25 * p_tier, 'normal', 0, 'lucky', 0)
  end
$$;

create or replace function private.season_json(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s private.player_season; total bigint;
begin
  select total_xp into total from public.profiles where id = p_uid;
  if total is null then return null; end if;
  insert into private.player_season(user_id, season, base_xp) values (p_uid, 'S1', total)
    on conflict (user_id, season) do nothing;
  select * into s from private.player_season where user_id = p_uid and season = 'S1';
  return jsonb_build_object('season', s.season, 'xp', greatest(0, total - s.base_xp), 'tierXp', 1000, 'tiers', 30,
    'claimed', to_jsonb(s.claimed));
end $$;

create or replace function public.season_state() returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return private.season_json(public._uid());
end $$;

create or replace function public.season_claim(p_tier int, p_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid(); s private.player_season; total bigint; r jsonb;
begin
  if p_request is null then raise exception 'invalid_request'; end if;
  if p_tier < 1 or p_tier > 30 then raise exception 'season_bad_tier'; end if;
  perform private.season_json(uid);
  select * into s from private.player_season where user_id = uid and season = 'S1' for update;
  select total_xp into total from public.profiles where id = uid;
  if not public._first_request(uid, p_request) then
    return jsonb_build_object('profile', public._profile_json(uid), 'season', private.season_json(uid), 'duplicate', true);
  end if;
  if p_tier = any(s.claimed) then raise exception 'season_reward_claimed'; end if;
  if total - s.base_xp < p_tier * 1000 then raise exception 'season_locked'; end if;
  r := private.season_reward(p_tier);
  update private.player_season set claimed = array_append(claimed, p_tier) where user_id = uid and season = s.season;
  perform public._grant(uid, (r->>'coins')::bigint, 0, (r->>'normal')::int, (r->>'lucky')::int);
  return jsonb_build_object('profile', public._profile_json(uid), 'season', private.season_json(uid), 'reward', r);
end $$;

grant execute on function public.season_state() to authenticated;
grant execute on function public.season_claim(int, uuid) to authenticated;
