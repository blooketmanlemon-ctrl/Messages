CHATLY CONVERSATION-WIDE SWIPE TIMESTAMPS

WHAT CHANGED
- A single leftward drag anywhere in the message thread reveals timestamps for all messages at once.
- The message content shifts left enough to create a timestamp gutter on the right.
- The gutter follows the finger while dragging.
- Releasing the pointer smoothly animates the timestamps and gutter back out.
- Vertical scrolling remains native; only a clear leftward horizontal gesture activates timestamps.
- Existing read receipts and the newest-read-message “Read at” behavior are preserved.

INSTALL
1. Replace the files in the ROOT of the GitHub Pages repository with this ZIP's contents.
2. Commit the changes.
3. Hard-refresh Chatly. On iPad, fully close and reopen the Home Screen app.

DATABASE
No SQL changes, Metered changes, or Edge Function redeployment are required.


LATEST UPDATE
- Swipe LEFT to reveal timestamps for all messages; release to smoothly hide them.
- Opening a conversation now takes over the full app window on desktop, tablet and mobile.
- Use the back arrow in the top-left of the conversation header to return to the main conversation list.
