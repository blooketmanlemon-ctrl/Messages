CHATLY SETTINGS OPEN FIX

This update repairs the Customize/Settings panel. The previous build contained settings controls that referenced missing preference maps and helper functions, causing the click handler to throw before opening the panel.

This build restores the accent color, wallpaper, text size, message spacing, bubble shape, reduced motion, and Enter-to-send preference code. It retains the scrollable settings panel and the Supabase login initialization fix.

INSTALLATION
1. Extract the ZIP.
2. Replace the files in the root of your GitHub Pages repository with these files.
3. Commit the changes.
4. Fully close/reopen Chatly or hard-refresh the page. The service-worker cache version has been updated.

No SQL, Metered, or Edge Function changes are required.
