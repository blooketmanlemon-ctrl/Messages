CHATLY ROBLOX HUB + PRESS-AND-HOLD REACTIONS

What changed
- Replaced the basic RIVALS launcher card with an in-app Roblox Hub.
- RIVALS is included as a featured game; you can add more Roblox game links.
- You can copy the RIVALS link or prepare an invite in the currently open Chatly conversation.
- The Play buttons hand off in the SAME browser tab to the official Roblox app/site.
- Roblox gameplay itself cannot be embedded inside a normal Chatly webpage; Roblox requires its official client/site. The hub stays inside Chatly, but actual gameplay is a handoff.
- No Roblox password is requested or stored by Chatly.
- Removed the plus reaction button from every message. Hold a message bubble/attachment for about half a second to open the emoji picker. Existing reaction chips remain tappable.

Install
1. Replace the matching root files in your GitHub Pages repository with the ZIP contents.
2. Merge the supplied supabase folder if present; do not create a nested supabase/supabase folder.
3. Commit the changes and hard-refresh Chatly.

Database
- These UI changes do not require a new SQL migration.
- The social feature tables (chat_message_reactions, polls, votes, and message pins) must already exist and have their policies installed. If they were not installed previously, run the included CHATLY-REACTIONS-VOICE-PRESENCE-POLLS-PINS-SQL.sql once. Do not rerun it if already installed.

Privacy / safety
- Added Roblox game links are stored locally in this browser using localStorage.
- Chatly never collects Roblox credentials.
- School or network restrictions on Roblox cannot be bypassed by the Chatly hub.
