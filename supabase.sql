-- ENUMS
do $$ begin
  create type queue_status as enum ('waiting', 'called', 'served', 'no_show');
exception
  when duplicate_object then null;
end $$;

-- Settings (single row)
create table if not exists shop_settings (
  id boolean primary key default true,
  barber_count int not null default 1,
  visible_count int not null default 10,
  barbers jsonb not null default '[]'::jsonb, -- [{id:"zach", name:"Zach", working:true}, ...]
  updated_at timestamptz not null default now()
);

insert into shop_settings (id, barber_count, visible_count, barbers)
values (
  true, 5, 10,
  '[
    {"id":"zach","name":"Zach","working":true},
    {"id":"robin","name":"Robin","working":true},
    {"id":"rico","name":"Rico","working":true},
    {"id":"andy","name":"Andy","working":true},
    {"id":"brian","name":"Brian","working":true}
  ]'::jsonb
)
on conflict (id) do nothing;

-- Queue entries
create table if not exists queue_entries (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_initial text not null check (char_length(last_initial) = 1),
  preferred_barber_id text null, -- null means "Any barber"
  status queue_status not null default 'waiting',
  created_at timestamptz not null default now(),
  called_at timestamptz null,
  called_by_barber_id text null,
  served_at timestamptz null
);

create index if not exists idx_queue_entries_status_created on queue_entries(status, created_at);

-- Enable realtime
alter publication supabase_realtime add table queue_entries;
alter publication supabase_realtime add table shop_settings;

-- RLS
alter table queue_entries enable row level security;
alter table shop_settings enable row level security;

-- Public reads
create policy "public read queue"
on queue_entries for select
to anon
using (true);

create policy "public read settings"
on shop_settings for select
to anon
using (true);

-- Kiosk insert (anon)
create policy "public insert queue"
on queue_entries for insert
to anon
with check (true);

-- TEMPORARY: allow updates for anon (since no trolling concern).
-- Lock this down later (server-side writes + strict RLS).
create policy "temporary allow updates"
on queue_entries for update
to anon
using (true)
with check (true);

create policy "temporary allow settings updates"
on shop_settings for update
to anon
using (true)
with check (true);
