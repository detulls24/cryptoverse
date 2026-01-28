-- 1. Reset everything to ensure clean state (Fixes "trigger exists" and "column missing")
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.profiles cascade;

-- 2. Create the table with ALL required columns
create table public.profiles (
  id uuid references auth.users on delete cascade not null primary key,
  email text,
  nickname text,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default now()
);

-- 3. Enable RLS
alter table public.profiles enable row level security;

-- 4. Create policies
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- 5. Function to handle new user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, nickname, updated_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'nickname',
    now()
  );
  return new;
end;
$$ language plpgsql security definer;

-- 6. Trigger
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. Backfill existing users (Restores data from Auth)
insert into public.profiles (id, email, nickname, updated_at)
select
    id,
    email,
    raw_user_meta_data->>'nickname',
    created_at
from auth.users
on conflict (id) do nothing;

-- 8. Grants
grant all on public.profiles to authenticated;
grant all on public.profiles to service_role;
