CHATLY READ RECEIPTS + SWIPE TIMESTAMPS UPDATE

Changes:
- Private sent messages display “Read at [time]” when the recipient has opened them.
- Group sent messages display “Seen by N · [time]”.
- Message timestamps are hidden normally and appear beside the message after a right swipe.
- A left swipe hides the timestamp again; it auto-hides after 3 seconds.
- The current Messages-style icon, read receipts, upload fixes, and existing functions are preserved.

Installation: replace the website files in your GitHub repository with the contents of this ZIP and commit.
No additional SQL migration, Metered changes, or Edge Function redeployment is required.
The existing chat_message_reads table with read_at is required.
