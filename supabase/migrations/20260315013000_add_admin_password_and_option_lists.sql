alter table if exists public.app_settings
  add column if not exists edit_password text not null default '',
  add column if not exists admin_password text not null default '',
  add column if not exists type_options jsonb not null default '["PC","Notebook","All in One","Monitor"]'::jsonb,
  add column if not exists brand_options jsonb not null default '["Dell","HP","Lenovo","Acer","Asus","Toshiba","Fujitsu","MSI","Hisense"]'::jsonb,
  add column if not exists feature_options jsonb not null default '["License Windows","KB มีไฟ","สแกนนิ้ว","สแกนหน้า","Card Wi-Fi","DVD-RW","ใส่ Sim ได้"]'::jsonb;

update public.app_settings
set
  type_options = case
    when jsonb_typeof(type_options) = 'array' and jsonb_array_length(type_options) > 0 then type_options
    else '["PC","Notebook","All in One","Monitor"]'::jsonb
  end,
  brand_options = case
    when jsonb_typeof(brand_options) = 'array' and jsonb_array_length(brand_options) > 0 then brand_options
    else '["Dell","HP","Lenovo","Acer","Asus","Toshiba","Fujitsu","MSI","Hisense"]'::jsonb
  end,
  feature_options = case
    when jsonb_typeof(feature_options) = 'array' and jsonb_array_length(feature_options) > 0 then feature_options
    else '["License Windows","KB มีไฟ","สแกนนิ้ว","สแกนหน้า","Card Wi-Fi","DVD-RW","ใส่ Sim ได้"]'::jsonb
  end
where key = 'main';
