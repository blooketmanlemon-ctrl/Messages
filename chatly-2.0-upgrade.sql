-- Chatly 2.0 direct-message upgrade.
-- Additive migration: keeps existing accounts, profiles, servers, channels and messages.
-- Run in Supabase Dashboard > SQL Editor. Never expose a service_role key in the website.

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;
update public.profiles set display_name = username where display_name is null;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.profiles(id) on delete cascade,
  user_two uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint conversations_distinct_users check (user_one <> user_two),
  constraint conversations_sorted_users check (user_one < user_two),
  constraint conversations_pair_unique unique (user_one, user_two)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages(conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "Chatly users can view their conversations" on public.conversations;
create policy "Chatly users can view their conversations"
on public.conversations for select to authenticated
using (auth.uid() = user_one or auth.uid() = user_two);

drop policy if exists "Chatly participants can read direct messages" on public.direct_messages;
create policy "Chatly participants can read direct messages"
on public.direct_messages for select to authenticated
using (exists (
  select 1 from public.conversations c
  where c.id = conversation_id and auth.uid() in (c.user_one, c.user_two)
));

drop policy if exists "Chatly participants can send their own direct messages" on public.direct_messages;
create policy "Chatly participants can send their own direct messages"
on public.direct_messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id and auth.uid() in (c.user_one, c.user_two)
  )
);

create or replace function public.chatly_get_or_create_conversation(p_other_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
  result_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_other_user is null or p_other_user = auth.uid() then
    raise exception 'Choose another Chatly user';
  end if;
  if not exists (select 1 from public.profiles where id = p_other_user) then
    raise exception 'Chatly user not found';
  end if;
  a := least(auth.uid(), p_other_user);
  b := greatest(auth.uid(), p_other_user);
  insert into public.conversations(user_one, user_two)
  values (a, b)
  on conflict (user_one, user_two) do nothing;
  select id into result_id from public.conversations
  where user_one = a and user_two = b;
  return result_id;
end;
$$;

revoke all on function public.chatly_get_or_create_conversation(uuid) from public;
grant execute on function public.chatly_get_or_create_conversation(uuid) to authenticated;

-- Ensure the avatar bucket exists. Existing avatar objects are not deleted.
insert into storage.buckets (id, name, public)
values ('chat-avatars', 'chat-avatars', true)
on conflict (id) do update set public = true;

drop policy if exists "Chatly avatar images are publicly viewable" on storage.objects;
create policy "Chatly avatar images are publicly viewable"
on storage.objects for select to public
using (bucket_id = 'chat-avatars');

drop policy if exists "Users upload their own Chatly avatars" on storage.objects;
create policy "Users upload their own Chatly avatars"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then null;
when undefined_object then null;
end $$;
