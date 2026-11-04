CHATLY ROBLOX HUB UPDATE

- Replaces the RIVALS-only card with a general Roblox game library inside Chatly.
- Adds a Roblox icon beside the New Contact button in the top-left sidebar.
- Opens an in-app Chatly hub where users can save Roblox experience/share links, launch them in the current browsing context, and prepare an invite to a Chatly friend.
- Saved game links are stored locally in this browser with localStorage.
- No new SQL migration is required for this hub.
- Roblox authentication and gameplay must be handled by the official Roblox app/site. Roblox's game client cannot be embedded in a normal Chatly webpage, and this hub does not bypass school/network restrictions.

Install by replacing the matching root website files in the existing GitHub Pages repository. Merge the included supabase folder with the repository's existing supabase folder; do not create supabase/supabase.
