-- Dead Recoil v25: finalized class roster + Secret rarity.
-- Existing numeric IDs are preserved for save/account compatibility; new classes append at 21+.

insert into public.catalog_items (kind, item_id, tier, lucky_cost, family, name) values
  ('class',0,0,1,null,'Recruit'),
  ('class',1,0,1,null,'Scout'),
  ('class',2,0,1,null,'Medic'),
  ('class',3,1,1,null,'Guardian'),
  ('class',4,0,1,null,'Gunslinger'),
  ('class',5,1,1,null,'Engineer'),
  ('class',6,2,1,null,'Berserker'),
  ('class',7,2,1,null,'Phantom'),
  ('class',8,2,1,null,'Demolitionist'),
  ('class',9,3,1,null,'Vanguard'),
  ('class',10,3,1,null,'Revenant'),
  ('class',11,3,1,null,'Storm Caller'),
  ('class',12,4,1,null,'Warlord'),
  ('class',13,4,1,null,'Juggernaut'),
  ('class',14,4,1,null,'Deadeye'),
  ('class',15,6,1,null,'Reaper'),
  ('class',16,5,1,null,'Void Walker'),
  ('class',17,5,1,null,'Vampire'),
  ('class',18,5,1,null,'Archon'),
  ('class',19,6,1,null,'Serafim'),
  ('class',20,6,1,null,'Deathless'),
  ('class',21,1,1,null,'Sharpshooter'),
  ('class',22,7,1,null,'Archangel'),
  ('class',23,7,1,null,'Archdemon'),
  ('weapon',21,7,1,'melee','Demonic Fury'),
  ('weapon',22,7,1,'melee','Angelic Specter')
on conflict (kind, item_id) do update
set tier = excluded.tier,
    lucky_cost = excluded.lucky_cost,
    family = excluded.family,
    name = excluded.name;

-- Secret is the same shared tier for class and weapon rolls.
-- Prototype v25 rates: Normal 0.01%, Lucky 0.10%. Pity remains 75 Mythic+ / 150 Divine+.
create or replace function public._draw_tier_min(p_lucky boolean, p_min int) returns int
language plpgsql volatile set search_path = '' as $$
declare
  rates numeric[] := case
    when p_lucky then array[0, 0, 0, 58.9, 37, 3, 1, 0.1]
    else array[64.94, 23, 8, 3, 0.9, 0.1, 0.05, 0.01]
  end;
  v numeric := random() * 100;
  t int := 7;
begin
  for i in 1 .. 8 loop
    v := v - rates[i];
    if v < 0 then
      t := i - 1;
      exit;
    end if;
  end loop;
  return greatest(p_min, t);
end $$;

revoke execute on function public._draw_tier_min(boolean, int) from public, anon, authenticated;
