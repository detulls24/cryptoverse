-- 1. Table for Market Assets (Items for sale)
create table if not exists public.market_assets (
    id uuid default gen_random_uuid() primary key,
    created_at timestamp with time zone default now(),
    type text not null, -- 'real_estate', 'transport', 'land', etc.
    name text not null,
    description text,
    image_url text,
    price decimal not null,
    currency text default 'usdt',
    quantity integer default -1 -- -1 for infinite, >0 for limited stock
);

alter table public.market_assets enable row level security;

-- Public can view assets
create policy "Public can view market assets"
  on public.market_assets for select
  using (true);

-- Only admins can insert/update/delete (via service_role or admin RPCs usually, but strict RLS: allow nothing for anon/authenticated writes direct)

-- 2. Admin Functions

-- Add Asset
create or replace function admin_add_market_asset(
    p_name text,
    p_type text,
    p_price decimal,
    p_image_url text,
    p_desc text,
    p_quantity integer default -1
)
returns void as $$
begin
    insert into market_assets (name, type, price, image_url, description, quantity)
    values (p_name, p_type, p_price, p_image_url, p_desc, p_quantity);
end;
$$ language plpgsql security definer;

-- Delete Asset
create or replace function admin_delete_market_asset(p_id uuid)
returns void as $$
begin
    delete from market_assets where id = p_id;
end;
$$ language plpgsql security definer;

-- Get All Assets (Admin view, maybe same as public but defined for consistency)
create or replace function admin_get_market_assets()
returns setof market_assets as $$
begin
    return query select * from market_assets order by created_at desc;
end;
$$ language plpgsql security definer;
