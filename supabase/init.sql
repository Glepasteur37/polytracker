create extension if not exists "pgcrypto";

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    is_pro boolean not null default false,
    subscription_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger trigger_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create table if not exists public.alerts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    market_slug text not null,
    type text not null check (type in ('PRESET', 'CUSTOM')),
    preset_type text check (preset_type in ('WHALE', 'FLIP')),
    custom_settings jsonb,
    last_triggered_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint preset_requires_type check (
        (type = 'PRESET' and preset_type is not null)
        or (type = 'CUSTOM' and preset_type is null)
    )
);

create trigger trigger_alerts_updated_at
before update on public.alerts
for each row
execute function public.set_updated_at();

alter table public.alerts enable row level security;

drop policy if exists "alerts_select" on public.alerts;
create policy "alerts_select" on public.alerts
    for select using (auth.uid() = user_id);

drop policy if exists "alerts_modify" on public.alerts;
create policy "alerts_modify" on public.alerts
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
