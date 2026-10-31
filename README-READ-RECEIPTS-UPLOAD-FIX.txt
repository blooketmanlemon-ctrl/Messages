CHATLY READ RECEIPTS + IMAGE / FILE UPLOAD FIX

WHAT CHANGED
- Direct messages show Read after the recipient has actually brought the message into view.
- Group messages show Seen by N when one or more other members have viewed them.
- Read status updates in real time when both users are online and refreshes from the database when a chat is reopened.
- The upload status is now dismissible and clears itself automatically.
- Upload failures show the useful Supabase error and the likely storage-policy fix instead of a permanent generic message.
- Adds secure direct-chat attachment access rules for the private chat-media bucket.

INSTALL
1. Supabase > SQL Editor > New Query. Run CHATLY-READ-RECEIPTS-AND-UPLOAD-FIX.sql once.
2. Replace the files in the ROOT of your GitHub Pages repository with this ZIP.
3. Commit.
4. Hard refresh Chatly. On iPad, fully close and reopen the Home Screen app.

NOTES
- This is an additional SQL migration; do not rerun the older group-chat, blocking, or push migrations.
- The migration creates chat-media as a private 50 MB bucket only if it does not already exist; existing bucket settings are preserved.
- Direct attachment object paths follow <conversation-uuid>/<user-uuid>/<filename>. Existing group attachment policies remain in place.
- No Metered credentials or Edge Function changes are required.
- Read receipts depend on the chat_message_reads table and Supabase Realtime publication.
