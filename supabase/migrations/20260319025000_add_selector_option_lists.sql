alter table if exists public.app_settings
  add column if not exists ram_options jsonb not null default '["4 GB","8 GB","16 GB","32 GB","8 GB + 8 GB","16 GB + 16 GB"]'::jsonb,
  add column if not exists storage_options jsonb not null default '["SSD 128 GB","SSD 256 GB","SSD 512 GB","SSD 1 TB","M.2 256 GB","M.2 512 GB","M.2 1 TB","SSD 256 GB + HDD 500 GB","SSD 256 GB + HDD 1 TB","SSD 512 GB + HDD 1 TB"]'::jsonb,
  add column if not exists display_size_options jsonb not null default '["14 นิ้ว","15.6 นิ้ว","20 นิ้ว","21.5 นิ้ว","22 นิ้ว","23.8 นิ้ว","24 นิ้ว","27 นิ้ว"]'::jsonb,
  add column if not exists monitor_brand_options jsonb not null default '["Dell","Lenovo","HP","Acer","Asus","Samsung","LG","AOC","MSI"]'::jsonb,
  add column if not exists display_tag_options jsonb not null default '["#ไร้ขอบ","#จอโค้ง","#Touchscreen"]'::jsonb;

update public.app_settings
set
  ram_options = case
    when jsonb_typeof(ram_options) = 'array' and jsonb_array_length(ram_options) > 0 then ram_options
    else '["4 GB","8 GB","16 GB","32 GB","8 GB + 8 GB","16 GB + 16 GB"]'::jsonb
  end,
  storage_options = case
    when jsonb_typeof(storage_options) = 'array' and jsonb_array_length(storage_options) > 0 then storage_options
    else '["SSD 128 GB","SSD 256 GB","SSD 512 GB","SSD 1 TB","M.2 256 GB","M.2 512 GB","M.2 1 TB","SSD 256 GB + HDD 500 GB","SSD 256 GB + HDD 1 TB","SSD 512 GB + HDD 1 TB"]'::jsonb
  end,
  display_size_options = case
    when jsonb_typeof(display_size_options) = 'array' and jsonb_array_length(display_size_options) > 0 then display_size_options
    else '["14 นิ้ว","15.6 นิ้ว","20 นิ้ว","21.5 นิ้ว","22 นิ้ว","23.8 นิ้ว","24 นิ้ว","27 นิ้ว"]'::jsonb
  end,
  monitor_brand_options = case
    when jsonb_typeof(monitor_brand_options) = 'array' and jsonb_array_length(monitor_brand_options) > 0 then monitor_brand_options
    else '["Dell","Lenovo","HP","Acer","Asus","Samsung","LG","AOC","MSI"]'::jsonb
  end,
  display_tag_options = case
    when jsonb_typeof(display_tag_options) = 'array' then display_tag_options
    else '["#ไร้ขอบ","#จอโค้ง","#Touchscreen"]'::jsonb
  end
where key = 'main';
