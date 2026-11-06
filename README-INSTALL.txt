CHATLY COMPLETE PLUS — ROOT REPLACEMENT BUILD
Build marker: chatly-complete-plus-2026-11-05-v2

WHAT THIS SOURCE CONTAINS (verified in this HTML):
- Global bubble designer stored locally on this device only.
- Per-conversation bubble overrides stored locally on this device only.
- Shared Media page in Chatly Plus (conversation picker, attachment filters/search, pagination).
- Group Roles page using chat_group_roles with owner/admin role controls.
- Older-message pagination in 200-message pages, with scroll-position preservation.
- Scheduled Send UI/processor references are absent from this HTML.
- Screen-sharing APIs are absent from this HTML.
- Existing Chatly Studio, stickers/GIFs, calls/group calls, attachments, reactions,
  read receipts, Brain Lab, themes, profile banner, translation, calendar, notes,
  notifications, and mini Flappy-style game remain in the source.

INSTALLATION — IMPORTANT
1. Open the EXISTING GitHub repository that hosts the live Chatly site.
2. Find the repository's current live index.html (normally at the repository root).
3. Replace that exact file with this index.html. Do not upload it into a new nested folder.
4. Commit the replacement and wait for the host's deployment to finish.
5. Open the deployed site's URL and view page source. Search for:
   chatly-complete-plus-2026-11-05-v2
   If that marker is not present, the hosting service is not serving this file yet.
6. This build changes the service-worker registration URL to ./sw.js?chatlyBuild=20261105v2
   and uses updateViaCache:none so the browser checks a newly versioned worker script.
   Keep your existing sw.js file and all other repository assets; do not delete them.

DATABASE
No new SQL is included. The existing SQL migration the user reported as successful
should not be rerun just for these client-side changes.

LIMITATIONS / HONEST VALIDATION
- The HTML was inspected for the listed feature implementations and its inline
  JavaScript was extracted and checked with Node's syntax checker.
- This build has NOT been run against the user's live Supabase project or deployed
  hosting account. Shared Media still depends on the existing chat-media Storage
  bucket and attachment access policies. Group Roles still depends on the existing
  chat_group_roles table/RLS policies. A client cannot repair missing database
  policies or restore messages that have actually been deleted from Supabase.
- This package includes index.html only. Keep the repository's existing sw.js,
  manifest, icons, and any other assets in place.
