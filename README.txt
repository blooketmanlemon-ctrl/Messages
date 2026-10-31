# Chatly 2.0 — iMessage-inspired direct messaging

## What changed
- Completely redesigned, mobile-first message interface.
- One-to-one conversations by exact Chatly username.
- Profile display names and avatar uploads.
- Per-device contact nicknames.
- Light/dark appearance setting.
- Message history and realtime updates.
- Scroll position is preserved when new messages arrive unless the reader is already near the bottom.

## Keep your existing backend data
This is an additive upgrade. It does not delete the existing `profiles`, `servers`, `server_members`, `channels`, or `messages` tables.

## Install
1. In Supabase Dashboard > SQL Editor, run `chatly-2.0-upgrade.sql` once.
2. In your GitHub `Chat` repository, replace `index.html`, `sw.js`, `manifest.webmanifest`, and `icon.svg` with the matching files in this folder.
3. Commit the changes.
4. Wait for GitHub Pages to deploy, then refresh the site. If an old version remains, close the tab and reopen it.

The existing Supabase project URL and publishable key are already configured in `index.html`. A publishable/anon key is intended for browser use; never put a service-role secret in client code.

## Notes
- Existing server/channel messages remain in Supabase but are not shown in this new direct-message interface.
- Contact nicknames and theme choice are saved locally on each device.
- Avatar images are stored in the public `chat-avatars` bucket; anyone with an image URL can view that avatar.
- This is not end-to-end encrypted. Avoid sharing sensitive information.
- Public registration and username lookup mean people who know a username may be able to start a conversation. Use appropriate privacy and moderation controls before sharing widely.
