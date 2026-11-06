Chatly scroll-position fix

Replace the index.html in the ROOT of your existing GitHub repository with this file, then commit and wait for deployment.

This patch prevents the older-message pagination listener from firing while a conversation is initially opening and its message list is being laid out. It then sets the thread to the bottom after two animation frames, once message layout has settled.

No SQL changes are required for this client-side scroll fix.
