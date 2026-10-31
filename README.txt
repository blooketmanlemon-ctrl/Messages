CHATLY — CALL CHAT, CAMERA FLIP, SCREEN SHARING + MESSAGE BOARD UPDATE
============================================================

WHAT IS NEW
- Screen sharing in one-to-one video calls and native in-Chatly group calls.
- Edit your own text messages.
- Delete a message for yourself only.
- Unsend your own messages for everyone.
- Remove a direct contact from your own conversation list without deleting the other person's copy.
- Leave a group.
- Group creators can rename groups and remove group members.
- Existing Metered TURN relay integration is preserved.
- In-call text chat in private calls and native group calls.
- Flip camera control in private and group calls (when another camera is available).

INSTALLATION
1. The original CHATLY-GROUPS-SQL.sql should already have been run for group chats.
2. In Supabase SQL Editor:
   - If you have NOT run the previous combined migration yet, run the updated
     CHATLY-GROUP-CALLS-AND-MESSAGE-BOARD-SQL.sql once. It now includes the
     in-call chat table as well.
   - If you ALREADY ran the earlier version of that combined migration, run
     only CHATLY-IN-CALL-CHAT-SQL.sql to add in-call messages. Do not rerun the
     older CHATLY-GROUP-CALLS-SQL.sql as a separate second migration.
3. Replace the website files in your GitHub repository with the contents of this
   ZIP and commit. Keep the supabase/ folder and the existing
   supabase/functions/chatly-turn-config/index.ts file.
4. No changes to Metered TURN secrets or the deployed chatly-turn-config Edge
   Function are needed.
5. Refresh Chatly on all devices.

SCREEN SHARING NOTES
- Uses the browser's built-in getDisplayMedia API. It does not use Jitsi or add
  another screen-sharing website/service.
- Requires HTTPS and a browser/device that exposes screen capture. Some mobile
  browsers, including some iPhone/iPad Safari versions, may not support web screen
  sharing. Chatly displays an explanation if the API is unavailable.
- This first version shares screen video only; it does not share system/device audio.
- The receiving participant sees the shared screen in the existing remote video tile.
- Stop sharing from Chatly or from the browser's native sharing control.

MESSAGE BOARD / MODERATION NOTES
- Delete for me stores a per-user hidden-message record. Other participants still
  see the message.
- Unsend for everyone permanently deletes the original sender's message row.
  Supabase RLS only allows the original sender to unsend or edit it.
- Remove contact only hides a direct conversation from the current user's list.
  It does not erase the other user's messages or delete their account. Starting a
  new chat with that username restores the conversation in the list.
- Group members can leave. Group creators can rename the group and remove members.
- Group call capacity remains 6 active participants for this WebRTC mesh build.

SUPABASE / TURN
- No SQL changes to the existing Metered secrets or chatly-turn-config Edge
  Function are needed.
- Keep the Metered TURN URL, username, and credential in Supabase Edge Function
  secrets. Do not put TURN passwords or provider API keys in the public website.

TESTING / LIMITATIONS
- JavaScript syntax and ZIP integrity were checked.
- Real device-to-device screen sharing, database RLS permissions, and multi-person
  group calling have not been live-tested here. Test with two accounts first.


IN-CALL CHAT + CAMERA FLIP UPDATE
- Private and group calls now include an in-call chat panel.
- Both call types include a Flip camera control (where the browser exposes another camera).
- Screen sharing and the existing Metered TURN Edge Function remain included.
- The in-call chat feature needs the additional chat_call_messages table, RLS policies,
  and Realtime publication included in the updated SQL migration.
- No changes to Metered TURN secrets or chatly-turn-config are required.
- Camera switching and multi-device in-call chat require real-device testing.

IN-CALL CHAT NOTES
- Call chat is scoped to the current call ID. Messages are stored in Supabase and shown only to the two private-conversation members or active group-call participants.
- Call messages are limited to 1,000 characters.
- If the earlier combined migration was already run, apply the bundled incremental CHATLY-IN-CALL-CHAT-SQL.sql file instead of rerunning the full migration.

CAMERA FLIP NOTES
- Flip camera requests another available video input or switches the facingMode between user and environment.
- It requires a browser/device that exposes more than one camera or supports facingMode switching. Desktops with one camera may not visibly switch.
- If screen sharing is active, camera switching updates the camera that will resume after screen sharing stops.
