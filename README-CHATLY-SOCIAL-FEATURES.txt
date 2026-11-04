CHATLY SOCIAL FEATURES UPDATE
=============================

This update adds five features to the current Chatly website:
1. Message reactions (private and group conversations).
2. Voice messages (MediaRecorder; sends through the existing chat-media storage bucket).
3. Online / away / offline indicators (Supabase Realtime Presence; no presence table).
4. Group polls (group-only, with live vote totals).
5. Pinned messages (private and group conversations).

INSTALLATION
------------
1. Run CHATLY-REACTIONS-VOICE-PRESENCE-POLLS-PINS-SQL.sql once in Supabase SQL Editor.
2. Extract this ZIP.
3. Upload the CONTENTS of this folder to the root of the existing GitHub Pages repository.
4. Replace matching website files, but merge the supplied supabase folder with your existing supabase folder rather than nesting supabase/supabase.
5. Commit the update and hard-refresh Chatly on each device.

IMPORTANT
---------
- The SQL migration assumes the existing Chatly schema is already installed:
  conversations, direct_messages, chat_groups, chat_group_members,
  chat_group_messages, and public.chatly_is_group_member(uuid).
- Voice messages reuse the existing chat-media bucket and current upload policies.
- Realtime publication entries are added for reactions, polls, poll votes, and pins.
- Presence uses Supabase Realtime Presence and adds no SQL table.
- No Metered TURN secrets or Edge Function changes are required.
- Do not run the earlier Arcade SQL again. The website update does not use Arcade.

TESTING
-------
Test with two or more separate Chatly accounts:
- React to a message and confirm the other account sees the count update.
- Record and send a short voice clip; confirm it plays in the chat.
- Check Online / Away / Offline in the conversation list and chat header.
- Create a group poll and vote from another member account.
- Pin a message, confirm the other group member sees it, then unpin it.

Some browsers do not support MediaRecorder or microphone access equally. Voice recording requires HTTPS and microphone permission.
