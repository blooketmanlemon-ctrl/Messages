CHATLY LIVE TYPING INDICATOR UPDATE — FIXED REALTIME SUBSCRIPTION

What's changed:
- Typing indicators use a dedicated Supabase Realtime Broadcast channel per conversation, separate from message database subscriptions.
- The app waits for the Broadcast channel to reach SUBSCRIBED before sending typing events.
- If someone starts typing while the channel is still connecting, the pending typing state is sent as soon as subscription succeeds.
- Typing state refreshes while the person is typing and clears when they stop, send, leave the conversation, or time out.
- Private and group chats are supported; group indicators can show participant names.
- No database table or SQL migration is required.

Install:
1. Extract this ZIP.
2. Replace the matching files in the root of your GitHub Pages repository with the extracted files.
3. Commit the changes.
4. On desktop, hard-refresh Chatly. On iPad, fully close and reopen the Home Screen app. If an old page remains, refresh once more after it reopens.

This build preserves the existing Mini Flappy home, message UI, read receipts, calls, TURN config, push setup, icons, and no-screen-sharing build.
No SQL, Metered changes, or Edge Function redeployment are required.
