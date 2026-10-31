CHATLY ARCADE - MESSAGES/LAYOUT REPAIR

WHAT THIS UPDATE FIXES
- Removes the large Chatly Arcade banner from above the Messages list.
- Keeps the Arcade home/game system in the main RIGHT-HAND pane on desktop and tablet.
- Adds a compact 🎮 launcher in the Chatly top header for phones and small screens.
- Adds a 🎮 launcher in the open-conversation header so Arcade remains easy to reach.
- The mobile Messages list is shown by default after login; Arcade no longer hides it automatically.
- Arcade startup no longer clears the active conversation or tears down direct/group message Realtime channels.
- Returning from Arcade restores the conversation that was open before it.
- Returning to the Messages landing refreshes the conversation list.

INSTALL
1. Unzip this package.
2. Replace the website files in the GitHub Pages repository root with these files.
3. Commit the changes.
4. Desktop: hard refresh with Ctrl+Shift+R.
5. iPad/iPhone: fully close Chatly and reopen it. If the old version remains, remove and re-add the Home Screen shortcut after the site updates.

DATABASE
The Chatly Arcade SQL migration has ALREADY been run. No SQL changes are needed for this repair. Do not run the Arcade SQL again.

CALLING
Metered TURN settings and Supabase calling/push Edge Functions are unchanged.

NOTE
Multiplayer invites and game synchronization still require testing across two signed-in Chatly accounts. This update fixes navigation and preserves message subscriptions; it does not claim that every multiplayer mode has been live-tested.
