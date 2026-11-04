CHATLY RIVALS LAUNCHER
======================

This update adds a RIVALS launcher card beside the Mini Flappy waiting game.

FEATURES
--------
- Play RIVALS opens the Roblox share link supplied by the Chatly owner.
- Sign in to Roblox opens Roblox's official login page.
- Copy game invite link copies the same share link so it can be pasted into a Chatly conversation.
- Chatly does not ask for, receive, or store Roblox passwords and does not create a random Roblox account.
- Roblox sign-in and game launching are handled by Roblox's official app or website.

INSTALLATION
------------
1. Extract this ZIP.
2. Upload the ZIP contents to the root of the existing GitHub Pages repository.
3. Replace matching files, and merge the existing supabase folder if GitHub asks.
4. Commit the changes and hard-refresh Chatly.

DATABASE
--------
No SQL changes are required for this launcher.
No new Supabase Edge Function is required.
The existing social-features SQL migration and functions are included for convenience; do not rerun the SQL migration if it was already installed.

NOTE
----
The supplied Roblox URL is used as-is. The launcher hands off to Roblox. Roblox may open its app if installed, or its website otherwise; account sign-in is managed by Roblox.
