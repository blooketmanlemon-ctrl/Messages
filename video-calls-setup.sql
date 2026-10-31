-- CHATLY VIDEO CALLS: run this ONE additional SQL migration in Supabase.
-- Do not upload this SQL file to GitHub. Run it in Supabase > SQL Editor > New query.
-- Requires the existing public.conversations table created for Chatly messaging.

create table if not exists public.call_signals (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  call_id uuid not null,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (
    signal_type in ('offer','answer','ice','reject','busy','cancel','hangup')
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint call_signals_different_users check (from_user <> to_user),
  constraint call_signals_payload_size check (octet_length(payload::text) <= 32000)
);

create index if not exists call_signals_to_user_created_idx
  on public.call_signals (to_user, created_at desc);

create index if not exists call_signals_call_id_idx
  on public.call_signals (call_id);

alter table public.call_signals enable row level security;

drop policy if exists "Chatly call participants can read signals" on public.call_signals;
create policy "Chatly call participants can read signals"
  on public.call_signals
  for select to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "Chatly conversation members can send call signals" on public.call_signals;
create policy "Chatly conversation members can send call signals"
  on public.call_signals
  for insert to authenticated
  with check (
    auth.uid() = from_user
    and from_user <> to_user
    and exists (
      select 1
      from public.conversations c
      where c.id = conversation_id
        and (
          (c.user_one = auth.uid() and c.user_two = to_user)
          or
          (c.user_two = auth.uid() and c.user_one = to_user)
        )
    )
  );

drop policy if exists "Chatly call participants can clean up signals" on public.call_signals;
create policy "Chatly call participants can clean up signals"
  on public.call_signals
  for delete to authenticated
  using (auth.uid() = from_user or auth.uid() = to_user);

revoke all on public.call_signals from anon;
grant select, insert, delete on public.call_signals to authenticated;

-- Postgres Changes powers the incoming-call and WebRTC signaling listener.
do $realtime$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'call_signals'
  ) then
    alter publication supabase_realtime add table public.call_signals;
  end if;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication was not found; enable call_signals in Realtime later.';
end;
$realtime$;
