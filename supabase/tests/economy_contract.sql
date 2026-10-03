-- Exercise persistence via the real authenticated RPC, without retaining QA data.
begin;
do $test$
declare
  uid uuid := gen_random_uuid(); rid uuid; r jsonb; report jsonb;
  before_coins bigint; before_earned bigint; mini text; boss text;
begin
  insert into auth.users(id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values(uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'qa-' || uid::text || '@deadrecoil.test', '', now(), '{"provider":"email"}',
    jsonb_build_object('username', 'QA_' || left(replace(uid::text, '-', ''), 16)), now(), now());
  select kind into strict mini from public.catalog_bosses where map_id=0 and rank=1;
  select kind into strict boss from public.catalog_bosses where map_id=0 and rank=3;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  r := public.get_session();
  before_coins := (r->'profile'->>'coins')::bigint;
  rid := (public.run_start('classic', 0, 'hard', null, gen_random_uuid())->>'run')::uuid;
  perform set_config('role', 'postgres', true);
  select coins_earned into before_earned from public.player_stats where user_id=uid;
  update public.runs set started_at=now()-interval '120 seconds' where id=rid;
  perform set_config('role', 'authenticated', true);
  report := jsonb_build_object('kills',7,'headshots',5,'wave',10,'wavesCleared',10,
    'bossSpawns',2,'elapsed',120,'types',jsonb_build_object('zombie',1,'crawler',1,
    'swat',1,'constructor',1,'cyborg',1),'bosses',jsonb_build_object(mini,1,boss,1));
  r := public.run_report(rid, report, false, null, gen_random_uuid());
  -- 170 regular kills + 20 appearances + 1500 boss kills + 500 cleared waves.
  assert (r->'rewards'->>'coins')::bigint=2190, 'exact combined match rewards';
  assert (r->'profile'->>'coins')::bigint-before_coins=2190, 'wallet persists exact reward';
  r := public.run_report(rid, report, false, null, gen_random_uuid());
  assert (r->'rewards'->>'coins')::bigint=0, 'same totals with new request never pay twice';
  assert (r->'profile'->>'coins')::bigint-before_coins=2190, 'wallet remains stable on replay';
  perform set_config('role', 'postgres', true);
  assert (select coins_earned-before_earned from public.player_stats where user_id=uid)=2190,
    'coins_earned increments exactly once';
end $test$;
rollback;
