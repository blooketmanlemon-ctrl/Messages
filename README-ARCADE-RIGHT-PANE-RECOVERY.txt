CHATLY ARCADE — MAIN RIGHT-PANE RECOVERY

This build keeps the existing Messages list and puts Arcade in the main chat pane.

WHAT YOU SHOULD SEE
- Desktop/iPad landscape: Messages list stays in the LEFT sidebar. Chatly Arcade fills the RIGHT main panel when no conversation is open.
- The large Arcade tile is NOT above the Messages list. The Arcade launcher is a small gamepad button beside the Settings/sign-out buttons at the bottom of the left sidebar.
- When a conversation is open, its header has a gamepad button to open Arcade in the main panel.
- Arcade has its own home, game cards, invites and a “← Messages” control.
- On a narrow phone layout, Arcade opens as the main full-screen view first; “← Messages” returns to the list. Use the footer gamepad button to return to Arcade.
- The Arcade startup is isolated: errors loading Arcade do not stop sign-in or the Messages list from loading.

INSTALL
1. Download and unzip this package.
2. Open the extracted folder. You should immediately see index.html, sw.js and manifest.webmanifest.
3. Upload/replace those files DIRECTLY in the root of your GitHub Pages repository. Do not upload the enclosing folder.
4. Commit changes. Wait for GitHub Pages to publish.
5. Desktop: Ctrl+Shift+R. iPad: close the Home Screen Chatly app completely, reopen it, then reload the site if needed.

DATABASE
No SQL changes required. The Arcade tables have already been installed. Do not run CHATLY-ARCADE-SQL.sql again.
No Metered changes or Edge Function deployment required.

If your GitHub Pages URL uses a subfolder path, keep the existing relative asset paths and upload the contents of this ZIP to the same folder that currently contains index.html.
