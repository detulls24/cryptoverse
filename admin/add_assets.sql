-- 1. Create table for user assets
create table if not exists public.user_assets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users not null,
    asset_id text not null, -- e.g. 'villa_bali'
    asset_type text not null, -- 'real_estate', 'transport', 'land'
    name text not null,
    image_url text,
    price decimal not null,
    purchased_at timestamp with time zone default now()
);

alter table public.user_assets enable row level security;

-- 2. Policies
drop policy if exists "Users can view own assets" on public.user_assets;
create policy "Users can view own assets"
  on public.user_assets for select
  using (auth.uid() = user_id);

-- 3. Function to buy an asset
-- Drop old versions to avoid "best candidate" ambiguity
drop function if exists public.buy_asset(text, text, text, text, decimal, text);
drop function if exists public.buy_asset(uuid, text, text, text, decimal, text);

create or replace function public.buy_asset(
    p_asset_id uuid, -- Changed to uuid to match market_assets.id
    p_asset_type text,
    p_name text,
    p_image_url text,
    p_price decimal,
    p_coin_id text default 'usdt'
)
returns json as $$
declare
    v_balance decimal;
    v_user_id uuid;
    v_market_qty integer;
begin
    v_user_id := auth.uid();

    -- 1. Check quantity in market_assets
    select quantity into v_market_qty 
    from market_assets 
    where id = p_asset_id;

    if v_market_qty = 0 then
        raise exception 'Извините, этот товар уже распродан.';
    end if;

    -- 2. Check balance
    if p_coin_id = 'usd' then
        select balance into v_balance from bank_accounts where user_id = v_user_id;
    else
        select balance into v_balance from wallets 
        where user_id = v_user_id and coin_id = p_coin_id;
    end if;

    if v_balance is null or v_balance < p_price then
        raise exception 'Недостаточно средств. Требуется % %', p_price, upper(p_coin_id);
    end if;

    -- 3. Deduct balance
    if p_coin_id = 'usd' then
        update bank_accounts set balance = balance - p_price where user_id = v_user_id;
    else
        update wallets set balance = balance - p_price
        where user_id = v_user_id and coin_id = p_coin_id;
    end if;

    -- 4. Decrement market quantity (if not infinite)
    if v_market_qty > 0 then
        update market_assets set quantity = quantity - 1 where id = p_asset_id;
    end if;

    -- 5. Add user asset
    insert into user_assets (user_id, asset_id, asset_type, name, image_url, price)
    values (v_user_id, p_asset_id::text, p_asset_type, p_name, p_image_url, p_price);

    -- 6. Log transaction
    insert into transactions (user_id, coin_id, amount, type, details)
    values (v_user_id, p_coin_id, -p_price, 'purchase', 'Покупка: ' || p_name);

    return json_build_object('success', true, 'message', 'Успешно приобретено!');
end;
$$ language plpgsql security definer;
