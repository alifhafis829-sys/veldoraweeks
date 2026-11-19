-- STEAM SEKOLAH YADIKA 13
-- Jalankan seluruh file ini di Supabase Dashboard > SQL Editor.
-- Menggunakan Supabase Auth untuk login dan RLS untuk membatasi data.

create extension if not exists pgcrypto;

-- Profil otomatis dibuat saat pengguna mendaftar melalui Supabase Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  class_name text not null default '',
  phone text not null default '',
  role text not null default 'student' check (role in ('student', 'staff', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, class_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'class_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_steam on auth.users;
create trigger on_auth_user_created_steam
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Mencegah pengguna mengangkat dirinya sendiri menjadi petugas/admin lewat update profil.
create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    raise exception 'Perubahan role hanya boleh dilakukan administrator database';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
before update on public.profiles
for each row execute procedure public.prevent_profile_role_change();

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('staff', 'admin')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Tarif boleh dikosongkan dulu. Admin bisa mengisinya dari tab Pengaturan.
create table if not exists public.app_settings (
  id boolean primary key default true check (id = true),
  service_price integer null check (service_price is null or service_price >= 0),
  qris_image_url text null,
  updated_at timestamptz not null default now(),
  updated_by uuid null references auth.users(id)
);
insert into public.app_settings (id, service_price, qris_image_url)
values (true, null, null)
on conflict (id) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  student_name text not null,
  class_name text not null,
  phone text not null,
  plate_number text not null,
  vehicle_type text not null,
  parking_location text not null check (parking_location in ('A', 'B', 'C')),
  payment_method text not null check (payment_method in ('cash', 'qris')),
  payment_timing text not null check (payment_timing in ('key_pickup', 'motor_pickup')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  status text not null default 'pending' check (status in ('pending', 'key_collected', 'washing', 'ready', 'completed', 'cancelled')),
  amount_due integer null check (amount_due is null or amount_due >= 0),
  payment_confirmed_by uuid null references auth.users(id),
  paid_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Harga pesanan disalin dari pengaturan saat order dibuat, bukan dipercaya dari browser.
create or replace function public.set_steam_order_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select service_price into new.amount_due
  from public.app_settings where id = true;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_order_price_before_insert on public.orders;
create trigger set_order_price_before_insert
before insert on public.orders
for each row execute procedure public.set_steam_order_price();

create or replace function public.touch_order_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_order_updated_at_trigger on public.orders;
create trigger touch_order_updated_at_trigger
before update on public.orders
for each row execute procedure public.touch_order_updated_at();

-- RLS
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.orders enable row level security;

drop policy if exists "profile read own or staff" on public.profiles;
create policy "profile read own or staff" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_staff());

drop policy if exists "profile update own" on public.profiles;
create policy "profile update own" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Semua pengguna login boleh membaca harga dan URL QRIS.
drop policy if exists "settings read authenticated" on public.app_settings;
create policy "settings read authenticated" on public.app_settings
for select to authenticated
using (true);

drop policy if exists "settings update admin" on public.app_settings;
create policy "settings update admin" on public.app_settings
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "student create own order" on public.orders;
create policy "student create own order" on public.orders
for insert to authenticated
with check (user_id = auth.uid() and status = 'pending' and payment_status = 'unpaid');

drop policy if exists "student read own or staff read all" on public.orders;
create policy "student read own or staff read all" on public.orders
for select to authenticated
using (user_id = auth.uid() or public.is_staff());

drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders
for update to authenticated
using (public.is_staff())
with check (public.is_staff());

-- Izinkan Realtime untuk perubahan antrean (abaikan jika tabel sudah terdaftar).
do $$
begin
  alter publication supabase_realtime add table public.orders;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;

-- Setelah akun admin dibuat, jalankan manual di SQL Editor:
-- update public.profiles
-- set role = 'admin'
-- where id = (select id from auth.users where email = 'EMAIL_ADMIN_KAMU');
-- Untuk petugas:
-- update public.profiles
-- set role = 'staff'
-- where id = (select id from auth.users where email = 'EMAIL_PETUGAS');
