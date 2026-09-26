-- Backend smoke test. Run with the service connection (e.g. `supabase db execute` or the SQL editor).
-- Creates four QA users, exercises every player-facing RPC as those users (role authenticated +
-- JWT claims), asserts the security rules, then deletes the QA users. Raises on the first failure.
do $test$
declare
  a uuid := '00000000-0000-4000-8000-0000000000a1'; b uuid := '00000000-0000-4000-8000-0000000000b2';
  c uuid := '00000000-0000-4000-8000-0000000000c3'; d uuid := '00000000-0000-4000-8000-0000000000d4';
  r jsonb; run uuid; lob jsonb; code text; lid uuid; req uuid := gen_random_uuid(); m bigint; n int; ok boolean;
  coins_before bigint; coins_after bigint;
begin
  delete from auth.users where email like 'qa-%@deadrecoil.test';
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa-' || left(u::text, 4) || right(u::text, 2) || '@deadrecoil.test', '',
         now(), '{"provider":"email"}', jsonb_build_object('username', 'QA_' || right(u::text, 2)), now(), now()
  from unnest(array[a, b, c, d]) u;

  -- ── A: session, RLS, spins ──
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.get_session();
  assert r -> 'profile' ->> 'normal' = '2', 'starter tickets';
  assert (select count(*) from public.missions) = 3, 'three active missions, only own rows visible';
  begin
    update public.profiles set coins = 999999999 where id = a;
    raise exception 'direct coin update must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.player_inventory (user_id, item_id, item_type, slot) values (a, '19', 'weapon', 1);
    raise exception 'direct inventory insert must fail';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public._grant(a, 100000, 0);
    raise exception 'internal grant must not be callable';
  exception when insufficient_privilege then null;
  end;
  r := public.economy_roll('weapon', false, 'ticket', req);
  assert r -> 'profile' ->> 'normal' = '1', 'spin spends one ticket';
  r := public.economy_roll('weapon', false, 'ticket', req);
  assert r -> 'profile' ->> 'normal' = '1', 'replayed spin request is not charged twice';
  if r -> 'profile' -> 'pendingLoadout' ? 'weapon' then
    r := public.economy_equip('weapon', 0, 'replace', gen_random_uuid());
    assert (r -> 'profile' -> 'weaponSlots' ->> 0) = (r -> 'profile' ->> 'weaponId'), 'spin result equipped in slot 0';
  end if;
  begin
    perform public.economy_roll('weapon', true, 'coins', gen_random_uuid());
    raise exception 'lucky spin without coins must fail';
  exception when others then
    if sqlerrm <> 'insufficient_funds' then raise; end if;
  end;

  -- ── A: solo run, capped rewards, missions ──
  r := public.run_start('classic', 0, 'medium', null, gen_random_uuid());
  run := (r ->> 'run')::uuid;
  r := public.run_report(run, '{"kills": 1000000, "headshots": 5, "wave": 99, "elapsed": 99999, "bosses": {"demon": 9}}', false, null, gen_random_uuid());
  assert (r -> 'rewards' -> 'totals' ->> 'kills')::int <= 70, 'kills are capped by server elapsed time';
  assert (r -> 'rewards' -> 'totals' ->> 'wave')::int <= 3, 'wave is capped by server elapsed time';
  assert (r -> 'rewards' -> 'totals' -> 'bosses' ->> 'demon')::int = 0, 'no demon before wave 20';
  coins_before := (r -> 'profile' ->> 'coins')::bigint;
  assert coins_before > 0 and coins_before <= 600, 'coins come from the server formula';
  r := public.run_report(run, '{"kills": 3, "elapsed": 5}', false, null, gen_random_uuid());
  assert (r -> 'profile' ->> 'coins')::bigint = coins_before, 'totals never go backwards / no double pay';
  r := public.run_report(run, '{"kills": 40, "elapsed": 5}', true, 'loss', gen_random_uuid());
  assert (r -> 'profile' -> 'stats' ->> 'gamesPlayed') = '1' and (r -> 'profile' -> 'stats' ->> 'deaths') = '1', 'run end recorded';
  coins_after := (r -> 'profile' ->> 'coins')::bigint;
  r := public.run_report(run, '{"kills": 90, "elapsed": 5}', true, 'loss', gen_random_uuid());
  assert (r -> 'profile' ->> 'coins')::bigint = coins_after, 'ended runs cannot be reported again';

  -- Complete one mission (as the service role) and claim it twice.
  perform set_config('role', 'postgres', true);
  select id into m from public.missions where user_id = a and not claimed order by id limit 1;
  update public.missions set progress = target, completed = true where id = m;
  perform set_config('role', 'authenticated', true);
  coins_before := (public.get_session() -> 'profile' ->> 'coins')::bigint;
  r := public.mission_claim(m, gen_random_uuid());
  assert (r -> 'profile' ->> 'coins')::bigint = coins_before + (r -> 'claimed' ->> 'rewardCoins')::bigint, 'claim grants the reward';
  assert jsonb_array_length(r -> 'missions') = 3, 'a new mission replaces the claimed one';
  assert not exists (select 1 from jsonb_array_elements(r -> 'missions') e where (e ->> 'id')::bigint = m), 'claimed mission left the active list';
  begin
    perform public.mission_claim(m, gen_random_uuid());
    raise exception 'double claim must fail';
  exception when others then
    if sqlerrm <> 'already_claimed' then raise; end if;
  end;
  begin
    select id into m from public.missions where not claimed and not completed limit 1;
    perform public.mission_claim(m, gen_random_uuid());
    raise exception 'claiming an incomplete mission must fail';
  exception when others then
    if sqlerrm <> 'mission_incomplete' then raise; end if;
  end;

  -- Offline sync is idempotent.
  req := gen_random_uuid();
  r := public.run_submit_offline(req, jsonb_build_object('kills', 30, 'elapsed', 60, 'wave', 3, 'result', 'loss', 'mode', 'classic', 'map', 1, 'difficulty', 'easy'));
  coins_after := (r -> 'profile' ->> 'coins')::bigint;
  r := public.run_submit_offline(req, jsonb_build_object('kills', 30, 'elapsed', 60, 'wave', 3, 'result', 'loss', 'mode', 'classic', 'map', 1, 'difficulty', 'easy'));
  assert (r ->> 'duplicate')::boolean and (r -> 'profile' ->> 'coins')::bigint = coins_after, 'offline run is synced only once';

  -- ── Lobbies: create, join by code, ready, host-only start, full, ban ──
  lob := public.lobby_create(1, 'hard', 'classic', false);
  code := lob ->> 'code'; lid := (lob ->> 'id')::uuid;
  assert code ~ '^[A-Z0-9]{6}$', 'lobby code format';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  begin
    perform public.lobby_join('ZZZZZZ');
    raise exception 'unknown code must fail';
  exception when others then if sqlerrm <> 'lobby_not_found' then raise; end if;
  end;
  lob := public.lobby_join(lower(code));
  assert jsonb_array_length(lob -> 'players') = 2, 'B joined';
  lob := public.lobby_join(code);
  assert jsonb_array_length(lob -> 'players') = 2, 'rejoin does not duplicate the player';
  assert (select count(*) from public.lobby_players where lobby_id = lid) = 2, 'members see each other';
  assert (select count(*) from public.profiles) = 1, 'B cannot read A profile';
  begin
    perform public.lobby_start(lid);
    raise exception 'non-host start must fail';
  exception when others then if sqlerrm <> 'not_host' then raise; end if;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  begin
    perform public.lobby_start(lid);
    raise exception 'start with unready players must fail';
  exception when others then if sqlerrm <> 'players_not_ready' then raise; end if;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.lobby_join(code);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', d, 'role', 'authenticated')::text, true);
  perform public.lobby_join(code);
  assert jsonb_array_length(public.lobby_state(lid) -> 'players') = 4, 'four players';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.lobby_kick(lid, d);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', d, 'role', 'authenticated')::text, true);
  begin
    perform public.lobby_join(code);
    raise exception 'banned player must not rejoin';
  exception when others then if sqlerrm <> 'lobby_banned' then raise; end if;
  end;
  foreach ok in array array[true] loop null; end loop;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform public.lobby_set_ready(lid, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform public.lobby_set_ready(lid, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  lob := public.lobby_start(lid);
  assert lob ->> 'status' = 'in_game', 'host started';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', d, 'role', 'authenticated')::text, true);
  begin
    perform public.lobby_join(code);
    raise exception 'joining a match in progress must fail';
  exception when others then if sqlerrm not in ('lobby_in_game', 'lobby_banned') then raise; end if;
  end;
  -- Host-reported tallies cap member claims.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  run := (public.run_start('classic', 0, 'easy', lid, gen_random_uuid()) ->> 'run')::uuid;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.lobby_report(lid, 2, jsonb_build_object(b::text, jsonb_build_object('kills', 7, 'headshots', 1)));
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.run_report(run, '{"kills": 30, "headshots": 20, "elapsed": 9}', false, null, gen_random_uuid());
  assert (r -> 'rewards' -> 'totals' ->> 'kills')::int = 7, 'member kills capped to host tally';
  assert (r -> 'rewards' -> 'totals' ->> 'headshots')::int = 1, 'member headshots capped to host tally';
  -- Host leaves: host migrates to the earliest remaining member.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  perform public.lobby_leave(lid);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', b, 'role', 'authenticated')::text, true);
  lob := public.lobby_state(lid);
  assert (lob ->> 'hostId')::uuid = b, 'host migrated to B';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert (select count(*) from public.lobbies where id = lid) = 0, 'A no longer sees the private lobby';

  -- Quick play: two players end up in the same public lobby.
  lob := public.lobby_quick_play(null, null);
  assert lob ->> 'quickPlay' = 'created', 'first quick play creates a public lobby';
  perform set_config('request.jwt.claims', jsonb_build_object('sub', d, 'role', 'authenticated')::text, true);
  r := public.lobby_quick_play(null, null);
  assert r ->> 'quickPlay' = 'joined' and r ->> 'id' = lob ->> 'id', 'second quick play joins it';

  perform set_config('role', 'postgres', true);
  delete from auth.users where email like 'qa-%@deadrecoil.test';
  raise notice 'BACKEND SMOKE: ALL PASSED';
end
$test$;
