CHATLY THEME & WALLPAPER REPAIR

WHAT CHANGED
- Rebuilt the per-conversation theme/wallpaper picker.
- Each conversation saves its own wallpaper selection.
- Global Chatly wallpaper remains the fallback for chats set to Default.
- Added 10 built-in wallpaper presets plus an HTTPS custom wallpaper URL.
- Applies the selected wallpaper on conversation open and again after messages load.
- Bumped the service-worker cache name.

INSTALLATION
1. Extract this ZIP.
2. Upload the extracted contents to the root of the existing Chatly GitHub repository, replacing matching files.
3. Merge the supabase folder if GitHub asks; do not create a nested supabase/supabase folder.
4. Commit, then hard-refresh Chatly. On iPad, close and reopen the Home Screen app.

DATABASE
No SQL migration is needed. Theme choices are stored in localStorage per device and per conversation.

NOTE
Custom wallpapers use HTTPS image URLs. This is a browser-based background image, not an uploaded Storage asset.
