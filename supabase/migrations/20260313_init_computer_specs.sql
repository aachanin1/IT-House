create extension if not exists pgcrypto;

create table if not exists public.computer_specs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  type text not null,
  brand text not null,
  model text not null,
  cpu text not null,
  ram text not null,
  storage text not null,
  display_size text not null,
  price numeric(12,2) not null default 0,
  features text not null default '',
  remarks text not null default '',
  folder_link text not null default '',
  image_links jsonb not null default '[]'::jsonb,
  status_image boolean not null default false,
  status_posted boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists computer_specs_created_at_idx on public.computer_specs (created_at desc);
create index if not exists computer_specs_type_idx on public.computer_specs (type);
create index if not exists computer_specs_brand_idx on public.computer_specs (brand);

create or replace function public.set_computer_specs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_computer_specs_updated_at on public.computer_specs;

create trigger trg_set_computer_specs_updated_at
before update on public.computer_specs
for each row
execute function public.set_computer_specs_updated_at();
