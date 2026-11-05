CHATLY COMPLETE PLUS — INSTALLATION NOTES

FILES
- Chatly-Complete-Plus-index.html: complete replacement HTML file.
- Chatly-Complete-Plus.zip: contains the replacement HTML and this README.

INCLUDED UPDATES
1. Message history: cursor-based history loading in 200-message batches, loading older messages as you scroll upward, and preserving the number of already-loaded messages when refreshing a long conversation. This removes the old fixed-history ceiling in the client.
2. Message sending: uses the actual Send button, checks the current Supabase session, reports detailed Supabase errors, preserves typed text after a failure, and refreshes the active thread after a successful send.
3. Bubble customization: a global default for your device plus separate overrides for individual direct and group conversations. The Settings page has a shortcut to the designer. These choices are stored in localStorage and are not shared with other Chatly users.
4. Shared Media: choose any conversation without opening it, browse photos/videos/audio/files, search attachment names, filter by type, and load more results.
5. Group Roles: choose a group, see its owner and members, view roles, and assign Member/Moderator/Admin. Only the group owner or an existing Admin is shown controls; Supabase RLS remains the security boundary. The owner is displayed as Owner and is not overwritten in the role table.
6. Notifications: the Chatly features launcher gets a red unread dot only when unread notification-center items exist.
7. Scheduled Send: the Scheduled Send page and its client-side auto-send processor have been removed. The old database table is intentionally left untouched and unused; this avoids deleting any existing rows.
8. Existing Chatly features retained from the supplied full source, including calls/group calls, attachments, reactions, read receipts, Chatly Studio stickers/GIFs, Brain Lab, themes, profile customization, translation, calendar, notes, and the mini Flappy-style game. No screen-sharing implementation has been added.

INSTALLATION
1. Back up your current index.html.
2. Replace it with Chatly-Complete-Plus-index.html in your existing project.
3. Keep your existing companion files (for example, Supabase service-worker/config assets) unless your project specifically uses a different deployment layout.
4. Deploy the replacement through your usual GitHub/hosting workflow.

DATABASE NOTES
- This is a client-side update and does not require rerunning the SQL migration you already reported as successful.
- Group Roles expects the existing public.chat_group_roles table and policies, public.chat_group_members, and public.chat_groups.created_by.
- Shared Media expects the existing attachment columns and the chat-media Storage bucket/policies.
- The old chat_scheduled_messages database table is not dropped. It is simply no longer called by this HTML.

VALIDATION AND LIMITATIONS
- All four inline JavaScript blocks passed `node --check`.
- Static checks confirmed the Scheduled Send table/processor references are absent from the replacement HTML and the screen-capture API is absent.
- This package has NOT been connected to or tested against your live Supabase project, school Wi-Fi, or multiple real user accounts. JavaScript syntax validation is not proof that database RLS, Storage policies, realtime subscriptions, or browser behavior are correct. If a live Supabase error appears, the exact error text is needed to diagnose that deployment-specific issue.
