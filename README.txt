CHATLY — MEDIA, SOUNDS & VIDEO CALL CONTROLS

This package adds:
- Message notification tones and incoming/outgoing call ringtones (Web Audio; no external sound files).
- A sound on/off setting in Customize Chatly.
- Multi-file attachments: images, videos, audio, PDF, text, office documents and ZIP files.
- Private chat media storage with signed viewing URLs.
- Mute/unmute microphone and camera on/off buttons during video calls (included in the call panel).
- Existing Chatly scrolling layout preserved.

PUBLISH THE WEBSITE
1. Unzip this package.
2. Open https://github.com/blooketmanlemon-ctrl/Messages
3. Replace these four files in the repository root: index.html, sw.js,
   manifest.webmanifest, icon.svg.
4. Commit the changes to main.

SUPABASE
1. If you have already run the earlier video-call SQL, do not run it again.
2. Run media-uploads-setup.sql in Supabase SQL Editor once to create the private
   chat-media bucket, storage policies, and attachment columns.
3. The SQL file is included for convenience; do NOT upload it to GitHub.

USAGE
- Open a conversation and use the + button beside the message box to attach files.
- Maximum attachment size: 50 MB per file.
- Sounds can be switched off in Customize Chatly.
- Open a conversation and press the camera button to call. During a call use
  Mute mic, Unmute mic, Camera off, Camera on, and End call.

NOTES
- Browsers may require one tap/click before sounds can play.
- Camera/microphone require HTTPS and browser permission.
- WebRTC currently uses public STUN servers only; some strict networks may need
  a TURN relay for reliable connection.
- Files shared in a conversation can be viewed by its participants. Do not send
  passwords, private documents, or other sensitive information.
- This app has not been live-tested between two real accounts in this environment.
