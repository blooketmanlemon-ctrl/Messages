CHATLY STUDIO UPDATE

Includes:
- Personal sticker/GIF library stored locally in IndexedDB on each device.
- Upload PNG, JPG, WebP and GIF files up to 10 MB each.
- Send saved stickers/GIFs as normal chat attachments using the existing chat-media bucket.
- Long-press a message to choose emoji or sticker/GIF reactions.
- Save an image/GIF attachment from a message to your Studio library.
- Bubble designer for separate incoming and outgoing message styles (animal decorations, colors, textures and font).
- Bubble styling is local to the viewer and does not change what other users see.

INSTALLATION
1. Run CHATLY-STUDIO-STICKERS-SQL.sql once in Supabase SQL Editor. This creates the private chatly-stickers bucket and the shared sticker reaction table/policies.
2. Extract this ZIP and upload its contents to the existing GitHub repository root, replacing matching website files. Merge the supabase folder; do not nest it.
3. Hard-refresh Chatly on both devices before testing reactions.

NO SQL is needed for personal sticker storage or bubble styling; these are stored locally. The SQL is required only for shared sticker/GIF reactions.

FILE LIMITS
- PNG/JPG/WebP/GIF only.
- 10 MB maximum per Studio sticker/GIF.
- Personal library is per browser/device.
- Sending a sticker to a chat uploads it through the existing chat-media attachment flow.
