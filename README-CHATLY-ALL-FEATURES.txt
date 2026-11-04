CHATLY ALL-FEATURES UPDATE

This update adds a Chatly Plus hub with:
1. Notification Center
2. Shared Media Gallery (current conversation)
3. Scheduled Messages
4. Brain Lab leaderboards
5. Per-conversation chat themes
6. Profile banner and short status
7. In-app message translation
8. Shared Calendar with in-app reminders
9. Private Chatly Notes
10. Group member roles

INSTALLATION
1. If you have NOT already run the social-features migration for reactions, polls and pins, run CHATLY-REACTIONS-VOICE-PRESENCE-POLLS-PINS-SQL.sql first. It is safe to rerun.
2. Run CHATLY-ALL-FEATURES-SQL.sql once in Supabase SQL Editor.
3. Extract this ZIP.
4. Upload the extracted contents to the ROOT of your existing GitHub repository.
5. Replace matching files and MERGE the supabase folder (do not nest it).
6. Commit changes, then hard-refresh Chatly.

IMPORTANT FEATURE LIMITS
- Scheduled messages send when the sender's Chatly session is open. If Chatly is closed at the scheduled time, Chatly catches up the next time that account opens Chatly. This package does not deploy a server-side cron worker.
- Calendar reminders appear in the in-app Notification Center while Chatly is open. This package does not deploy a background push scheduler.
- Translation sends selected text to the MyMemory third-party translation service only after the user checks the consent box. Avoid sending sensitive text to an external service. Availability and rate limits are controlled by that service.
- Profile banners use a secure HTTPS image URL, not a new upload bucket.
- Shared Media Gallery generates temporary signed links to files in the existing private chat-media bucket.
- Individual chat themes are saved locally on the current device.
- Group roles are stored in Supabase; the group creator or an existing admin can assign admin/moderator roles. Existing group permissions for unrelated actions are not automatically expanded by this feature.
- Notification Center receives message activity while Chatly is open and calendar reminders through its in-app scheduler. Existing web push notifications continue to use their existing setup.

REQUIRES
- Existing Chatly schema, including conversations, chat_groups, chat_group_members, chat_group_messages, direct_messages and public.chatly_is_group_member(uuid).
- Existing Supabase Realtime publication.
- Existing chat-media bucket for the Shared Media Gallery.

No Metered settings or TURN Edge Function changes are included.
