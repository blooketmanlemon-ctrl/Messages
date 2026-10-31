CHATLY CONTACT LIST + MESSAGE SELECTION UPDATE

This update includes the latest Chatly website files plus:
- Race-safe conversation refreshes to prevent duplicate contact rows after unsending/deleting messages.
- De-duplication of legacy direct conversation entries for the same contact.
- A single Select control at the upper-left of the chat header.
- Multi-message selection with Delete for me and Unsend for everyone.
- Edit enabled only when exactly one of your own text messages is selected.
- Per-message MESSAGE OPTIONS buttons removed.

INSTALLATION
1. Extract this ZIP.
2. Replace the files in the ROOT of your existing GitHub Pages repository.
3. Commit the changes.
4. Hard refresh Chatly (Ctrl+Shift+R on desktop). On mobile/iPad, fully close and reopen Chatly.

DATABASE
No new SQL is required. This update uses the existing chat_message_hidden table and existing message policies already installed in your Supabase project.

CALLING
The existing Metered TURN secrets and chatly-turn-config Edge Function are unchanged.


BLOCKING UPDATE
1. Run CHATLY-BLOCKING-SQL.sql once in Supabase SQL Editor.
2. Replace the files in the ROOT of your GitHub Pages repository with this ZIP's contents.
3. Commit and hard-refresh Chatly.

Blocking prevents new private messages and one-to-one calls in either direction. Existing messages remain visible. Shared group chats and group calls are not affected by an individual block. No Metered settings or Edge Function changes are required.
