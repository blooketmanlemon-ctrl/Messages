CHATLY ARCADE UPDATE

FEATURES
- Replaces the empty "Your messages" screen in the main right pane with Chatly Arcade.
- Adds a persistent Arcade entry under the conversation search.
- Solo Flap Chat mini-game (tap/click or Space to flap; best score stored on device).
- Multiplayer private rooms for Tic-Tac-Toe, Connect Four, Reaction Rush, Quick Tap Race, Word Scramble, and Number Hunt.
- Invite friends from existing private Chatly conversations.
- Invitees see in-app invites on their Arcade home and can join or decline.
- Supabase Realtime synchronizes room state and player scores.
- Responsive desktop, iPad, and mobile Arcade screens.

INSTALL
1. Run CHATLY-ARCADE-SQL.sql once in Supabase SQL Editor. The original Chatly conversations, group chats, calls, push, blocking, read receipts, and media storage are not changed.
2. Replace the files in the root of the GitHub Pages repository with this ZIP's files.
3. Commit and hard refresh. On iPad, fully close/reopen Chatly.
4. Open Chatly Arcade in the left sidebar. On the initial empty message screen, Arcade appears in the main right pane.

MULTIPLAYER NOTES
- Multiplayer invitations use existing private Chatly conversations as the friend list.
- Each player must sign into Chatly and open Arcade to see/join an invite. This build uses in-app realtime invites; it does not add push notifications for game invites.
- Turn-based Tic-Tac-Toe and Connect Four, plus Reaction Rush, Quick Tap Race, Word Scramble, and Number Hunt are included.
- The local Flap Chat score is stored on that device.
- Supabase Realtime publication is enabled by the SQL migration.
- No Metered credentials or calling Edge Functions are changed.
