-- Chatly group chats + shared group-call room IDs
-- Run once in Supabase Dashboard > SQL Editor as the project owner.

create table if not exists public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 48),
  created_by uuid not null references auth.users(id) on delete cascade,
  call_room uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  attachment_path text,
  attachment_name text,
  attachment_type text,
  attachment_size bigint,
  created_at timestamptz not null default now(),
  constraint chat_group_message_has_content check (
    char_length(content) > 0 or attachment_path is not null
  )
);

create index if not exists chat_group_members_user_idx on public.chat_group_members(user_id);
create index if not exists chat_group_messages_group_created_idx on public.chat_group_messages(group_id, created_at desc);

create or replace function public.chatly_is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.chat_group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid()
  );
$$;

revoke all on function public.chatly_is_group_member(uuid) from public;
grant execute on function public.chatly_is_group_member(uuid) to authenticated;

create or replace function public.chatly_create_group(p_name text, p_member_ids uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
  v_ids uuid[];
  v_count integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if p_name is null or char_length(btrim(p_name)) < 1 or char_length(btrim(p_name)) > 48 then
    raise exception 'Group names must be 1–48 characters.';
  end if;
  select coalesce(array_agg(distinct u.member_id), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as u(member_id)
  where u.member_id is not null and u.member_id <> auth.uid();
  if cardinality(v_ids) < 1 then raise exception 'Add at least one other group member.'; end if;
  if cardinality(v_ids) > 19 then raise exception 'Groups can have up to 20 members.'; end if;
  select count(*) into v_count from public.profiles p where p.id = any(v_ids);
  if v_count <> cardinality(v_ids) then raise exception 'One or more selected accounts could not be found.'; end if;

  insert into public.chat_groups(name, created_by)
  values (btrim(p_name), auth.uid()) returning id into v_group_id;
  insert into public.chat_group_members(group_id, user_id, added_by)
  values (v_group_id, auth.uid(), auth.uid());
  insert into public.chat_group_members(group_id, user_id, added_by)
  select v_group_id, u.member_id, auth.uid() from unnest(v_ids) as u(member_id)
  on conflict (group_id, user_id) do nothing;
  return v_group_id;
end;
$$;

create or replace function public.chatly_add_group_members(p_group_id uuid, p_member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_count integer;
  v_existing integer;
  v_added integer;
begin
  if auth.uid() is null then raise exception 'You must be signed in.'; end if;
  if not public.chatly_is_group_member(p_group_id) then raise exception 'You are not a member of this group.'; end if;
  select coalesce(array_agg(distinct u.member_id), '{}'::uuid[]) into v_ids
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) as u(member_id)
  where u.member_id is not null;
  select count(*) into v_count from public.profiles p where p.id = any(v_ids);
  if v_count <> cardinality(v_ids) then raise exception 'One or more selected accounts could not be found.'; end if;
  select count(*) into v_existing from public.chat_group_members where group_id = p_group_id;
  select count(*) into v_count from unnest(v_ids) as u(member_id)
    where not exists (select 1 from public.chat_group_members m where m.group_id=p_group_id and m.user_id=u.member_id);
  if v_existing + v_count > 20 then raise exception 'Groups can have up to 20 members.'; end if;
  insert into public.chat_group_members(group_id, user_id, added_by)
  select p_group_id, u.member_id, auth.uid() from unnest(v_ids) as u(member_id)
  on conflict (group_id, user_id) do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke all on function public.chatly_create_group(text, uuid[]) from public;
revoke all on function public.chatly_add_group_members(uuid, uuid[]) from public;
grant execute on function public.chatly_create_group(text, uuid[]) to authenticated;
grant execute on function public.chatly_add_group_members(uuid, uuid[]) to authenticated;

grant select on public.chat_groups, public.chat_group_members, public.chat_group_messages to authenticated;
grant insert on public.chat_group_messages to authenticated;

alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;

drop policy if exists "Group members can view their groups" on public.chat_groups;
create policy "Group members can view their groups"
on public.chat_groups for select to authenticated
using (public.chatly_is_group_member(id));

drop policy if exists "Members can view group membership" on public.chat_group_members;
create policy "Members can view group membership"
on public.chat_group_members for select to authenticated
using (public.chatly_is_group_member(group_id) or user_id = auth.uid());

drop policy if exists "Members can read group messages" on public.chat_group_messages;
create policy "Members can read group messages"
on public.chat_group_messages for select to authenticated
using (public.chatly_is_group_member(group_id));

drop policy if exists "Members can send group messages as themselves" on public.chat_group_messages;
create policy "Members can send group messages as themselves"
on public.chat_group_messages for insert to authenticated
with check (sender_id = auth.uid() and public.chatly_is_group_member(group_id));


create or replace function public.chatly_group_media_access(p_path text, p_user_id uuid, p_require_owner boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_parts text[];
  v_group_id uuid;
begin
  v_parts := storage.foldername(p_path);
  if coalesce(array_length(v_parts, 1), 0) < 2 then return false; end if;
  if v_parts[1] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  if p_require_owner and v_parts[2] <> p_user_id::text then return false; end if;
  v_group_id := v_parts[1]::uuid;
  return public.chatly_is_group_member(v_group_id);
exception when others then
  return false;
end;
$$;
revoke all on function public.chatly_group_media_access(text, uuid, boolean) from public;
grant execute on function public.chatly_group_media_access(text, uuid, boolean) to authenticated;

-- Allow members to read and upload group attachments in the existing chat-media bucket.
-- Group file paths are: <group-uuid>/<uploader-user-uuid>/<random>-<filename>
drop policy if exists "Chatly group members can read group media" on storage.objects;
create policy "Chatly group members can read group media"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-media'
  and public.chatly_group_media_access(name, auth.uid(), false)
);

drop policy if exists "Chatly group members can upload group media" on storage.objects;
create policy "Chatly group members can upload group media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and public.chatly_group_media_access(name, auth.uid(), true)
);

drop policy if exists "Chatly members can delete own group media" on storage.objects;
create policy "Chatly members can delete own group media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-media'
  and public.chatly_group_media_access(name, auth.uid(), true)
);

-- Enable Realtime for group messages and membership updates without failing if already published.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_group_messages') then
    alter publication supabase_realtime add table public.chat_group_messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_group_members') then
    alter publication supabase_realtime add table public.chat_group_members;
  end if;
end $$;
