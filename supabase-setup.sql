-- Özer Pizza Supabase şeması: siparişler, mağaza ayarları, finans ve yönetici güvenliği.
-- SQL'i Supabase SQL Editor'de çalıştırmadan önce kurulum dokümanını okuyun.
-- Özer Pizza order storage and admin access.
-- Run this once in Supabase SQL Editor, then add your admin's auth user ID
-- to public.admin_users (instructions at the bottom).

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text,
  created_at timestamptz not null default now()
);
alter table public.admin_users add column if not exists phone_e164 text;
create unique index if not exists admin_users_phone_e164_uidx
  on public.admin_users (phone_e164) where phone_e164 is not null;

create table if not exists public.verified_admin_sessions (
  session_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.store_settings (
  id boolean primary key default true check (id = true),
  delivery_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id, delivery_enabled) values (true, true)
on conflict (id) do nothing;

create table if not exists public.monthly_finances (
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  materials jsonb not null default '[]'::jsonb check (jsonb_typeof(materials) = 'array'),
  payroll jsonb not null default '[]'::jsonb check (jsonb_typeof(payroll) = 'array'),
  other_costs jsonb not null default '[]'::jsonb check (jsonb_typeof(other_costs) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (year, month)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text not null unique,
  created_at timestamptz not null default now(),
  customer_name text not null check (char_length(customer_name) between 2 and 120),
  customer_phone text not null default '' check (customer_phone = '' or char_length(customer_phone) between 5 and 40),
  fulfilment text not null check (fulfilment in ('delivery','pickup')),
  delivery_address text not null default '',
  delivery_lat double precision,
  delivery_lng double precision,
  customer_note text not null default '',
  assigned_to text not null default '',
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 40),
  total_czk integer not null check (total_czk > 0),
  status text not null default 'new' check (status in ('new','preparing','delivery','complete','cancelled'))
);

alter table public.orders add column if not exists assigned_to text not null default '';
alter table public.orders add column if not exists delivery_lat double precision;
alter table public.orders add column if not exists delivery_lng double precision;

create or replace function public.validate_ozer_order()
returns trigger language plpgsql set search_path = '' as $$
declare
  item jsonb;
  calculated_total integer := 0;
  item_price integer;
  item_qty integer;
  delivery_distance_km double precision;
  delivery_active boolean;
begin
  if tg_op = 'INSERT' then
    if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) < 1 then
      raise exception 'Order must contain at least one item';
    end if;
    for item in select value from jsonb_array_elements(new.items) loop
      item_qty := (item->>'qty')::integer;
      if item_qty < 1 or item_qty > 50 or coalesce(item->>'name','') = '' then
        raise exception 'Invalid order item';
      end if;
      if item->>'unit' = 'whole' then item_price := 320;
      else raise exception 'Only whole 42 cm pizzas can be ordered'; end if;
      calculated_total := calculated_total + item_price * item_qty;
    end loop;
    new.total_czk := calculated_total;
    if new.fulfilment = 'delivery' then
      select delivery_enabled into delivery_active from public.store_settings where id = true;
      if not coalesce(delivery_active, false) then
        raise exception 'Delivery is temporarily paused; pickup only';
      end if;
      if char_length(trim(new.delivery_address)) < 5 then
        raise exception 'Delivery address is required';
      end if;
      if new.delivery_lat is null or new.delivery_lng is null
        or new.delivery_lat not between -90 and 90
        or new.delivery_lng not between -180 and 180 then
        raise exception 'A verified delivery location is required';
      end if;
      delivery_distance_km := 6371 * 2 * asin(sqrt(
        power(sin(radians(new.delivery_lat - 49.94058787914822) / 2), 2)
        + cos(radians(49.94058787914822)) * cos(radians(new.delivery_lat))
        * power(sin(radians(new.delivery_lng - 17.906022019873813) / 2), 2)
      ));
      if delivery_distance_km > 5 then
        raise exception 'Delivery location is outside the 5 km service area';
      end if;
    else
      new.delivery_lat := null;
      new.delivery_lng := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_ozer_order on public.orders;
create trigger validate_ozer_order before insert on public.orders
for each row execute function public.validate_ozer_order();

alter table public.orders enable row level security;
alter table public.store_settings enable row level security;
alter table public.monthly_finances enable row level security;
alter table public.admin_users enable row level security;
alter table public.verified_admin_sessions enable row level security;

create or replace function public.ozer_is_verified_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.admin_users a
    join public.verified_admin_sessions s on s.user_id = a.user_id
    where a.user_id = (select auth.uid())
      and s.session_id = (select auth.jwt()->>'session_id')
      and s.expires_at > now()
  );
$$;
revoke all on function public.ozer_is_verified_admin() from public, anon;
grant execute on function public.ozer_is_verified_admin() to authenticated;
grant all on public.verified_admin_sessions to service_role;

drop policy if exists "Public can read delivery setting" on public.store_settings;
create policy "Public can read delivery setting" on public.store_settings
for select to anon, authenticated using (true);

drop policy if exists "Admins can update delivery setting" on public.store_settings;
create policy "Admins can update delivery setting" on public.store_settings
for update to authenticated using (public.ozer_is_verified_admin())
with check (public.ozer_is_verified_admin());

drop policy if exists "Admins can read monthly finances" on public.monthly_finances;
create policy "Admins can read monthly finances" on public.monthly_finances
for select to authenticated using (public.ozer_is_verified_admin());

drop policy if exists "Admins can insert monthly finances" on public.monthly_finances;
create policy "Admins can insert monthly finances" on public.monthly_finances
for insert to authenticated with check (public.ozer_is_verified_admin());

drop policy if exists "Admins can update monthly finances" on public.monthly_finances;
create policy "Admins can update monthly finances" on public.monthly_finances
for update to authenticated using (public.ozer_is_verified_admin())
with check (public.ozer_is_verified_admin());

drop policy if exists "Public can submit orders" on public.orders;
create policy "Public can submit orders" on public.orders
for insert to anon with check (status = 'new');

drop policy if exists "Admins can read orders" on public.orders;
create policy "Admins can read orders" on public.orders
for select to authenticated using (public.ozer_is_verified_admin());

drop policy if exists "Admins can create orders" on public.orders;
create policy "Admins can create orders" on public.orders
for insert to authenticated with check (public.ozer_is_verified_admin());

drop policy if exists "Admins can update order status" on public.orders;
create policy "Admins can update order status" on public.orders
for update to authenticated using (public.ozer_is_verified_admin())
with check (public.ozer_is_verified_admin());

drop policy if exists "Admins can view their admin record" on public.admin_users;
create policy "Admins can view their admin record" on public.admin_users
for select to authenticated using (user_id = (select auth.uid()));

grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;
grant select, insert, update on public.monthly_finances to authenticated;
grant insert on public.orders to anon;
grant select, insert, update on public.orders to authenticated;
grant select on public.admin_users to authenticated;

-- After creating/confirming the admin phone user in Supabase Auth, add its UUID
-- and the exact E.164 phone number (including country code) to the allowlist.
