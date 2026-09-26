-- Dead Recoil: accounts, cross-progression, missions and lobbies.
-- Clients only hold the publishable key. Every table has RLS; players can READ their own rows,
-- but every WRITE goes through SECURITY DEFINER functions that validate the request server-side.

create extension if not exists citext with schema extensions;

-- ── Static catalogs (mirror of the game's class/weapon/cosmetic tables) ──────────────────────
create table public.catalog_items (
  kind text not null check (kind in ('class', 'weapon')),
  item_id int not null check (item_id >= 0),
  tier int not null check (tier between 0 and 6),
  lucky_cost numeric not null default 1,
  family text,
  name text not null,
  primary key (kind, item_id)
);
insert into public.catalog_items (kind, item_id, tier, lucky_cost, family, name) values
  ('class',0,0,1,null,'Recruit'),
  ('class',1,0,1,null,'Scout'),
  ('class',2,0,1,null,'Medic'),
  ('class',3,1,1,null,'Guardian'),
  ('class',4,1,1,null,'Gunslinger'),
  ('class',5,1,0.7,null,'Engineer'),
  ('class',6,2,1,null,'Berserker'),
  ('class',7,2,1,null,'Phantom'),
  ('class',8,2,1,null,'Demolitionist'),
  ('class',9,3,1,null,'Vanguard'),
  ('class',10,3,1,null,'Revenant'),
  ('class',11,3,1,null,'Stormcaller'),
  ('class',12,4,1,null,'Warlord'),
  ('class',13,4,1,null,'Juggernaut'),
  ('class',14,4,1,null,'Deadeye'),
  ('class',15,5,1,null,'Reaper'),
  ('class',16,5,1,null,'Voidwalker'),
  ('class',17,5,1,null,'Bloodlord'),
  ('class',18,6,1,null,'Archon'),
  ('class',19,6,1,null,'Seraph'),
  ('class',20,6,1,null,'Deathless'),
  ('weapon',0,0,1,'melee','Machete'),
  ('weapon',1,0,1,'rifle','MP5'),
  ('weapon',2,0,1,'bow','Bow'),
  ('weapon',3,1,1,'shotgun','Riot Breaker'),
  ('weapon',4,1,1,'rifle','Crimson AK'),
  ('weapon',5,1,1,'rifle','Firestarter'),
  ('weapon',6,2,1,'rifle','Wraith M4A1'),
  ('weapon',7,2,1,'melee','Bloodfang'),
  ('weapon',8,2,1,'sniper','Titanbreaker'),
  ('weapon',9,3,1,'rifle','Cerberus Laser'),
  ('weapon',10,3,1,'rifle','Frostbite'),
  ('weapon',11,3,1,'bow','Stormpiercer'),
  ('weapon',12,4,1,'sniper','Thundergrave'),
  ('weapon',13,4,1,'explosive','Doomsday Launcher'),
  ('weapon',14,4,1,'shotgun','Widowmaker'),
  ('weapon',15,5,1,'rifle','Quantum Annihilator'),
  ('weapon',16,5,1,'rifle','Hellfire Incarnate'),
  ('weapon',17,5,1,'bow','Wraithpiercer'),
  ('weapon',18,6,1,'melee','Dawn Spear'),
  ('weapon',19,6,1,'explosive','Heavenfall Bazooka'),
  ('weapon',20,6,1,'rifle','Absolute Zero');

create table public.catalog_cosmetics (
  id text primary key,
  slot text not null,
  tier int not null,
  price int not null check (price >= 0)
);
insert into public.catalog_cosmetics (id, slot, tier, price) values
  ('scout_cap', 'headgear', 1, 450), ('respirator', 'facewear', 2, 900), ('field_pack', 'backpack', 1, 700),
  ('field_jacket', 'outerwear', 2, 1200), ('tactical_gloves', 'gloves', 1, 600), ('reinforced_boots', 'footwear', 2, 1150),
  ('riot_helmet', 'headgear', 3, 2800), ('ballistic_vest', 'outerwear', 3, 3200), ('reaper_hood', 'headgear', 4, 8500);

create table public.catalog_bosses (
  kind text primary key,
  major boolean not null,
  coins int not null,
  normal int not null default 0,
  lucky int not null default 0,
  xp int not null
);
insert into public.catalog_bosses values
  ('demon', true, 500, 0, 3, 900), ('yeti', true, 300, 2, 1, 450),
  ('quarterback', false, 100, 1, 0, 160), ('mutant', false, 110, 1, 0, 170);

create table public.catalog_mutations (id text primary key, reward numeric not null);
insert into public.catalog_mutations values ('blackout', 1.35), ('bloodmoon', 1.5), ('armored', 1.45), ('toxic', 1.45);

create table public.catalog_difficulties (id text primary key, rank int not null, coins numeric not null);
insert into public.catalog_difficulties values ('easy', 0, 1), ('medium', 1, 1.5), ('hard', 2, 2), ('nightmare', 3, 3);

create table public.catalog_maps (map_id int primary key, name text not null);
insert into public.catalog_maps values (0, 'City Ruins'), (1, 'Abandoned Hospital'), (2, 'Dark Forest'), (3, 'Underground Lab'), (4, 'Arctic Base');

-- ── Player data ─────────────────────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username extensions.citext not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 32),
  level int not null default 1 check (level >= 1),
  xp int not null default 0 check (xp >= 0),
  total_xp bigint not null default 0,
  coins bigint not null default 0 check (coins >= 0),
  normal_tickets int not null default 2 check (normal_tickets >= 0),
  lucky_tickets int not null default 0 check (lucky_tickets >= 0),
  class_id int not null default 0,
  weapon_id int not null default 1,
  weapon_slots_owned int not null default 1 check (weapon_slots_owned between 1 and 5),
  class_pity int not null default 0 check (class_pity between 0 and 20),
  weapon_pity int not null default 0 check (weapon_pity between 0 and 20),
  pending_class int,
  pending_weapon int,
  cosmetics jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Weapons and cosmetics the player owns. Weapons live in loadout slots (0-4).
create table public.player_inventory (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null,
  item_type text not null check (item_type in ('weapon', 'cosmetic')),
  slot int check (slot between 0 and 4),
  equipped boolean not null default false,
  obtained_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
create unique index player_inventory_weapon_slot on public.player_inventory (user_id, slot) where item_type = 'weapon';
create index player_inventory_user on public.player_inventory (user_id);

create table public.player_classes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  class_id int not null,
  unlocked boolean not null default true,
  equipped boolean not null default false,
  slot int check (slot between 0 and 1),
  obtained_at timestamptz not null default now(),
  unique (user_id, class_id)
);
create unique index player_classes_slot on public.player_classes (user_id, slot) where slot is not null;

create table public.player_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  kills bigint not null default 0,
  deaths bigint not null default 0,
  headshots bigint not null default 0,
  bosses_killed bigint not null default 0,
  minibosses_killed bigint not null default 0,
  highest_wave int not null default 0,
  games_played bigint not null default 0,
  wins bigint not null default 0,
  losses bigint not null default 0,
  total_playtime bigint not null default 0,
  damage_dealt bigint not null default 0,
  revives bigint not null default 0,
  multiplayer_matches bigint not null default 0,
  coins_earned bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table public.missions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mission_type text not null check (mission_type in
    ('KILL', 'WEAPON', 'HEADSHOT', 'SURVIVAL', 'BOSS', 'MINIBOSS', 'DAMAGE', 'TEAM', 'MONEY', 'NO_DAMAGE', 'DIFFICULTY', 'CLASS', 'MAP', 'MULTIPLAYER')),
  template_key text not null,
  params jsonb not null default '{}'::jsonb,
  target int not null check (target > 0),
  progress int not null default 0 check (progress >= 0),
  rarity text not null check (rarity in ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'DIVINE')),
  reward_coins int not null,
  reward_xp int not null,
  reward_normal int not null default 0,
  reward_lucky int not null default 0,
  completed boolean not null default false,
  claimed boolean not null default false,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  claimed_at timestamptz
);
create index missions_active on public.missions (user_id) where not claimed;
create index missions_history on public.missions (user_id, claimed_at desc) where claimed;

-- One row per run (solo or multiplayer). Totals are cumulative and only ever grow.
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  lobby_id uuid,
  mode text not null default 'classic',
  map_id int not null default 0,
  difficulty text not null default 'medium',
  class_id int not null,
  weapon_ids int[] not null default '{}',
  started_at timestamptz not null default now(),
  last_report_at timestamptz,
  ended_at timestamptz,
  offline boolean not null default false,
  totals jsonb not null default '{}'::jsonb,
  claimed_mutations text[] not null default '{}'
);
create index runs_user on public.runs (user_id, started_at desc);

-- Idempotency: a request id that already ran is never applied twice.
create table public.api_requests (
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

-- ── Multiplayer lobbies ─────────────────────────────────────────────────────────────────────
create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  lobby_code text not null unique check (lobby_code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references public.profiles (id) on delete cascade,
  map_id int not null default 0 references public.catalog_maps (map_id),
  difficulty text not null default 'medium' references public.catalog_difficulties (id),
  mode text not null default 'classic' check (mode in ('classic', 'infinite', 'timed')),
  status text not null default 'open' check (status in ('open', 'in_game', 'finished', 'closed')),
  is_public boolean not null default false,
  max_players int not null default 4 check (max_players between 1 and 4),
  match_seed int not null default floor(random() * 2147483647)::int,
  host_wave int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);
create index lobbies_quick on public.lobbies (created_at) where status = 'open' and is_public;

create table public.lobby_players (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  username text not null,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  host_tally jsonb not null default '{}'::jsonb,
  primary key (lobby_id, user_id)
);
create index lobby_players_user on public.lobby_players (user_id);

create table public.lobby_bans (
  lobby_id uuid not null references public.lobbies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (lobby_id, user_id)
);

-- ── Row Level Security ──────────────────────────────────────────────────────────────────────
alter table public.catalog_items enable row level security;
alter table public.catalog_cosmetics enable row level security;
alter table public.catalog_bosses enable row level security;
alter table public.catalog_mutations enable row level security;
alter table public.catalog_difficulties enable row level security;
alter table public.catalog_maps enable row level security;
alter table public.profiles enable row level security;
alter table public.player_inventory enable row level security;
alter table public.player_classes enable row level security;
alter table public.player_stats enable row level security;
alter table public.missions enable row level security;
alter table public.runs enable row level security;
alter table public.api_requests enable row level security;
alter table public.lobbies enable row level security;
alter table public.lobby_players enable row level security;
alter table public.lobby_bans enable row level security;

create policy "catalog readable" on public.catalog_items for select to anon, authenticated using (true);
create policy "catalog readable" on public.catalog_cosmetics for select to anon, authenticated using (true);
create policy "catalog readable" on public.catalog_bosses for select to anon, authenticated using (true);
create policy "catalog readable" on public.catalog_mutations for select to anon, authenticated using (true);
create policy "catalog readable" on public.catalog_difficulties for select to anon, authenticated using (true);
create policy "catalog readable" on public.catalog_maps for select to anon, authenticated using (true);

create policy "own profile" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "own inventory" on public.player_inventory for select to authenticated using (user_id = (select auth.uid()));
create policy "own classes" on public.player_classes for select to authenticated using (user_id = (select auth.uid()));
create policy "own stats" on public.player_stats for select to authenticated using (user_id = (select auth.uid()));
create policy "own missions" on public.missions for select to authenticated using (user_id = (select auth.uid()));
create policy "own runs" on public.runs for select to authenticated using (user_id = (select auth.uid()));
-- api_requests: no client access at all.

create or replace function public.is_lobby_member(p_lobby uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.lobby_players where lobby_id = p_lobby and user_id = (select auth.uid()));
$$;

create policy "members or open public lobbies" on public.lobbies for select to authenticated
  using (public.is_lobby_member(id) or (is_public and status = 'open'));
create policy "lobby members see each other" on public.lobby_players for select to authenticated
  using (public.is_lobby_member(lobby_id));

-- No INSERT/UPDATE/DELETE policies anywhere: direct writes are denied. Belt and braces:
revoke insert, update, delete, truncate on all tables in schema public from anon, authenticated;
