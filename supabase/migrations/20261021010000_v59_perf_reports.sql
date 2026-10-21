-- Dead Recoil v59: anonymous-by-design performance telemetry (signed-in players only).
-- One row per finished match (rate-limited to 1/min per player): FPS average and 5th-percentile,
-- worst frame, draw calls, JS error count, hitches (>100 ms frames), quality preset, platform.
create schema if not exists private;
create table if not exists private.perf_reports (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  version text, platform text, quality text, map_id int, mode text, wave int,
  seconds int, fps_avg numeric, fps_low numeric, frame_max_ms int, calls int, errors int, hitches int
);
create index if not exists perf_reports_created on private.perf_reports(created_at desc);
create or replace function public.perf_report(p_report jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := public._uid();
begin
  if uid is null then return; end if;
  if exists (select 1 from private.perf_reports where user_id = uid and created_at > now() - interval '60 seconds') then return; end if;
  insert into private.perf_reports(user_id, version, platform, quality, map_id, mode, wave, seconds, fps_avg, fps_low, frame_max_ms, calls, errors, hitches)
  values (uid,
    left(coalesce(p_report->>'version',''), 24), left(coalesce(p_report->>'platform',''), 24), left(coalesce(p_report->>'quality',''), 12),
    least(greatest(coalesce((p_report->>'map')::int, -1), -1), 99), left(coalesce(p_report->>'mode',''), 12),
    least(greatest(coalesce((p_report->>'wave')::int, 0), 0), 9999), least(greatest(coalesce((p_report->>'seconds')::int, 0), 0), 86400),
    least(greatest(coalesce((p_report->>'fpsAvg')::numeric, 0), 0), 1000), least(greatest(coalesce((p_report->>'fpsLow')::numeric, 0), 0), 1000),
    least(greatest(coalesce((p_report->>'frameMaxMs')::int, 0), 0), 600000), least(greatest(coalesce((p_report->>'calls')::int, 0), 0), 100000),
    least(greatest(coalesce((p_report->>'errors')::int, 0), 0), 10000), least(greatest(coalesce((p_report->>'hitches')::int, 0), 0), 100000));
end $$;
grant execute on function public.perf_report(jsonb) to authenticated;
