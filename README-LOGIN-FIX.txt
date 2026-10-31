CHATLY LOGIN / SUPABASE INITIALIZATION FIX

This build prevents the login form from using sb.auth before the Supabase client exists.
It loads the Supabase JS SDK with a fallback CDN, initializes the client once, and shows a useful message if both sources are unavailable.

INSTALLATION
1. Extract this ZIP.
2. Replace the files in the ROOT of your GitHub Pages repository.
3. Commit the changes.
4. Hard refresh Chatly. On iPad, fully close and reopen the Home Screen app.

No SQL, Metered, or Edge Function changes are required.
If both SDK CDNs are blocked by a school/network filter, Chatly will now show a clear SDK-loading message rather than an sb.auth undefined error.
