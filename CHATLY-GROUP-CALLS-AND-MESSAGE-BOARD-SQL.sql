-- CHATLY UPDATE: native group calls + screen sharing support + message-board controls
-- Run AFTER the original CHATLY-GROUPS-SQL.sql has already been installed.
-- This replaces the previous CHATLY-GROUP-CALLS-SQL.sql for this update.
-- No changes to Metered TURN secrets or chatly-turn-config Edge Function are required.

-- -----------------------------------------------------------------------------
-- 1. Native group video-call signaling tables
-- -----------------------------------------------------------------------------
create table if not exists public.chat_group_calls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  started_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (id, group_id)
);

create table if not exists public.chat_group_call_participants (
  call_id uuid not null,
  group_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (call_id, user_id),
  foreign key (call_id, group_id)
    references public.chat_group_calls(id, group_id) on delete cascade
);

create table if not exists public.chat_group_call_signals (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null,
  group_id uuid not null,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  signal_type text not null check (
    signal_type in ('invite','decline','offer','answer','ice','camera','leave','end')
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (call_id, group_id)
    references public.chat_group_calls(id, group_id) on delete cascade,
  check (from_user <> to_user)
);

create index if not exists chat_group_calls_group_created_idx
  on public.chat_group_calls(group_id, created_at desc);
create index if not exists chat_group_call_participants_call_idx
  on public.chat_group_call_participants(call_id, last_seen_at desc);
create index if not exists chat_group_call_signals_to_user_idx
  on public.chat_group_call_signals(to_user, created_at desc);

create or replace function public.chatly_is_group_call_member(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_group_calls gc
    join public.chat_group_members gm on gm.group_id = gc.group_id
    where gc.id = p_call_id and gm.user_id = auth.uid()
  );
$$;
revoke all on function public.chatly_is_group_call_member(uuid) from public;
grant execute on function public.chatly_is_group_call_member(uuid) to authenticated;

create or replace function public.chatly_is_group_call_participant(p_call_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_group_call_participants p
    where p.call_id = p_call_id and p.user_id = auth.uid()
  );
$$;
revoke all on function public.chatly_is_group_call_participant(uuid) from public;
grant execute on function public.chatly_is_group_call_participant(uuid) to authenticated;

create or replace function public.chatly_enforce_group_call_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_ended_at timestamptz;
begin
  select gc.ended_at into v_ended_at
  from public.chat_group_calls gc
  where gc.id = new.call_id and gc.group_id = new.group_id
  for update;

  if not found or v_ended_at is not null then
    raise exception 'This group call has ended.';
  end if;

  if exists (
    select 1 from public.chat_group_call_participants p
    where p.call_id = new.call_id and p.user_id = new.user_id
  ) then
    return new;
  end if;

  select count(*) into v_count
  from public.chat_group_call_participants p
  where p.call_id = new.call_id
    and p.last_seen_at > now() - interval '45 seconds';

  if v_count >= 6 then
    raise exception 'This group call already has six active participants.';
  end if;
  return new;
end;
$$;
revoke all on function public.chatly_enforce_group_call_capacity() from public;
drop trigger if exists chatly_group_call_capacity on public.chat_group_call_participants;
create trigger chatly_group_call_capacity
before insert on public.chat_group_call_participants
for each row execute function public.chatly_enforce_group_call_capacity();

alter table public.chat_group_calls enable row level security;
alter table public.chat_group_call_participants enable row level security;
alter table public.chat_group_call_signals enable row level security;

grant select, insert, update on public.chat_group_calls to authenticated;
grant select, insert, update, delete on public.chat_group_call_participants to authenticated;
grant select, insert, delete on public.chat_group_call_signals to authenticated;

drop policy if exists "Group members can view group calls" on public.chat_group_calls;
create policy "Group members can view group calls"
on public.chat_group_calls for select to authenticated
using (public.chatly_is_group_member(group_id));

drop policy if exists "Group members can start group calls" on public.chat_group_calls;
create policy "Group members can start group calls"
on public.chat_group_calls for insert to authenticated
with check (started_by = auth.uid() and public.chatly_is_group_member(group_id));

drop policy if exists "Call starter can end group calls" on public.chat_group_calls;
create policy "Call starter can end group calls"
on public.chat_group_calls for update to authenticated
using (started_by = auth.uid() and public.chatly_is_group_call_participant(id) and public.chatly_is_group_member(group_id))
with check (started_by = auth.uid() and public.chatly_is_group_call_participant(id) and public.chatly_is_group_member(group_id));

drop policy if exists "Group members can view call participants" on public.chat_group_call_participants;
create policy "Group members can view call participants"
on public.chat_group_call_participants for select to authenticated
using (public.chatly_is_group_member(group_id));

drop policy if exists "Members can join group calls as themselves" on public.chat_group_call_participants;
create policy "Members can join group calls as themselves"
on public.chat_group_call_participants for insert to authenticated
with check (
  user_id = auth.uid()
  and public.chatly_is_group_member(group_id)
  and exists (
    select 1 from public.chat_group_calls gc
    where gc.id = call_id and gc.group_id = chat_group_call_participants.group_id and gc.ended_at is null
  )
);

drop policy if exists "Members can update their own group call heartbeat" on public.chat_group_call_participants;
create policy "Members can update their own group call heartbeat"
on public.chat_group_call_participants for update to authenticated
using (user_id = auth.uid() and public.chatly_is_group_member(group_id))
with check (user_id = auth.uid() and public.chatly_is_group_member(group_id));

drop policy if exists "Members can leave group calls" on public.chat_group_call_participants;
create policy "Members can leave group calls"
on public.chat_group_call_participants for delete to authenticated
using (user_id = auth.uid() and public.chatly_is_group_member(group_id));

drop policy if exists "Recipients can read their group call signals" on public.chat_group_call_signals;
create policy "Recipients can read their group call signals"
on public.chat_group_call_signals for select to authenticated
using (to_user = auth.uid() and public.chatly_is_group_call_member(call_id));

drop policy if exists "Group members can send group call signals" on public.chat_group_call_signals;
create policy "Group members can send group call signals"
on public.chat_group_call_signals for insert to authenticated
with check (
  from_user = auth.uid()
  and to_user <> auth.uid()
  and public.chatly_is_group_call_member(call_id)
  and (signal_type = 'decline' or public.chatly_is_group_call_participant(call_id))
  and exists (
    select 1
    from public.chat_group_calls gc
    join public.chat_group_members gm on gm.group_id = gc.group_id
    where gc.id = chat_group_call_signals.call_id
      and gc.group_id = chat_group_call_signals.group_id
      and gm.user_id = chat_group_call_signals.to_user
  )
);

drop policy if exists "Recipients can clear their group call signals" on public.chat_group_call_signals;
create policy "Recipients can clear their group call signals"
on public.chat_group_call_signals for delete to authenticated
using (to_user = auth.uid() and public.chatly_is_group_call_member(call_id));

-- -----------------------------------------------------------------------------
-- 2. Personal conversation hiding (remove contact from your list only)
-- -----------------------------------------------------------------------------
create table if not exists public.chat_hidden_conversations (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

alter table public.chat_hidden_conversations enable row level security;
grant select, insert, delete on public.chat_hidden_conversations to authenticated;

drop policy if exists "Users can view their hidden conversations" on public.chat_hidden_conversations;
create policy "Users can view their hidden conversations"
on public.chat_hidden_conversations for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can hide their own conversations" on public.chat_hidden_conversations;
create policy "Users can hide their own conversations"
on public.chat_hidden_conversations for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.user_one = auth.uid() or c.user_two = auth.uid())
  )
);

drop policy if exists "Users can restore their own hidden conversations" on public.chat_hidden_conversations;
create policy "Users can restore their own hidden conversations"
on public.chat_hidden_conversations for delete to authenticated
using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. Per-user message hiding (delete for me) and sender edit/unsend
-- -----------------------------------------------------------------------------
create table if not exists public.chat_message_hidden (
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid not null,
  message_type text not null check (message_type in ('direct','group')),
  created_at timestamptz not null default now(),
  primary key (user_id, message_type, message_id)
);

alter table public.chat_message_hidden enable row level security;
grant select, insert, delete on public.chat_message_hidden to authenticated;

drop policy if exists "Users can view their hidden messages" on public.chat_message_hidden;
create policy "Users can view their hidden messages"
on public.chat_message_hidden for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Users can hide messages they can access" on public.chat_message_hidden;
create policy "Users can hide messages they can access"
on public.chat_message_hidden for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    (
      message_type = 'direct'
      and exists (
        select 1
        from public.direct_messages dm
        join public.conversations c on c.id = dm.conversation_id
        where dm.id = message_id
          and (c.user_one = auth.uid() or c.user_two = auth.uid())
      )
    )
    or
    (
      message_type = 'group'
      and exists (
        select 1 from public.chat_group_messages gm
        where gm.id = message_id and public.chatly_is_group_member(gm.group_id)
      )
    )
  )
);

drop policy if exists "Users can restore their hidden messages" on public.chat_message_hidden;
create policy "Users can restore their hidden messages"
on public.chat_message_hidden for delete to authenticated
using (user_id = auth.uid());

-- Only the sender may edit or unsend a direct message.
revoke update on public.direct_messages from authenticated;
grant update (content) on public.direct_messages to authenticated;
grant delete on public.direct_messages to authenticated;
alter table public.direct_messages enable row level security;
drop policy if exists "Senders can edit their own direct messages" on public.direct_messages;
create policy "Senders can edit their own direct messages"
on public.direct_messages for update to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_one = auth.uid() or c.user_two = auth.uid())
  )
)
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_one = auth.uid() or c.user_two = auth.uid())
  )
);

drop policy if exists "Senders can unsend their own direct messages" on public.direct_messages;
create policy "Senders can unsend their own direct messages"
on public.direct_messages for delete to authenticated
using (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (c.user_one = auth.uid() or c.user_two = auth.uid())
  )
);

-- Only the sender may edit or unsend their group messages.
revoke update on public.chat_group_messages from authenticated;
grant update (content) on public.chat_group_messages to authenticated;
grant delete on public.chat_group_messages to authenticated;
drop policy if exists "Senders can edit their own group messages" on public.chat_group_messages;
create policy "Senders can edit their own group messages"
on public.chat_group_messages for update to authenticated
using (sender_id = auth.uid() and public.chatly_is_group_member(group_id))
with check (sender_id = auth.uid() and public.chatly_is_group_member(group_id));

drop policy if exists "Senders can unsend their own group messages" on public.chat_group_messages;
create policy "Senders can unsend their own group messages"
on public.chat_group_messages for delete to authenticated
using (sender_id = auth.uid() and public.chatly_is_group_member(group_id));

-- -----------------------------------------------------------------------------
-- 4. Group management: owner can rename/remove members; anyone can leave
-- -----------------------------------------------------------------------------
revoke update on public.chat_groups from authenticated;
grant update (name) on public.chat_groups to authenticated;
drop policy if exists "Group owners can rename their groups" on public.chat_groups;
create policy "Group owners can rename their groups"
on public.chat_groups for update to authenticated
using (created_by = auth.uid())
with check (created_by = auth.uid() and public.chatly_is_group_member(id));

grant delete on public.chat_group_members to authenticated;
drop policy if exists "Members can leave and owners can remove group members" on public.chat_group_members;
create policy "Members can leave and owners can remove group members"
on public.chat_group_members for delete to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.chat_groups g
    where g.id = group_id and g.created_by = auth.uid()
  )
);

-- -----------------------------------------------------------------------------
-- 5. Realtime / full row identity for live edits, unsends, and member removals
-- -----------------------------------------------------------------------------
alter table public.direct_messages replica identity full;
alter table public.chat_group_messages replica identity full;
alter table public.chat_group_members replica identity full;
alter table public.chat_group_call_participants replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_group_call_participants'
  ) then
    alter publication supabase_realtime add table public.chat_group_call_participants;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_group_call_signals'
  ) then
    alter publication supabase_realtime add table public.chat_group_call_signals;
  end if;
end $$;

-- Existing group-chat SQL already adds chat_group_messages and chat_group_members to Realtime.


-- -----------------------------------------------------------------------------
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
