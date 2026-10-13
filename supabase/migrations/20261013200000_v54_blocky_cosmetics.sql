-- v54: twelve new blocky cosmetics (client catalog in index.html cosmeticCatalog).
insert into public.catalog_cosmetics (id, slot, tier, price) values
  ('beanie', 'headgear', 0, 300), ('hard_hat', 'headgear', 1, 650), ('nv_goggles', 'headgear', 3, 3600),
  ('bandana', 'facewear', 0, 350), ('shades', 'facewear', 1, 550), ('skull_mask', 'facewear', 4, 7200),
  ('radio_pack', 'backpack', 2, 1400), ('sword_sheath', 'backpack', 3, 3000),
  ('hoodie', 'outerwear', 1, 800), ('medic_vest', 'outerwear', 2, 1600),
  ('fingerless', 'gloves', 0, 300), ('hi_tops', 'footwear', 1, 700)
on conflict (id) do nothing;
