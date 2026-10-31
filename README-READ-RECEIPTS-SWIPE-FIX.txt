CHATLY READ RECEIPT + SWIPE TIMESTAMP FIX v2

Fixes:
- Read receipts are recorded only after an incoming message is at least 48% visible in the open conversation for 450ms.
- Read scanning runs after the chat panel is visible, on message-list scrolling, and when the app becomes visible.
- The sender sees a single “Read at [time]” label under the newest own message that has a real read receipt.
- Group chats show “Seen by N · [time]” under the newest own message with reader receipts.
- Message timestamps are hidden by default and appear in a chip to the right of the bubble after a right swipe.
- Outgoing bubbles shift left while the timestamp chip is visible, keeping the chip on-screen.
- Swipe handling is delegated to the message list and tracks pointer release at document level, improving iPad touch reliability.

No SQL migration is required if public.chat_message_reads and its existing RLS/realtime policies are already installed.
No Metered changes or Edge Function deployment is required.

Installation: replace the existing GitHub website files with the contents of this ZIP and commit.
