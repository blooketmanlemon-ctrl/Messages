// Chatly TURN configuration endpoint.
// Configure the values as Supabase Edge Function secrets; never put relay
// credentials or provider API keys in index.html or GitHub Pages.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  // Supabase's Edge Function gateway verifies the user's JWT by default.
  // Keep verify_jwt enabled when deploying this function.
  const urlsRaw = Deno.env.get("CHATLY_TURN_URLS") ?? "";
  const username = Deno.env.get("CHATLY_TURN_USERNAME") ?? "";
  const credential = Deno.env.get("CHATLY_TURN_CREDENTIAL") ?? "";
  const credentialType = Deno.env.get("CHATLY_TURN_CREDENTIAL_TYPE") ?? "password";

  const urls = urlsRaw.split(",").map((value) => value.trim()).filter(Boolean);
  if (!urls.length || !username || !credential) {
    return json({
      error: "TURN relay is not configured. Set CHATLY_TURN_URLS, CHATLY_TURN_USERNAME, and CHATLY_TURN_CREDENTIAL as Supabase Edge Function secrets.",
    }, 503);
  }
  if (!urls.every((url) => /^turns?:/i.test(url))) {
    return json({ error: "CHATLY_TURN_URLS must contain only TURN/TURNS URLs supplied by your relay provider." }, 500);
  }
  if (credentialType !== "password" && credentialType !== "oauth") {
    return json({ error: "CHATLY_TURN_CREDENTIAL_TYPE must be password or oauth." }, 500);
  }

  return json({
    iceServers: [{
      urls,
      username,
      credential,
      credentialType,
    }],
    // Credentials remain in memory in the browser and are fetched again periodically.
    cacheSeconds: 240,
  });
});
