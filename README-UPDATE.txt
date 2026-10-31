CHATLY CONTACT LIST + MESSAGE SELECTION UPDATE

This update includes the latest Chatly website files plus:
- Race-safe conversation refreshes to prevent duplicate contact rows after unsending/deleting messages.
- De-duplication of legacy direct conversation entries for the same contact.
- A single Select control at the upper-left of the chat header.
- Multi-message selection with Delete for me and Unsend for everyone.
- Edit enabled only when exactly one of your own text messages is selected.
- Per-message MESSAGE OPTIONS buttons removed.

INSTALLATION
1. Extract this ZIP.
2. Replace the files in the ROOT of your existing GitHub Pages repository.
3. Commit the changes.
4. Hard refresh Chatly (Ctrl+Shift+R on desktop). On mobile/iPad, fully close and reopen Chatly.

DATABASE
No new SQL is required. This update uses the existing chat_message_hidden table and existing message policies already installed in your Supabase project.

CALLING
The existing Metered TURN secrets and chatly-turn-config Edge Function are unchanged.


BLOCKING UPDATE
1. Run CHATLY-BLOCKING-SQL.sql once in Supabase SQL Editor.
2. Replace the files in the ROOT of your GitHub Pages repository with this ZIP's contents.
3. Commit and hard-refresh Chatly.

Blocking prevents new private messages and one-to-one calls in either direction. Existing messages remain visible. Shared group chats and group calls are not affected by an individual block. No Metered settings or Edge Function changes are required.

PUSH NOTIFICATIONS (NEW)
1. Run CHATLY-PUSH-NOTIFICATIONS-SQL.sql once in Supabase SQL Editor.
2. Add CHATLY_VAPID_PUBLIC_KEY, CHATLY_VAPID_PRIVATE_KEY and CHATLY_VAPID_SUBJECT
   as Supabase Edge Function Secrets. The values are provided in the ChatGPT setup
   instructions. Use a mailto: address you control for CHATLY_VAPID_SUBJECT.
3. Deploy the new supabase/functions/chatly-push/index.ts Edge Function with JWT
   verification enabled. Keep the VAPID private key and Supabase service-role key
   only in Supabase Secrets; never commit them to GitHub.
4. On iPad/iPhone (iOS/iPadOS 16.4+), add Chatly to the Home Screen, open it from
   that icon, then open Chatly Settings and tap Enable notifications.
5. Enable notifications separately on every device where alerts should arrive.

Push alerts use the device's normal notification sound. A web app cannot guarantee
continuous native-style call ringing or CallKit UI while fully closed; that needs
a native iOS app. See CHATLY-PUSH-SETUP.txt for the full installation notes.


SCREEN-SHARE + SETTINGS UPDATE
- Improved screen sharing uses the browser's standard getDisplayMedia API with more compatible capture constraints, safer sender selection, partial-failure rollback for group calls, and clearer browser permission errors.
- Important: screen capture is only available where the browser/OS exposes getDisplayMedia. Some iPadOS browser/PWA combinations do not expose it; no website code can override an OS-level limitation. Use an updated Safari/desktop browser that supports screen capture.
- Settings dialog now scrolls on desktop and iPad/mobile, including safe-area handling.
- Added accent colors, chat wallpapers, text size, bubble shape, compact/comfortable spacing, Enter-to-send preference, and reduced-motion option.
- Preferences are stored locally per device.
- No SQL changes, Metered changes, or Supabase Edge Function redeployment required.

Icon sizing update: the Chatly artwork inside the app icons has been enlarged slightly (2.5%) while preserving each icon canvas size. The service-worker cache version was bumped so the updated icons refresh after deployment.

Icon update: app artwork was inset into an iPadOS squircle-safe area; icon files remain 192x192/512x512.
