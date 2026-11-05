CHATLY MESSAGE SEND FIX
=======================

Files:
- Chatly-Message-Send-Fix-index.html: complete replacement HTML.
- README.txt: installation notes.

What changed:
- The send handler now targets the actual Send button (the prior code selected
  the first composer button, which was the attachment button).
- Verifies a usable Supabase session before inserting.
- Handles expired/missing sessions with a clearer message.
- Catches thrown/network errors and displays Supabase error code/details/hint.
- Keeps the typed message in the composer if sending fails.
- Clears the composer only after Supabase confirms the insert.
- Reloads messages/conversation previews after a successful insert so a delayed
  Realtime event does not leave the sender's message missing.
- Retains the existing direct_messages / chat_group_messages tables and
  existing message schema; this code patch does not require new SQL.

IMPORTANT:
This is a client-side send-path hardening patch, not a guaranteed fix for every
possible database issue. If the displayed error says RLS/permission denied,
the existing Supabase INSERT policies must be corrected for your actual schema.
No live Supabase project was accessed or tested.

Validation:
Passed node --check for 0 inline script(s).
