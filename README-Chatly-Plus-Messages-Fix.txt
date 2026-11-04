Chatly Plus Messages Fix

Files:
- Chatly-Plus-Messages-Fix-index.html: replacement index.html

Changes in this build:
- Removes Scheduled Send from Chatly Plus and removes its client-side processing.
- Fixes the conversation query so it fetches the newest 200 messages and displays them in chronological order. Previously it fetched the oldest 200, which made newer messages appear to vanish once a conversation grew.
- Keeps Shared Media, Group Roles, Notification Center, and existing bubble designer features.

SQL:
- No new SQL is required for these code changes, assuming the previously installed Chatly feature migrations are already present.
- This does not remove the old chat_scheduled_messages table; it simply stops using Scheduled Send in this website build.

Install:
1. Back up the current GitHub index.html.
2. Replace the repository's index.html with Chatly-Plus-Messages-Fix-index.html.
3. Commit and deploy.
