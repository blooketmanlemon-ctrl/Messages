CHATLY — TURN-RELAY-READY PRIVATE CALL BUILD

WHAT THIS UPDATE DOES
- Replaces the local-network-only ICE setup with a secure TURN configuration lookup.
- Chatly requests relay configuration from a Supabase Edge Function named
  chatly-turn-config. The relay URLs and credentials are kept in Supabase secrets,
  not in the public GitHub Pages files.
- Uses the normal WebRTC TURN/TURNS ICE server format. This is compatible with a
  provider such as Metered when it gives you TURN URLs, a username, and a credential.
- Caches returned relay settings in memory only. It does not save TURN credentials
  to localStorage.
- Keeps group messaging and the existing direct-call signaling/database schema.

IMPORTANT: THIS IS READY FOR PROVIDER CREDENTIALS, NOT PRE-CONFIGURED
This ZIP does not include a Metered account, API key, TURN username, or password.
You must obtain the TURN server details from the provider first. If Metered gives
an API key only (rather than TURN URLs + username + credential), do not put that key
in index.html or GitHub. Ask for its temporary credential/API instructions so the
Edge Function can be adapted to request short-lived credentials securely.

SET UP THE TURN PROVIDER
1. In your TURN provider dashboard, obtain the TURN server URLs, username, and
   credential. Prefer a TURNS endpoint using TLS/TCP port 443 where offered.
2. Do not paste a provider secret/API key into the website or this ZIP.
3. Set these Supabase Edge Function secrets (replace the example values):

   supabase secrets set CHATLY_TURN_URLS="turns:YOUR-TURN-HOST:443?transport=tcp,turn:YOUR-TURN-HOST:3478?transport=udp" CHATLY_TURN_USERNAME="YOUR-TURN-USERNAME" CHATLY_TURN_CREDENTIAL="YOUR-TURN-CREDENTIAL"

   Optional:
   supabase secrets set CHATLY_TURN_CREDENTIAL_TYPE="password"

   Use the exact URLs and ports supplied by your provider. Do not copy the example
   host or port unless your provider explicitly gives you those values.

DEPLOY THE EDGE FUNCTION
1. Install/use the Supabase CLI and sign in.
2. Link the CLI to your existing Supabase project:
   supabase link --project-ref rfivnjnvliqpehdkqqap
3. From the folder containing the supabase/ directory, deploy:
   supabase functions deploy chatly-turn-config
4. Confirm that the secrets above are set in the same Supabase project.
   JWT verification must remain enabled for this function.

PUBLISH THE WEBSITE
1. Replace the current Chatly repository files with the files in this ZIP.
2. Keep the supabase/ folder in the repository (especially
   supabase/functions/chatly-turn-config/index.ts and supabase/config.toml).
3. Commit and publish to GitHub Pages.
4. Refresh Chatly with Ctrl+Shift+R. Both callers need the updated site.
5. Start a private video call. Chatly will request the TURN configuration when the
   call is created and will show a clear setup error if the Edge Function/secrets
   are missing.

DATABASE / SQL
- NO SQL CHANGE is required for this TURN relay integration.
- The existing call_signals table and its existing RLS/Realtime policies are still
  used. Do not rerun or alter your existing SQL just for TURN.
- The earlier group-chat SQL remains included as CHATLY-GROUPS-SQL.sql. If you
  already ran it successfully, do not run it again for this update.

CALL SCOPE / LIMITS
- This config is wired into existing one-to-one WebRTC calls.
- Group video calls remain paused in this build; adding TURN does not itself create
  a multiparty group-call system or an SFU.
- TURN improves connectivity across different networks, but no provider can
  guarantee calls through every firewall. A school network may block even TLS/443.
- A fixed TURN username/password is visible to authenticated users who receive it
  in their browser. Prefer temporary/short-lived TURN credentials if your provider
  supports them. Never expose an account-wide API key in browser code.

TROUBLESHOOTING
- “TURN relay is not configured”: check the three Supabase secrets and deploy the
  Edge Function to the same Supabase project Chatly uses.
- “Failed to fetch” or function-not-found: check the deployment name and project.
- ICE connection failure: verify the provider URLs, username, credential, and that
  at least one TURNS/TCP port 443 endpoint is supported and allowed by the network.
