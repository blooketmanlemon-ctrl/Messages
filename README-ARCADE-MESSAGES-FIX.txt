CHATLY ARCADE + MESSAGES LAYOUT FIX

This update fixes the Arcade integration without changing the database.

WHAT CHANGED
- Removed the large Chatly Arcade row above Messages in the left sidebar.
- Arcade stays in the main RIGHT-HAND pane on desktop/tablet.
- On narrow screens, use the small 🎮 button in the Chatly header to open Arcade full-screen.
- Added a 🎮 button to an open conversation header so Arcade is available from a chat.
- Arcade startup no longer clears the active conversation or removes message Realtime channels.
- Returning from Arcade restores the conversation that was open before it.
- The mobile Messages list is no longer hidden automatically at login.

INSTALL
1. Unzip this package.
2. Replace the website files in the GitHub repository root with these files.
3. Commit the changes.
4. Fully close and reopen Chatly; on desktop use Ctrl+Shift+R.

DATABASE
No SQL changes are required. The Chatly Arcade SQL migration has already been run. Do NOT run it again.

This package does not change Metered TURN settings or Supabase Edge Functions.
