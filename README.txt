CHATLY — VIDEO CALLS ONLY

This package adds one-to-one video calling while preserving the current Chatly
page layout and scrolling CSS as supplied. It does not introduce another
scrolling/layout change.

PUBLISH THE WEBSITE
1. Unzip this package.
2. Open https://github.com/blooketmanlemon-ctrl/Messages
3. Replace these files in the repository root:
   - index.html
   - sw.js
   - manifest.webmanifest
   - icon.svg
4. Commit the changes.
5. Open Chatly, sign in, open an existing conversation, and look for the
   camera button in the conversation header.
6. Refresh with Ctrl+Shift+R if the old version is still visible.

SUPABASE
The file video-calls-setup.sql is included for reference.
Run it in Supabase SQL Editor only if the video-call signaling setup has NOT
already succeeded. Do not upload the SQL file to GitHub.

CALL NOTES
- Both people must be signed in and open the same conversation.
- Both browsers must allow camera and microphone access.
- This version uses WebRTC with STUN only. Some networks may require a TURN
  relay, so calls may not connect on every network.
- This is an experimental messaging app, not an end-to-end encrypted service.
