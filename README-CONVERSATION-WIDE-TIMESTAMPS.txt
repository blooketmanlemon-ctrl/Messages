CHATLY CONVERSATION-WIDE SWIPE TIMESTAMPS

WHAT CHANGED
- A single rightward drag anywhere in the message thread reveals timestamps for all messages at once.
- The message content shifts left enough to create a timestamp gutter on the right.
- The gutter follows the finger while dragging.
- Releasing the pointer smoothly animates the timestamps and gutter back out.
- Vertical scrolling remains native; only a clear rightward horizontal gesture activates timestamps.
- Existing read receipts and the newest-read-message “Read at” behavior are preserved.

INSTALL
1. Replace the files in the ROOT of the GitHub Pages repository with this ZIP's contents.
2. Commit the changes.
3. Hard-refresh Chatly. On iPad, fully close and reopen the Home Screen app.

DATABASE
No SQL changes, Metered changes, or Edge Function redeployment are required.
