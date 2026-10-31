-- CHATLY IN-CALL CHAT ONLY
-- Run this only if you already ran the previous CHATLY-GROUP-CALLS-AND-MESSAGE-BOARD-SQL.sql migration.
-- If you have not run that migration yet, run the complete updated file instead.

-- 6. In-call chat for private and native group calls
-- -----------------------------------------------------------------------------
create table if not exists public.chat_call_messages (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  call_type text not null check (call_type in ('direct','group')),
  conversation_id uuid references public.conversations(id) on delete cascade,
  group_id uuid references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 1000),
  created_at timestamptz not null default now(),
  constraint chat_call_messages_scope_check check (
    (call_type = 'direct' and conversation_id is not null and group_id is null)
    or
    (call_type = 'group' and group_id is not null and conversation_id is null)
  )
);

create index if not exists chat_call_messages_call_created_idx
  on public.chat_call_messages(call_id, created_at asc);

alter table public.chat_call_messages enable row level security;
grant select, insert on public.chat_call_messages to authenticated;

-- Private-call messages are visible only to the two members of that conversation.
drop policy if exists "Conversation members can read private call messages" on public.chat_call_messages;
create policy "Conversation members can read private call messages"
on public.chat_call_messages for select to authenticated
using (
  call_type = 'direct'
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.user_one = auth.uid() or c.user_two = auth.uid())
  )
);

-- Group-call messages are visible only to current participants in that call.
drop policy if exists "Active group call participants can read group call messages" on public.chat_call_messages;
create policy "Active group call participants can read group call messages"
on public.chat_call_messages for select to authenticated
using (
  call_type = 'group'
  and exists (
    select 1 from public.chat_group_call_participants p
    where p.call_id = chat_call_messages.call_id
      and p.group_id = chat_call_messages.group_id
      and p.user_id = auth.uid()
      and p.last_seen_at > now() - interval '45 seconds'
  )
);

drop policy if exists "Call participants can send their own call messages" on public.chat_call_messages;
create policy "Call participants can send their own call messages"
on public.chat_call_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and char_length(btrim(content)) between 1 and 1000
  and (
    (
      call_type = 'direct'
      and conversation_id is not null
      and group_id is null
      and exists (
        select 1 from public.conversations c
        where c.id = conversation_id
          and (c.user_one = auth.uid() or c.user_two = auth.uid())
      )
    )
    or
    (
      call_type = 'group'
      and group_id is not null
      and conversation_id is null
      and exists (
        select 1 from public.chat_group_call_participants p
        where p.call_id = chat_call_messages.call_id
          and p.group_id = chat_call_messages.group_id
          and p.user_id = auth.uid()
          and p.last_seen_at > now() - interval '45 seconds'
      )
    )
  )
);

alter table public.chat_call_messages replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_call_messages'
  ) then
    alter publication supabase_realtime add table public.chat_call_messages;
  end if;
end $$;

