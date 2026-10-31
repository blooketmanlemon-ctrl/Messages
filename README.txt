CHATLY — CALL CONTROL + SOUND FIX + YOUR APP LOGO

This package updates the website files while keeping the current Chatly scroll layout,
media sharing, video calls, Supabase settings, and existing database schema.

WHAT CHANGED
- Added mute/camera-on-off controls to the outgoing ringing screen. They become active
  after the browser grants camera/microphone permission and stay available while ringing.
- Reworked Web Audio unlocking so sound starts after a user gesture, queues a small
  number of recent alerts until audio is unlocked, and has a Test sound button in Settings.
- Added the supplied Chatly logo as browser favicon, PWA icons, and iPad Home Screen icon.
- Updated service-worker cache version so the fresh icon assets load.

PUBLISH
1. Unzip this package.
2. In the GitHub Messages repository root, replace:
   index.html
   sw.js
   manifest.webmanifest
   icon.svg
3. Also upload these new files to the same root:
   icon-192.png
   icon-512.png
   apple-touch-icon.png
4. Commit to the main branch.
5. On Chatly, open Settings and use Test sound once. This grants the browser's audio
   permission for this page. Make sure the device is not muted.
6. The camera/microphone buttons appear on the outgoing call screen after permission
   has been granted, while the other person is still ringing.

DATABASE
No new SQL is needed for these changes. Keep the existing Supabase media and call
signaling tables you already created.

BROWSER NOTES
- Browsers require a tap/click before they allow web audio playback.
- Sound alerts require Chatly to be open and connected; this package does not add
  background push notifications.
- iPad Home Screen icons can be cached. If the old icon remains, remove the old
  Chatly Home Screen shortcut and add the website to the Home Screen again.
- Video calls require camera and microphone permissions. STUN-only calling can fail
  on some restrictive networks without a TURN relay.
