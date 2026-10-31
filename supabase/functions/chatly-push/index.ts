// Chatly Web Push gateway.
// VAPID private key and Supabase service-role key stay in Supabase Secrets.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Supabase secret: ${name}`);
  return value;
}

async function sendToUsers(admin: any, userIds: string[], payload: Record<string, unknown>) {
  const targets = [...new Set(userIds)].filter(Boolean);
  if (!targets.length) return { sent: 0, expired: 0 };
  const { data: subscriptions, error } = await admin
    .from("chat_push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .in("user_id", targets);
  if (error) throw error;
  let sent = 0;
  let expired = 0;
  await Promise.all((subscriptions || []).map(async (row: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify(payload),
        { TTL: payload.kind === "private-call" || payload.kind === "group-call" ? 60 : 300,
          urgency: payload.kind === "private-call" || payload.kind === "group-call" ? "high" : "normal" }
      );
      sent++;
    } catch (error: any) {
      const status = Number(error?.statusCode || error?.status || 0);
      if (status === 404 || status === 410) {
        await admin.from("chat_push_subscriptions").delete().eq("id", row.id);
        expired++;
      } else {
        console.warn("Web Push delivery failed:", status, error?.message || error);
      }
    }
  }));
  return { sent, expired };
}

async function displayName(admin: any, userId: string) {
  const { data } = await admin.from("profiles").select("display_name,username").eq("id", userId).maybeSingle();
  return data?.display_name || data?.username || "Chatly user";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const vapidPublic = requiredEnv("CHATLY_VAPID_PUBLIC_KEY");
    const vapidPrivate = requiredEnv("CHATLY_VAPID_PRIVATE_KEY");
    const vapidSubject = requiredEnv("CHATLY_VAPID_SUBJECT");
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

    const authorization = req.headers.get("Authorization") || "";
    if (!authorization.toLowerCase().startsWith("bearer ")) return json({ error: "Sign in to Chatly first." }, 401);
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authorization } },
    });
    const token = authorization.replace(/^Bearer\s+/i, "");
    const { data: authData, error: authError } = await userClient.auth.getUser(token);
    if (authError || !authData?.user) return json({ error: "Your Chatly session is not valid. Sign in again." }, 401);
    const currentUser = authData.user;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "subscribe") {
      const subscription = body?.subscription;
      const endpoint = String(subscription?.endpoint || "");
      const p256dh = String(subscription?.keys?.p256dh || "");
      const auth = String(subscription?.keys?.auth || "");
      if (!endpoint.startsWith("https://") || !p256dh || !auth) return json({ error: "The browser push subscription is incomplete." }, 400);
      const { error } = await admin.from("chat_push_subscriptions").upsert({
        user_id: currentUser.id, endpoint, p256dh, auth,
        user_agent: req.headers.get("user-agent") || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) throw error;
      return json({ ok: true, subscribed: true });
    }

    if (action === "unsubscribe") {
      const endpoint = String(body?.endpoint || "");
      if (!endpoint.startsWith("https://")) return json({ error: "A valid subscription endpoint is required." }, 400);
      const { error } = await admin.from("chat_push_subscriptions").delete().eq("user_id", currentUser.id).eq("endpoint", endpoint);
      if (error) throw error;
      return json({ ok: true, subscribed: false });
    }

    if (action === "notify-message") {
      const messageId = String(body?.messageId || "");
      const messageType = body?.messageType === "group" ? "group" : "direct";
      if (!messageId) return json({ error: "Message ID is required." }, 400);
      let recipients: string[] = [];
      let conversationId: string | null = null;
      let groupId: string | null = null;
      let message: any;
      if (messageType === "direct") {
        const result = await admin.from("direct_messages").select("id,conversation_id,sender_id,content,attachment_name,attachment_type").eq("id", messageId).maybeSingle();
        if (result.error) throw result.error;
        message = result.data;
        if (!message || message.sender_id !== currentUser.id) return json({ error: "Message not found or not owned by this account." }, 403);
        const c = await admin.from("conversations").select("id,user_one,user_two").eq("id", message.conversation_id).maybeSingle();
        if (c.error) throw c.error;
        if (!c.data || ![c.data.user_one, c.data.user_two].includes(currentUser.id)) return json({ error: "Conversation access denied." }, 403);
        conversationId = c.data.id;
        const recipient = c.data.user_one === currentUser.id ? c.data.user_two : c.data.user_one;
        const block = await admin.from("chat_user_blocks").select("blocker_id").or(`and(blocker_id.eq.${currentUser.id},blocked_id.eq.${recipient}),and(blocker_id.eq.${recipient},blocked_id.eq.${currentUser.id})`).limit(1);
        if (block.error) console.warn("Could not check block list before push:", block.error.message);
        if (!block.data?.length) recipients = [recipient];
      } else {
        const result = await admin.from("chat_group_messages").select("id,group_id,sender_id,content,attachment_name,attachment_type").eq("id", messageId).maybeSingle();
        if (result.error) throw result.error;
        message = result.data;
        if (!message || message.sender_id !== currentUser.id) return json({ error: "Message not found or not owned by this account." }, 403);
        groupId = message.group_id;
        const members = await admin.from("chat_group_members").select("user_id").eq("group_id", groupId);
        if (members.error) throw members.error;
        recipients = (members.data || []).map((row: any) => row.user_id).filter((id: string) => id !== currentUser.id);
      }
      const sender = await displayName(admin, currentUser.id);
      const bodyText = message.content?.trim() || (message.attachment_type?.startsWith("image/") ? "Sent a photo" : message.attachment_name ? `Sent ${message.attachment_name}` : "Sent an attachment");
      const payload = {
        title: messageType === "group" ? `${sender} · Chatly group` : sender,
        body: bodyText.slice(0, 180),
        kind: "message", tag: `chatly-message-${messageId}`,
        url: "./", conversationId, groupId,
      };
      const delivery = await sendToUsers(admin, recipients, payload);
      return json({ ok: true, ...delivery });
    }

    if (action === "notify-direct-call") {
      const callId = String(body?.callId || "");
      const conversationId = String(body?.conversationId || "");
      const recipientId = String(body?.recipientId || "");
      if (!callId || !conversationId || !recipientId) return json({ error: "Call details are incomplete." }, 400);
      const offer = await admin.from("call_signals").select("call_id,conversation_id,from_user,to_user,signal_type").eq("call_id", callId).eq("conversation_id", conversationId).eq("from_user", currentUser.id).eq("to_user", recipientId).eq("signal_type", "offer").limit(1).maybeSingle();
      if (offer.error) throw offer.error;
      if (!offer.data) return json({ error: "No matching outgoing call offer was found." }, 403);
      const conversation = await admin.from("conversations").select("user_one,user_two").eq("id", conversationId).maybeSingle();
      if (conversation.error) throw conversation.error;
      if (!conversation.data || ![conversation.data.user_one, conversation.data.user_two].includes(currentUser.id) || ![conversation.data.user_one, conversation.data.user_two].includes(recipientId)) return json({ error: "Call recipient is not in this conversation." }, 403);
      const block = await admin.from("chat_user_blocks").select("blocker_id").or(`and(blocker_id.eq.${currentUser.id},blocked_id.eq.${recipientId}),and(blocker_id.eq.${recipientId},blocked_id.eq.${currentUser.id})`).limit(1);
      if (!block.error && block.data?.length) return json({ ok: true, sent: 0, blocked: true });
      const caller = await displayName(admin, currentUser.id);
      const delivery = await sendToUsers(admin, [recipientId], {
        title: `Incoming Chatly call`, body: `${caller} is calling you.`, kind: "private-call",
        tag: `chatly-private-call-${callId}`, requireInteraction: true, url: "./", conversationId, callId,
      });
      return json({ ok: true, ...delivery });
    }

    if (action === "notify-group-call") {
      const callId = String(body?.callId || "");
      const groupId = String(body?.groupId || "");
      if (!callId || !groupId) return json({ error: "Group call details are incomplete." }, 400);
      const call = await admin.from("chat_group_calls").select("id,group_id,started_by,ended_at").eq("id", callId).eq("group_id", groupId).maybeSingle();
      if (call.error) throw call.error;
      if (!call.data || call.data.started_by !== currentUser.id || call.data.ended_at) return json({ error: "Group call is not owned by this account or has ended." }, 403);
      const members = await admin.from("chat_group_members").select("user_id").eq("group_id", groupId);
      if (members.error) throw members.error;
      const recipients = (members.data || []).map((row: any) => row.user_id).filter((id: string) => id !== currentUser.id);
      const { data: group } = await admin.from("chat_groups").select("name").eq("id", groupId).maybeSingle();
      const caller = await displayName(admin, currentUser.id);
      const delivery = await sendToUsers(admin, recipients, {
        title: `Incoming group call`, body: `${caller} started a call in ${group?.name || "your group"}.`,
        kind: "group-call", tag: `chatly-group-call-${callId}`, requireInteraction: true,
        url: "./", groupId, callId,
      });
      return json({ ok: true, ...delivery });
    }

    return json({ error: "Unknown Chatly push action." }, 400);
  } catch (error: any) {
    console.error("Chatly push function error:", error);
    return json({ error: error?.message || "Push notification service failed." }, 500);
  }
});
