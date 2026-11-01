CHATLY MINI FLAPPY HOME UPDATE

What changed:
- Removed the Chatly Arcade concept and its navigation from the website.
- Removed the multiplayer games/lobby/invite UI and its runtime subscriptions.
- The main right-hand empty/new-message panel now contains a small, original Flappy-style game.
- Your Messages list remains in the left sidebar, and opening a conversation works as before.
- On the main panel, tap/click Start, then tap/click the game or press Space/Arrow Up to flap.
- Best score is saved locally on this device. The optional sound toggle uses short synthesized tones.
- The mini-game pauses when you open a conversation and can resume when you return to the main panel.

Install:
1. Unzip this package.
2. Replace the runtime files in the root of your GitHub Pages repository with the matching files in this ZIP. Keep the supabase folder contents.
3. Commit and publish.
4. Hard refresh the website (Ctrl+Shift+R on desktop). On iPad, fully close the Home Screen app and reopen it.

No SQL changes, Supabase Edge Function redeployment, or Metered changes are needed.

Note: The Arcade SQL tables previously created in Supabase are left untouched; the website no longer references them. They can be removed manually later if you decide you want to clean up unused tables, but do not drop them as part of this UI update.
