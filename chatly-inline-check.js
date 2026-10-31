
const SUPABASE_URL="https://rfivnjnvliqpehdkqqap.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_ifYAMrdUhuyX-iOZULuP4w_nZx6oQtl";
const $=id=>document.getElementById(id);
let sb,user,profile,mode="login",activeConversation=null,activeContact=null,liveChannel=null,seen=new Set(),conversations=[];
let conversationLoadToken=0;
let blockedByMeIds=new Set(),blockedMeIds=new Set(),blockChannel=null,blockDataAvailable=false;
let messageSelectionMode=false;
const selectedMessages=new Map();
let callSignalChannel=null,callState=null;
let activeGroupChannel=null,groupMembershipChannel=null;
let groupCallState=null,groupCallSignalChannel=null,pendingGroupInvite=null;
let soundEnabled=localStorage.getItem("chatly-sounds")!=="off",audioContextInstance=null,ringtoneInterval=null,messageSoundChannel=null,pendingChatSounds=[],playedMessageSoundIds=new Set();
const MESSAGE_SOUND_OPTIONS={
  classic:"Classic", soft:"Soft", pop:"Pop", bell:"Bell", digital:"Digital", chime:"Chime"
};
const CALL_RINGTONE_OPTIONS={
  classic:"Classic ring", gentle:"Gentle", bright:"Bright", digital:"Digital ring", pulse:"Pulse", bell:"Bell ring"
};
let messageSoundChoice=localStorage.getItem("chatly-message-sound")||"classic";
let callRingtoneChoice=localStorage.getItem("chatly-call-ringtone")||"classic";
if(!MESSAGE_SOUND_OPTIONS[messageSoundChoice])messageSoundChoice="classic";
if(!CALL_RINGTONE_OPTIONS[callRingtoneChoice])callRingtoneChoice="classic";
const nickKey="chatly-v2-nicknames";
// Public VAPID key is safe to ship in the website. The matching private key
// stays only in Supabase Edge Function Secrets.
const CHATLY_VAPID_PUBLIC_KEY="BCxKKuhEQsjUZc68-xF2mKyWES7gG-K5eWKk3c0lTsBN92oaRpiC6r4AemI8iQLBJoL731NxAdD09xFmthKuDqw";
let chatlyServiceWorkerRegistration=null,chatlyServiceWorkerPromise=null;
const handledDirectOfferIds=new Set(),handledGroupInviteIds=new Set();
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function initials(s="U"){return (s.trim()[0]||"U").toUpperCase();}
function setAvatar(el,url,name){el.innerHTML=url?`<img src="${esc(url)}" alt="">`:esc(initials(name));}
function nickname(id,fallback){try{return JSON.parse(localStorage.getItem(nickKey)||"{}")[id]||fallback}catch{return fallback}}
function saveNickname(id,name){let all={};try{all=JSON.parse(localStorage.getItem(nickKey)||"{}")}catch{}all[id]=name;localStorage.setItem(nickKey,JSON.stringify(all));}
function toast(s){const el=$("chatStatus");if(el)el.textContent=s;}

function urlBase64ToUint8Array(base64String){
  const padding="=".repeat((4-base64String.length%4)%4);
  const base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(base64);
  const output=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)output[i]=raw.charCodeAt(i);
  return output;
}
function chatlyIsAppleMobile(){
  return /iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
}
function chatlyIsStandalone(){
  return window.matchMedia?.("(display-mode: standalone)").matches||navigator.standalone===true;
}
async function getChatlyServiceWorker(){
  if(chatlyServiceWorkerRegistration)return chatlyServiceWorkerRegistration;
  if(chatlyServiceWorkerPromise)return await chatlyServiceWorkerPromise;
  if(!("serviceWorker" in navigator))throw new Error("This browser does not support service workers.");
  chatlyServiceWorkerPromise=navigator.serviceWorker.ready.then(reg=>{
    chatlyServiceWorkerRegistration=reg;return reg;
  });
  return await chatlyServiceWorkerPromise;
}
async function invokeChatlyPush(action,details={}){
  const {data,error}=await sb.functions.invoke("chatly-push",{body:{action,...details}});
  if(error)throw new Error(error.message||"Push notification request failed.");
  if(data?.error)throw new Error(data.error);
  return data||{};
}
async function getChatlyPushSubscription(){
  if(!("PushManager" in window)||!("Notification" in window))return null;
  const reg=await getChatlyServiceWorker();
  return await reg.pushManager.getSubscription();
}
async function enableChatlyPushNotifications(){
  const status=$("pushNotificationStatus"),button=$("pushNotificationsBtn");
  if(status)status.textContent="Setting up notifications…";
  if(!window.isSecureContext)throw new Error("Notifications require Chatly to be opened over HTTPS.");
  if(!( "Notification" in window)||!("PushManager" in window)||!("serviceWorker" in navigator)){
    throw new Error("This browser does not support web push notifications.");
  }
  if(chatlyIsAppleMobile()&&!chatlyIsStandalone()){
    throw new Error("On iPad or iPhone, first use Share → Add to Home Screen, then open Chatly from its Home Screen icon and enable notifications there.");
  }
  let permission=Notification.permission;
  if(permission==="default")permission=await Notification.requestPermission();
  if(permission!=="granted")throw new Error(permission==="denied"?"Notifications are blocked in your device settings. Enable notifications for Chatly there first.":"Notification permission was not granted.");
  const reg=await getChatlyServiceWorker();
  let subscription=await reg.pushManager.getSubscription();
  if(!subscription){
    subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(CHATLY_VAPID_PUBLIC_KEY)});
  }
  await invokeChatlyPush("subscribe",{subscription:subscription.toJSON()});
  if(status)status.textContent="Notifications are enabled on this device.";
  if(button)button.textContent="Turn off notifications";
  return true;
}
async function disableChatlyPushNotifications(){
  const status=$("pushNotificationStatus"),button=$("pushNotificationsBtn");
  if(status)status.textContent="Turning notifications off…";
  const subscription=await getChatlyPushSubscription();
  if(subscription){
    await invokeChatlyPush("unsubscribe",{endpoint:subscription.endpoint});
    await subscription.unsubscribe();
  }
  if(status)status.textContent="Notifications are off on this device.";
  if(button)button.textContent="Enable notifications";
}
async function refreshPushSettingsUI(){
  const status=$("pushNotificationStatus"),button=$("pushNotificationsBtn");
  if(!status||!button)return;
  try{
    if(!("Notification" in window)||!("PushManager" in window)){
      status.textContent="This browser does not support push notifications.";button.disabled=true;return;
    }
    if(chatlyIsAppleMobile()&&!chatlyIsStandalone()){
      status.textContent="On iPad/iPhone, add Chatly to your Home Screen and open that app before enabling notifications.";
    }else if(Notification.permission==="denied"){
      status.textContent="Notifications are blocked in device settings.";
    }
    const subscription=await getChatlyPushSubscription();
    const enabled=!!subscription;
    if(enabled){
      // Re-sync the existing browser subscription with the signed-in account.
      await invokeChatlyPush("subscribe",{subscription:subscription.toJSON()});
      status.textContent="Notifications are enabled on this device.";
    }else if(Notification.permission!="denied"&&!(chatlyIsAppleMobile()&&!chatlyIsStandalone())){
      status.textContent="Enable alerts for new messages and incoming calls.";
    }
    button.disabled=false;button.textContent=enabled?"Turn off notifications":"Enable notifications";
    button.dataset.enabled=String(enabled);
  }catch(error){status.textContent=error.message||"Notification setup is unavailable.";button.disabled=false;button.textContent="Enable notifications";}
}
async function notifyChatlyPush(action,details){
  try{await invokeChatlyPush(action,details);}
  catch(error){console.warn("Chatly push notification could not be sent:",error.message||error);}
}

function getChatAudioContext(){
  const AudioCtx=window.AudioContext||window.webkitAudioContext;
  if(!AudioCtx)return null;
  if(!audioContextInstance||audioContextInstance.state==="closed"){
    audioContextInstance=new AudioCtx({latencyHint:"interactive"});
  }
  return audioContextInstance;
}
async function unlockChatAudio(){
  const ctx=getChatAudioContext();
  if(!ctx)return false;
  try{
    if(ctx.state!=="running")await ctx.resume();
  }catch(error){
    console.warn("Chatly audio could not be unlocked:",error);
  }
  if(ctx.state==="running"){
    const queued=pendingChatSounds.splice(0);
    for(const item of queued){
      if(Date.now()-item.at<12000)playChatSoundNow(ctx,item.kind);
    }
    return true;
  }
  return false;
}
function scheduleChatTone(ctx,frequency,start,duration,volume=0.055){
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type="sine";
  osc.frequency.setValueAtTime(frequency,start);
  gain.gain.setValueAtTime(0.0001,start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002,volume),start+0.018);
  gain.gain.setValueAtTime(Math.max(0.0002,volume),start+Math.max(0.02,duration-0.035));
  gain.gain.exponentialRampToValueAtTime(0.0001,start+duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start+duration+0.02);
}
function playSoundSequence(ctx,sequence,baseTime,volumeScale=1){
  for(const tone of sequence){
    const [frequency,offset,duration,volume=0.055,wave="sine"] = tone;
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=wave;
    osc.frequency.setValueAtTime(frequency,baseTime+offset);
    gain.gain.setValueAtTime(0.0001,baseTime+offset);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002,volume*volumeScale),baseTime+offset+0.018);
    gain.gain.setValueAtTime(Math.max(0.0002,volume*volumeScale),baseTime+offset+Math.max(0.025,duration-0.035));
    gain.gain.exponentialRampToValueAtTime(0.0001,baseTime+offset+duration);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(baseTime+offset);osc.stop(baseTime+offset+duration+0.02);
  }
}
function getMessageSoundSequence(choice){
  const presets={
    classic:[[740,0,.11,.055],[988,.13,.15,.055]],
    soft:[[587,0,.13,.035],[784,.16,.18,.032]],
    pop:[[520,0,.075,.05,"triangle"],[880,.085,.11,.045,"sine"]],
    bell:[[1046,0,.24,.05],[1318,.12,.28,.04]],
    digital:[[660,0,.075,.045,"square"],[880,.09,.075,.04,"square"],[1046,.18,.12,.04,"square"]],
    chime:[[784,0,.18,.045],[1046,.14,.23,.04],[1318,.32,.28,.035]]
  };
  return presets[choice]||presets.classic;
}
function getCallRingtoneSequence(choice,kind){
  const presets={
    classic:[[659,0,.28,.06],[784,.33,.28,.06],[988,.66,.24,.05]],
    gentle:[[523,0,.36,.045],[659,.43,.36,.045],[784,.86,.42,.04]],
    bright:[[880,0,.22,.055],[1175,.25,.22,.052],[988,.5,.28,.05]],
    digital:[[440,0,.16,.05,"square"],[660,.2,.16,.05,"square"],[880,.4,.26,.045,"square"]],
    pulse:[[554,0,.19,.055],[554,.28,.19,.055],[740,.64,.3,.05]],
    bell:[[988,0,.34,.05],[1318,.38,.4,.045],[1568,.82,.44,.04]]
  };
  const selected=presets[choice]||presets.classic;
  if(kind==="outgoing")return selected.map((tone,index)=>[tone[0]*0.84,index*0.42,0.28,tone[3]||0.05,tone[4]||"sine"]);
  return selected;
}
function playChatSoundNow(ctx,kind,forcedChoice=null){
  if(!ctx||ctx.state!=="running")return false;
  const now=ctx.currentTime+0.025;
  if(kind==="message")playSoundSequence(ctx,getMessageSoundSequence(forcedChoice||messageSoundChoice),now);
  else if(kind==="incoming"||kind==="outgoing")playSoundSequence(ctx,getCallRingtoneSequence(forcedChoice||callRingtoneChoice,kind),now);
  return true;
}
function playChatSound(kind){
  if(!soundEnabled)return false;
  const ctx=audioContextInstance;
  if(ctx&&ctx.state==="running")return playChatSoundNow(ctx,kind);
  // Browsers require a user gesture before first playback. Keep only a few
  // recent notifications; they play after the user unlocks sound in Chatly.
  if(!pendingChatSounds.some(item=>item.kind===kind)){
    pendingChatSounds.push({kind,at:Date.now()});
    if(pendingChatSounds.length>3)pendingChatSounds.shift();
  }
  if(ctx&&ctx.state==="suspended"){
    ctx.resume().then(()=>{
      if(ctx.state==="running"){
        const queued=pendingChatSounds.splice(0);
        for(const item of queued){
          if(Date.now()-item.at<12000)playChatSoundNow(ctx,item.kind);
        }
      }
    }).catch(()=>{});
  }
  return false;
}
function stopCallRingtone(){
  if(ringtoneInterval){clearInterval(ringtoneInterval);ringtoneInterval=null;}
}
function startCallRingtone(kind){
  stopCallRingtone();
  playChatSound(kind);
  ringtoneInterval=setInterval(()=>playChatSound(kind),kind==="incoming"?1900:2200);
}
async function unlockChatAudioFromGesture(){
  if(soundEnabled)await unlockChatAudio();
}
["pointerdown","touchend","keydown"].forEach(type=>{
  document.addEventListener(type,unlockChatAudioFromGesture,{capture:true,passive:true});
});
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden&&soundEnabled&&audioContextInstance?.state==="suspended"){
    // The next tap resumes audio if the browser suspended it in the background.
    pendingChatSounds.length=Math.min(pendingChatSounds.length,2);
  }
});
function messagePreview(message){
  if(!message)return "Start a conversation";
  if(message.content)return message.content;
  const type=message.attachment_type||"";
  if(type.startsWith("image/"))return "📷 Photo";
  if(type.startsWith("video/"))return "🎥 Video";
  if(type.startsWith("audio/"))return "🎵 Audio";
  return "📎 "+(message.attachment_name||"File");
}

function messagePreview(message){
  if(!message)return "Start a conversation";
  if(message.content)return message.content;
  const type=message.attachment_type||"";
  if(type.startsWith("image/"))return "📷 Photo";
  if(type.startsWith("video/"))return "🎥 Video";
  if(type.startsWith("audio/"))return "🎵 Audio";
  return "📎 "+(message.attachment_name||"File");
}

function callDisplayName(id){
  const conversation=conversations.find(c=>c.otherId===id);
  if(conversation)return nickname(id,displayName(conversation.person));
  return "Chatly user";
}
function setCallStatus(message){$("callStatus").textContent=message||"";}
function setCallPhase(phase){
  if(!callState)return;
  callState.phase=phase;
  if(phase!=="incoming"&&phase!=="outgoing")stopCallRingtone();
  $("callOverlay").classList.remove("hidden");
  $("callIncomingActions").classList.toggle("hidden",phase!=="incoming");
  $("callOutgoingActions").classList.toggle("hidden",phase!=="outgoing");
  $("callActiveActions").classList.toggle("hidden",phase!=="connecting"&&phase!=="connected");
  $("callEndedActions").classList.toggle("hidden",phase!=="ended");
  $("callPeerName").textContent=callState.peerName||"Chatly user";
  $("callPeerLarge").textContent=callState.peerName||"Chatly user";
  setAvatar($("callAvatar"),callState.peerAvatarUrl,callState.peerName||"U");
  $("callPlaceholder").classList.toggle("hidden",!!callState.remoteVideoReady&&!callState.remoteCameraOff);
  const sharingScreen=!!callState.screenStream;
  $("localVideo").classList.toggle("hidden",!callState.localStream||(callState.localCameraOff&&!sharingScreen));
  $("localCameraOff").classList.toggle("visible",!!callState.localCameraOff&&!!callState.localStream&&!sharingScreen);
  setAvatar($("localCameraAvatar"),profile?.avatar_url,profile?.display_name||profile?.username||"You");
}
function showCallEnded(message){
  if(!callState)return;
  stopCallRingtone();
  closeInCallChat(callState);
  resetInCallChatUI("direct");
  if(callState.ringTimer)clearTimeout(callState.ringTimer);
  if(callState.disconnectTimer)clearTimeout(callState.disconnectTimer);
  stopCallMedia(callState);
  callState.phase="ended";
  $("callOverlay").classList.remove("hidden");
  $("callIncomingActions").classList.add("hidden");
  $("callOutgoingActions").classList.add("hidden");
  $("callActiveActions").classList.add("hidden");
  $("callEndedActions").classList.remove("hidden");
  $("callStatus").textContent=message;
  $("localVideo").classList.add("hidden");
  $("remoteVideo").classList.add("hidden");
  $("callPlaceholder").classList.remove("hidden");
  $("callPlaceholderSub").textContent=message;
}
function stopCallMedia(call){
  if(!call)return;
  try{call.pc?.close()}catch{}
  call.pc=null;
  if(call.screenStream)call.screenStream.getTracks().forEach(track=>{track.onended=null;track.stop();});
  call.screenStream=null;
  if(call.localStream)call.localStream.getTracks().forEach(track=>track.stop());
  if(call.remoteStream)call.remoteStream.getTracks().forEach(track=>track.stop());
  $("localVideo").srcObject=null;
  $("remoteVideo").srcObject=null;
  $("localVideo").classList.add("hidden");
  $("localCameraOff").classList.remove("visible");
  $("remoteVideo").classList.add("hidden");
}
async function sendCallSignal(type,call,payload={}){
  if(!sb||!user||!call)throw new Error("Chatly is not connected.");
  if(call.peerUserId&&isBlockedBetween(call.peerUserId))throw new Error("Private calls are unavailable because one of you has blocked the other.");
  const {error}=await sb.from("call_signals").insert({
    conversation_id:call.conversationId,
    call_id:call.id,
    from_user:user.id,
    to_user:call.peerUserId,
    signal_type:type,
    payload
  });
  if(error)throw error;
  if(type==="offer")notifyChatlyPush("notify-direct-call",{callId:call.id,conversationId:call.conversationId,recipientId:call.peerUserId});
}
function callChatElements(kind){
  return kind==="group"?{
    panel:$("groupCallChatPanel"),list:$("groupCallChatMessages"),status:$("groupCallChatStatus"),form:$("groupCallChatForm"),input:$("groupCallChatInput"),toggle:$("groupCallChatToggle")
  }:{
    panel:$("privateCallChatPanel"),list:$("privateCallChatMessages"),status:$("privateCallChatStatus"),form:$("privateCallChatForm"),input:$("privateCallChatInput"),toggle:$("callChatToggle")
  };
}
function appendInCallChatMessage(kind,state,row){
  if(!row||!state)return;
  state.chatMessageIds=state.chatMessageIds||new Set();
  if(state.chatMessageIds.has(row.id))return;
  state.chatMessageIds.add(row.id);
  const ui=callChatElements(kind);if(!ui.list)return;
  const wrap=document.createElement("div");wrap.className="call-chat-message"+(row.sender_id===user?.id?" mine":"");
  const meta=document.createElement("div");meta.className="call-chat-message-meta";
  let sender="Chatly user";
  if(row.sender_id===user?.id)sender="You";
  else if(kind==="group")sender=groupMemberDisplay(state.group,row.sender_id);
  else sender=state.peerName||"Chatly user";
  const name=document.createElement("strong");name.textContent=sender;
  const time=document.createElement("time");time.textContent=row.created_at?new Date(row.created_at).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}):"";
  meta.append(name,time);
  const bubble=document.createElement("div");bubble.className="call-chat-message-bubble";bubble.textContent=row.content||"";
  wrap.dataset.messageId=row.id;wrap.append(meta,bubble);ui.list.appendChild(wrap);ui.list.scrollTop=ui.list.scrollHeight;
}
async function setupInCallChat(kind,state){
  if(!state||state.chatChannel||!sb||!user)return;
  const ui=callChatElements(kind);if(!ui.panel||!ui.list)return;
  state.chatMessageIds=new Set();
  ui.list.innerHTML="";ui.status.textContent="Connecting chat…";
  const channel=sb.channel("chatly-call-chat-"+state.id+"-"+user.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_call_messages",filter:"call_id=eq."+state.id},payload=>{
      if((kind==="group"?groupCallState:callState)?.id!==state.id)return;
      appendInCallChatMessage(kind,state,payload.new);
    })
    .subscribe(status=>{
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")ui.status.textContent="Chat connection unavailable";
      else if(status==="SUBSCRIBED")ui.status.textContent="Connected";
    });
  state.chatChannel=channel;
  const {data,error}=await sb.from("chat_call_messages").select("id,call_id,call_type,conversation_id,group_id,sender_id,content,created_at")
    .eq("call_id",state.id).order("created_at",{ascending:true}).limit(100);
  if((kind==="group"?groupCallState:callState)?.id!==state.id)return;
  if(error){ui.status.textContent="Chat unavailable — install the in-call chat SQL update";console.warn("Could not load in-call messages:",error.message);return;}
  for(const row of data||[])appendInCallChatMessage(kind,state,row);
  state.chatReady=true;
  ui.status.textContent="Connected";
}
async function sendInCallChatMessage(kind){
  const state=kind==="group"?groupCallState:callState;
  const ui=callChatElements(kind);if(!state||!ui.input)return;
  const content=ui.input.value.trim();if(!content)return;
  if(!state.chatReady){ui.status.textContent="Call chat is not ready yet";return;}
  ui.input.disabled=true;
  try{
    const row={call_id:state.id,call_type:kind,conversation_id:kind==="direct"?state.conversationId:null,group_id:kind==="group"?state.groupId:null,sender_id:user.id,content};
    const {data,error}=await sb.from("chat_call_messages").insert(row).select("id,call_id,call_type,conversation_id,group_id,sender_id,content,created_at").single();
    if(error)throw error;
    appendInCallChatMessage(kind,state,data);ui.input.value="";ui.status.textContent="Connected";
  }catch(error){ui.status.textContent="Message not sent";alert("Could not send call message: "+(error.message||error)+". Check the in-call chat SQL migration.");}
  finally{ui.input.disabled=false;ui.input.focus();}
}
function toggleInCallChat(kind){
  const ui=callChatElements(kind);if(!ui.panel)return;
  const opening=ui.panel.classList.contains("hidden");ui.panel.classList.toggle("hidden",!opening);
  if(ui.toggle){ui.toggle.setAttribute("aria-expanded",String(opening));ui.toggle.classList.toggle("chat-active",opening);ui.toggle.textContent=opening?"Hide chat":"Chat";}
  if(opening)ui.input?.focus();
}
async function closeInCallChat(state){
  if(!state?.chatChannel)return;
  const channel=state.chatChannel;state.chatChannel=null;state.chatReady=false;
  try{await sb.removeChannel(channel);}catch(error){console.warn("Could not close call chat channel:",error);}
}
function resetInCallChatUI(kind){
  const ui=callChatElements(kind);if(!ui.panel)return;
  ui.panel.classList.add("hidden");ui.list.innerHTML="";ui.status.textContent="Connecting chat…";
  if(ui.toggle){ui.toggle.setAttribute("aria-expanded","false");ui.toggle.classList.remove("chat-active");ui.toggle.textContent="Chat";}
}

async function finishCall(sendSignal=false,signalType="hangup"){
  const call=callState;
  if(!call)return;
  callState=null;
  stopCallRingtone();
  await closeInCallChat(call);
  resetInCallChatUI("direct");
  if(call.ringTimer)clearTimeout(call.ringTimer);
  if(call.disconnectTimer)clearTimeout(call.disconnectTimer);
  stopCallMedia(call);
  $("callOverlay").classList.add("hidden");
  $("shareScreenCall").textContent="Share screen";$("shareScreenCall").classList.remove("share-active");
  if(sendSignal){
    try{await sendCallSignal(signalType,call,{})}
    catch(error){console.warn("Could not send call ending signal:",error)}
  }
}
function showCallNotice(message){
  if(!callState)return;
  showCallEnded(message);
}
async function getCallMedia(call){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    throw new Error("Camera and microphone require a secure HTTPS page and a supported browser.");
  }
  let stream;
  try{
    stream=await navigator.mediaDevices.getUserMedia({
      audio:true,
      video:{width:{ideal:1280},height:{ideal:720},facingMode:"user"}
    });
  }catch(error){
    if(error.name==="NotAllowedError"||error.name==="PermissionDeniedError"){
      throw new Error("Camera or microphone access was blocked. Allow both permissions in your browser and try again.");
    }
    if(error.name==="NotFoundError"||error.name==="DevicesNotFoundError"){
      throw new Error("No camera or microphone was found on this device.");
    }
    throw new Error(error.message||"Could not access the camera and microphone.");
  }
  call.localStream=stream;
  call.cameraFacing=stream.getVideoTracks?.()[0]?.getSettings?.().facingMode||"user";
  $("localVideo").srcObject=stream;
  $("localVideo").classList.remove("hidden");
  $("localVideo").muted=true;
  call.localCameraOff=false;
  $("localCameraOff").classList.remove("visible");
  setAvatar($("localCameraAvatar"),profile?.avatar_url,profile?.display_name||profile?.username||"You");
  $("localVideo").play().catch(()=>{});
  refreshCallControls();
  return stream;
}
let chatlyTurnCache=null;
let chatlyTurnCacheUntil=0;
let chatlyTurnPromise=null;
async function loadChatlyTurnIceServers(force=false){
  if(!force&&chatlyTurnCache&&Date.now()<chatlyTurnCacheUntil)return chatlyTurnCache;
  if(chatlyTurnPromise)return chatlyTurnPromise;
  if(!sb||!user)throw new Error("Sign in before starting a call.");
  chatlyTurnPromise=(async()=>{
    const {data,error}=await sb.functions.invoke("chatly-turn-config",{body:{}});
    if(error){
      throw new Error("Chatly couldn't load the TURN relay settings. Make sure the chatly-turn-config Supabase Edge Function is deployed and its TURN secrets are set. Details: "+(error.message||"request failed"));
    }
    const servers=Array.isArray(data?.iceServers)?data.iceServers:[];
    const usable=servers.filter(server=>{
      const urls=Array.isArray(server?.urls)?server.urls:[server?.urls];
      return urls.some(url=>typeof url==="string"&&/^turns?:/i.test(url));
    });
    if(!usable.length){
      throw new Error(data?.error||"TURN relay isn't configured yet. Add your TURN server URLs, username, and credential to Supabase Edge Function secrets, then retry.");
    }
    chatlyTurnCache=usable;
    // Keep returned credentials in memory only; don't write relay credentials to localStorage.
    chatlyTurnCacheUntil=Date.now()+Math.min(Number(data?.cacheSeconds)||240,300)*1000;
    return chatlyTurnCache;
  })();
  try{return await chatlyTurnPromise;}
  finally{chatlyTurnPromise=null;}
}
async function createCallPeerConnection(call){
  setCallStatus("Loading secure relay settings…");
  const iceServers=await loadChatlyTurnIceServers();
  if(callState?.id!==call.id)throw new Error("This call has already ended.");
  const pc=new RTCPeerConnection({
    iceServers,
    iceCandidatePoolSize:2
  });
  call.pc=pc;
  call.remoteStream=new MediaStream();
  $("remoteVideo").srcObject=call.remoteStream;
  $("remoteVideo").classList.remove("hidden");
  $("callPlaceholder").classList.remove("hidden");
  pc.ontrack=event=>{
    const tracks=event.streams?.[0]?.getTracks()||[event.track];
    for(const track of tracks){
      if(!call.remoteStream.getTracks().some(existing=>existing.id===track.id)){
        call.remoteStream.addTrack(track);
      }
      if(track.kind==="video"){
        track.onunmute=()=>{
          call.remoteVideoReady=true;
          if(!call.remoteCameraOff)$("callPlaceholder").classList.add("hidden");
        };
        track.onmute=()=>{
          call.remoteVideoReady=false;
          $("callPlaceholder").classList.remove("hidden");
          $("callPlaceholderSub").textContent="Their camera is off";
          setAvatar($("callAvatar"),call.peerAvatarUrl,call.peerName);
        };
        if(!track.muted){
          call.remoteVideoReady=true;
          if(!call.remoteCameraOff)$("callPlaceholder").classList.add("hidden");
        }
      }
    }
    $("remoteVideo").srcObject=call.remoteStream;
    $("remoteVideo").play().catch(()=>{});
  };
  pc.onicecandidate=event=>{
    if(!event.candidate||callState?.id!==call.id)return;
    const candidate=event.candidate.toJSON?event.candidate.toJSON():event.candidate;
    if(call.role==="caller"&&!call.offerSent){
      call.localCandidates.push(candidate);
      return;
    }
    sendCallSignal("ice",call,{candidate}).catch(error=>console.warn("ICE signal failed:",error));
  };
  pc.onconnectionstatechange=()=>{
    if(callState?.id!==call.id)return;
    if(pc.connectionState==="connected"){
      if(call.disconnectTimer)clearTimeout(call.disconnectTimer);
      call.disconnectTimer=null;
      setCallPhase("connected");
      setCallStatus("Connected");
      setupInCallChat("direct",call).catch(error=>console.warn("Could not start private call chat:",error));
    }else if(pc.connectionState==="connecting"){
      setCallPhase("connecting");
      setCallStatus("Connecting video…");
    }else if(pc.connectionState==="disconnected"){
      setCallStatus("Reconnecting…");
      if(call.disconnectTimer)clearTimeout(call.disconnectTimer);
      call.disconnectTimer=setTimeout(()=>{
        if(callState?.id===call.id&&call.pc?.connectionState==="disconnected"){
          showCallNotice("Connection lost.");
        }
      },10000);
    }else if(pc.connectionState==="failed"){
      if(!call.failureShown){
        call.failureShown=true;
        showCallNotice("Couldn't establish the call. Check that your TURN server settings are correct and that the network allows TURN over TLS/TCP port 443. Some school or public networks may block relayed calls too.");
      }
    }
  };
  pc.oniceconnectionstatechange=()=>{
    if(callState?.id!==call.id)return;
    const state=pc.iceConnectionState;
    if(state==="checking"){
      setCallStatus("Checking the secure relay connection…");
    }else if(state==="connected"||state==="completed"){
      if(call.disconnectTimer)clearTimeout(call.disconnectTimer);
      call.disconnectTimer=null;
      setCallStatus("Secure call connection established.");
    }else if(state==="disconnected"){
      setCallStatus("Direct connection interrupted. Trying to recover…");
    }else if(state==="failed"&&!call.failureShown){
      call.failureShown=true;
      showCallNotice("Couldn't establish the call. Check that your TURN server settings are correct and that the network allows TURN over TLS/TCP port 443. Some school or public networks may block relayed calls too.");
    }
  };
  pc.onicecandidateerror=event=>{
    console.warn("Chatly TURN/ICE candidate error:",{
      errorCode:event.errorCode,
      errorText:event.errorText,
      url:event.url
    });
  };
  return pc;
}
async function flushRemoteCandidates(call){
  if(!call.pc||!call.remoteDescriptionSet)return;
  const queued=call.pendingCandidates.splice(0);
  for(const candidate of queued){
    try{await call.pc.addIceCandidate(new RTCIceCandidate(candidate))}
    catch(error){console.warn("Could not add a call network candidate:",error)}
  }
}
async function receiveCallCandidate(call,candidate){
  if(!candidate)return;
  if(!call.pc||!call.remoteDescriptionSet){
    call.pendingCandidates.push(candidate);
    return;
  }
  try{await call.pc.addIceCandidate(new RTCIceCandidate(candidate))}
  catch(error){console.warn("Could not add a call network candidate:",error)}
}
async function startVideoCall(){
  if(!activeConversation)return;
  if(callState||groupCallState){alert("You are already in a call.");return;}
  const conversation=conversations.find(c=>c.id===activeConversation);
  if(!conversation){alert("Open a conversation before starting a video call.");return;}
  if(conversation.isGroup===false&&isBlockedBetween(conversation.otherId)){alert("Private calls are unavailable because one of you has blocked the other.");return;}
  const call={
    id:crypto.randomUUID(),
    conversationId:conversation.id,
    peerUserId:conversation.otherId,
    peerName:nickname(conversation.otherId,displayName(conversation.person)),
    peerAvatarUrl:conversation.person?.avatar_url||"",
    localCameraOff:false,
    remoteCameraOff:false,
    cameraFacing:"user",
    role:"caller",
    phase:"outgoing",
    localStream:null,
    remoteStream:null,
    remoteDescriptionSet:false,
    pendingCandidates:[],
    localCandidates:[],
    offerSent:false,
    remoteVideoReady:false
  };
  callState=call;
  $("callPlaceholderSub").textContent="Calling…";
  setAvatar($("callAvatar"),call.peerAvatarUrl,call.peerName);
  $("remoteVideo").classList.add("hidden");
  $("localVideo").classList.add("hidden");
  setCallPhase("outgoing");
  setCallStatus("Allow camera and microphone access to start.");
  try{
    const stream=await getCallMedia(call);
    if(callState?.id!==call.id)return;
    const pc=await createCallPeerConnection(call);
    stream.getTracks().forEach(track=>pc.addTrack(track,stream));
    call.videoSender=pc.getSenders().find(sender=>sender.track?.kind==="video")||null;
    const offer=await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendCallSignal("offer",call,{description:pc.localDescription});
    call.offerSent=true;
    const buffered=call.localCandidates.splice(0);
    for(const candidate of buffered){
      await sendCallSignal("ice",call,{candidate});
    }
    if(callState?.id!==call.id)return;
    setCallStatus("Ringing… waiting for them to answer.");
    startCallRingtone("outgoing");
    call.ringTimer=setTimeout(()=>{
      if(callState?.id===call.id&&callState.phase==="outgoing"){
        sendCallSignal("cancel",call,{}).catch(()=>{});
        showCallNotice("No answer.");
      }
    },45000);
  }catch(error){
    if(callState?.id===call.id)await finishCall(false);
    alert("Could not start the video call: "+(error.message||error));
  }
}
async function acceptIncomingCall(){
  const call=callState;
  if(!call||call.phase!=="incoming")return;
  if(call.ringTimer)clearTimeout(call.ringTimer);
  stopCallRingtone();
  setCallPhase("connecting");
  setCallStatus("Connecting…");
  try{
    const stream=await getCallMedia(call);
    if(callState?.id!==call.id)return;
    const pc=await createCallPeerConnection(call);
    stream.getTracks().forEach(track=>pc.addTrack(track,stream));
    call.videoSender=pc.getSenders().find(sender=>sender.track?.kind==="video")||null;
    if(!call.offerDescription)throw new Error("The caller's offer was missing. Ask them to call again.");
    await pc.setRemoteDescription(new RTCSessionDescription(call.offerDescription));
    call.remoteDescriptionSet=true;
    await flushRemoteCandidates(call);
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sendCallSignal("answer",call,{description:pc.localDescription});
    setCallPhase("connecting");
    setCallStatus("Connecting video…");
  }catch(error){
    try{await sendCallSignal("reject",call,{reason:error.message||"Could not accept"})}catch{}
    if(callState?.id===call.id)await finishCall(false);
    alert("Could not accept the video call: "+(error.message||error));
  }
}
async function rejectIncomingCall(){
  const call=callState;
  if(!call||call.phase!=="incoming")return;
  await finishCall(true,"reject");
}
async function acquireAlternateCameraTrack(stream,currentFacing){
  if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera switching is not supported in this browser.");
  const oldTrack=stream?.getVideoTracks?.()[0];if(!oldTrack)throw new Error("No camera is available to switch.");
  const nextFacing=currentFacing==="environment"?"user":"environment";
  let video={facingMode:{ideal:nextFacing},width:{ideal:1280},height:{ideal:720}};
  try{
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==="videoinput");
    const currentId=oldTrack.getSettings?.().deviceId;
    if(devices.length>1&&currentId){
      const currentIndex=devices.findIndex(device=>device.deviceId===currentId);
      const nextDevice=devices[(currentIndex>=0?currentIndex+1:0)%devices.length];
      if(nextDevice?.deviceId&&nextDevice.deviceId!==currentId)video={deviceId:{exact:nextDevice.deviceId},width:{ideal:1280},height:{ideal:720}};
    }
  }catch(error){console.info("Camera enumeration unavailable; using facingMode:",error);}
  const temporary=await navigator.mediaDevices.getUserMedia({audio:false,video});
  const nextTrack=temporary.getVideoTracks()[0];
  if(!nextTrack){temporary.getTracks().forEach(track=>track.stop());throw new Error("The browser did not provide another camera.");}
  nextTrack.enabled=oldTrack.enabled;
  return {oldTrack,nextTrack,nextFacing:nextTrack.getSettings?.().facingMode||nextFacing,temporary};
}
async function flipPrivateCamera(){
  const call=callState;if(!call?.localStream)return;
  try{
    const {oldTrack,nextTrack,nextFacing}=await acquireAlternateCameraTrack(call.localStream,call.cameraFacing||"user");
    try{if(!call.screenStream&&call.videoSender)await call.videoSender.replaceTrack(nextTrack);}
    catch(error){nextTrack.stop();throw error;}
    call.localStream.removeTrack(oldTrack);call.localStream.addTrack(nextTrack);oldTrack.stop();
    call.cameraFacing=nextFacing;
    if(!call.screenStream){
      $("localVideo").srcObject=call.localStream;
      $("localVideo").classList.toggle("hidden",!nextTrack.enabled);
      $("localCameraOff").classList.toggle("visible",!nextTrack.enabled);
      $("localVideo").play().catch(()=>{});
    }
    call.localCameraOff=!nextTrack.enabled;refreshCallControls();
    if(!call.screenStream&&call.peerUserId)sendCallSignal("camera",call,{enabled:nextTrack.enabled,sharing:false}).catch(()=>{});
    setCallStatus("Camera switched.");
  }catch(error){alert("Could not flip the camera: "+(error.message||error));}
}

function getChatlyVideoSender(pc,preferred=null){
  if(preferred)return preferred;
  if(!pc)return null;
  return pc.getSenders?.().find(sender=>sender.track?.kind==="video")
    ||pc.getTransceivers?.().find(transceiver=>transceiver.receiver?.track?.kind==="video")?.sender
    ||null;
}
async function requestChatlyScreenCapture(){
  if(!window.isSecureContext)throw new Error("Screen sharing requires Chatly to be opened over HTTPS.");
  const mediaDevices=navigator.mediaDevices;
  const capture=mediaDevices?.getDisplayMedia?.bind(mediaDevices)
    ||navigator.getDisplayMedia?.bind(navigator);
  if(!capture){
    throw new Error("This browser does not provide screen sharing. Update your browser and try Chatly in Safari or a desktop browser that supports screen capture. Some iPad browser/PWA versions do not expose this feature.");
  }
  try{
    // The simple constraints are the most compatible across Chromium, Firefox and Safari.
    const displayStream=await capture({video:true,audio:false});
    const track=displayStream?.getVideoTracks?.()[0];
    if(!track){displayStream?.getTracks?.().forEach(item=>item.stop());throw new Error("The screen picker did not provide a video track.");}
    try{track.contentHint="detail";}catch{}
    return displayStream;
  }catch(error){
    if(error?.name==="AbortError")throw error;
    if(error?.name==="NotAllowedError"||error?.name==="PermissionDeniedError"){
      throw new Error("Screen sharing was cancelled or blocked. Tap Share screen again and choose a screen, window, or browser tab.");
    }
    if(error?.name==="InvalidStateError"){
      throw new Error("The browser needs Chatly to be the active page. Close other dialogs and tap Share screen again.");
    }
    if(error?.name==="NotReadableError"){
      throw new Error("The device could not start screen capture. Close another screen-recording session and try again.");
    }
    throw new Error(error?.message||"The browser could not start screen capture.");
  }
}

async function startPrivateScreenShare(){
  const call=callState;
  if(!call?.pc||!call.localStream){alert("Join the active call before sharing your screen.");return;}
  let displayStream=null;
  try{
    // getDisplayMedia must be called immediately from the user's button gesture.
    displayStream=await requestChatlyScreenCapture();
    if(callState?.id!==call.id){displayStream.getTracks().forEach(track=>track.stop());return;}
    const screenTrack=displayStream.getVideoTracks()[0];
    const sender=getChatlyVideoSender(call.pc,call.videoSender);
    if(!screenTrack||!sender){displayStream.getTracks().forEach(track=>track.stop());throw new Error("The call's video sender is not ready yet. Try again after the call connects.");}
    try{await sender.replaceTrack(screenTrack);}
    catch(error){displayStream.getTracks().forEach(track=>track.stop());throw new Error("Your browser couldn't switch the call from camera to screen. Try sharing a browser tab or lower-resolution screen, then try again. Details: "+(error.message||error));}
    call.videoSender=sender;call.screenStream=displayStream;call.screenTrack=screenTrack;
    const localVideo=$("localVideo");
    localVideo.srcObject=displayStream;localVideo.classList.remove("hidden");localVideo.muted=true;
    await localVideo.play().catch(()=>{});
    $("localCameraOff").classList.remove("visible");
    $("shareScreenCall").textContent="Stop sharing";$("shareScreenCall").classList.add("share-active");
    $("callStatus").textContent="You're sharing your screen.";
    if(call.peerUserId)sendCallSignal("camera",call,{enabled:true,sharing:true}).catch(error=>console.warn("Could not sync screen-share state:",error));
    screenTrack.onended=()=>{if(callState?.id===call.id)stopPrivateScreenShare();};
  }catch(error){
    displayStream?.getTracks?.().forEach(track=>{track.onended=null;track.stop();});
    if(error.name!=="AbortError")alert("Could not share your screen: "+(error.message||error));
  }
}
async function stopPrivateScreenShare(){
  const call=callState;if(!call?.screenStream)return;
  const display=call.screenStream,track=call.localStream?.getVideoTracks?.()[0];
  call.screenStream=null;call.screenTrack=null;
  const sender=getChatlyVideoSender(call.pc,call.videoSender);
  if(sender){
    try{await sender.replaceTrack(track||null);}
    catch(error){console.warn("Could not restore camera after screen share:",error);$("callStatus").textContent="Screen sharing stopped, but camera could not be restored. Toggle your camera off and on.";}
  }
  display.getTracks().forEach(item=>{item.onended=null;item.stop();});
  $("localVideo").srcObject=call.localStream;
  const cameraEnabled=!!track&&track.enabled;
  $("localVideo").classList.toggle("hidden",!cameraEnabled);
  $("localCameraOff").classList.toggle("visible",!cameraEnabled);
  $("shareScreenCall").textContent="Share screen";$("shareScreenCall").classList.remove("share-active");
  if(callState?.id===call.id){
    $("callStatus").textContent="Screen sharing stopped.";
    if(call.peerUserId)sendCallSignal("camera",call,{enabled:cameraEnabled,sharing:false}).catch(()=>{});
  }
}
async function handleCallSignal(change){
  const row=change?.new;
  if(!row||row.to_user!==user?.id||row.from_user===user?.id)return;
  if(row.signal_type==="offer"){
    const key=String(row.id||`${row.call_id}:${row.from_user}:${row.created_at||"offer"}`);
    if(handledDirectOfferIds.has(key))return;
    handledDirectOfferIds.add(key);if(handledDirectOfferIds.size>40)handledDirectOfferIds.clear();
  }
  if(isBlockedBetween(row.from_user)){console.info("Ignored a private call signal from a blocked account.");return;}
  const incomingPayload=row.payload||{};
  if(row.signal_type==="offer"){
    if(callState||groupCallState){
      const busyCall={id:row.call_id,conversationId:row.conversation_id,peerUserId:row.from_user};
      sendCallSignal("busy",busyCall,{}).catch(error=>console.warn(error));
      return;
    }
    const call={
      id:row.call_id,
      conversationId:row.conversation_id,
      peerUserId:row.from_user,
      peerName:callDisplayName(row.from_user),
      peerAvatarUrl:conversations.find(c=>c.otherId===row.from_user)?.person?.avatar_url||"",
      localCameraOff:false,
      remoteCameraOff:false,
      cameraFacing:"user",
      role:"callee",
      phase:"incoming",
      offerDescription:incomingPayload.description,
      localStream:null,
      remoteStream:null,
      remoteDescriptionSet:false,
      pendingCandidates:[],
      localCandidates:[],
      remoteVideoReady:false
    };
    callState=call;
    $("callPlaceholderSub").textContent="Incoming video call";
    setAvatar($("callAvatar"),call.peerAvatarUrl,call.peerName);
    $("remoteVideo").classList.add("hidden");
    $("localVideo").classList.add("hidden");
    setCallPhase("incoming");
    setCallStatus("Incoming video call");
    startCallRingtone("incoming");
    return;
  }
  if(!callState||callState.id!==row.call_id){
    return;
  }
  const call=callState;
  if(row.signal_type==="camera"){
    call.remoteCameraOff=!incomingPayload.enabled;
    call.remoteSharingScreen=!!incomingPayload.sharing;
    if(call.remoteSharingScreen)setCallStatus("The other person is sharing their screen.");
    else if(call.phase==="connected")setCallStatus("Connected");
    if(call.remoteCameraOff){
      call.remoteVideoReady=false;
      $("remoteVideo").classList.add("hidden");
      $("callPlaceholder").classList.remove("hidden");
      $("callPlaceholderSub").textContent="Their camera is off";
      setAvatar($("callAvatar"),call.peerAvatarUrl,call.peerName);
    }else{
      $("remoteVideo").classList.remove("hidden");
      $("callPlaceholderSub").textContent="Waiting for video…";
      if(call.remoteVideoReady)$("callPlaceholder").classList.add("hidden");
    }
  }else if(row.signal_type==="ice"){
    await receiveCallCandidate(call,incomingPayload.candidate);
  }else if(row.signal_type==="answer"&&call.role==="caller"){
    try{
      if(!call.pc||call.remoteDescriptionSet)return;
      await call.pc.setRemoteDescription(new RTCSessionDescription(incomingPayload.description));
      call.remoteDescriptionSet=true;
      await flushRemoteCandidates(call);
      if(call.ringTimer)clearTimeout(call.ringTimer);
      setCallPhase("connecting");
      setCallStatus("Connecting video…");
    }catch(error){
      showCallNotice("Could not connect the answer: "+error.message);
    }
  }else if(row.signal_type==="reject"){
    showCallNotice("The call was declined.");
  }else if(row.signal_type==="busy"){
    showCallNotice("They are already in another call.");
  }else if(row.signal_type==="cancel"){
    showCallNotice("The caller cancelled the call.");
  }else if(row.signal_type==="hangup"){
    showCallNotice("The other person ended the call.");
  }
}
async function checkPendingIncomingCalls(){
  if(!sb||!user)return;
  const cutoff=new Date(Date.now()-45000).toISOString();
  if(!callState&&!groupCallState){
    const {data:directRows,error:directError}=await sb.from("call_signals").select("*").eq("to_user",user.id).eq("signal_type","offer").gte("created_at",cutoff).order("created_at",{ascending:false}).limit(3);
    if(directError)console.warn("Could not check pending private call invitations:",directError.message);
    for(const row of directRows||[]){if(!callState&&!groupCallState)await handleCallSignal({new:row});}
  }
  if(!callState&&!groupCallState&&!pendingGroupInvite){
    const {data:groupRows,error:groupError}=await sb.from("chat_group_call_signals").select("*").eq("to_user",user.id).eq("signal_type","invite").gte("created_at",cutoff).order("created_at",{ascending:false}).limit(3);
    if(groupError)console.warn("Could not check pending group call invitations:",groupError.message);
    for(const row of groupRows||[]){if(!callState&&!groupCallState&&!pendingGroupInvite)await handleGroupCallSignal({new:row});}
  }
}
function subscribeToCallSignals(){
  if(!sb||!user||callSignalChannel)return;
  callSignalChannel=sb.channel("chatly-call-signals-"+user.id)
    .on("postgres_changes",{
      event:"INSERT",
      schema:"public",
      table:"call_signals",
      filter:"to_user=eq."+user.id
    },handleCallSignal)
    .subscribe(status=>{
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT"){
        console.warn("Chatly call signal subscription:",status);
      }
    });
}
function refreshCallControls(){
  const call=callState;
  if(!call)return;
  const audio=call.localStream?.getAudioTracks?.()[0]||null;
  const video=call.localStream?.getVideoTracks?.()[0]||null;
  for(const id of ["toggleMic","toggleMicRinging"]){
    const button=$(id);
    button.disabled=!audio;
    button.textContent=audio?.enabled?"Mute mic":"Unmute mic";
    button.setAttribute("aria-pressed",String(!!audio&&!audio.enabled));
  }
  for(const id of ["toggleCamera","toggleCameraRinging"]){
    const button=$(id);
    button.disabled=!video;
    button.textContent=video?.enabled?"Camera off":"Camera on";
    button.setAttribute("aria-pressed",String(!!video&&!video.enabled));
  }
}

function showError(s){$("authError").textContent=s||"";}
function setMode(next){mode=next;$("authTitle").textContent=mode==="login"?"Your conversations, together.":"Join Chatly."; $("authSubtitle").textContent=mode==="login"?"Sign in to your Chatly account.":"Create an account to start messaging."; $("username").classList.toggle("hidden",mode==="login");$("username").required=mode==="signup";$("authSubmit").textContent=mode==="login"?"Sign in":"Create account";$("switchText").textContent=mode==="login"?"New to Chatly?":"Already have an account?";$("authSwitch").textContent=mode==="login"?"Create an account":"Sign in";showError("");}
$("authSwitch").onclick=e=>{e.preventDefault();setMode(mode==="login"?"signup":"login")};
async function start(){sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);const {data:{session}}=await sb.auth.getSession();if(session)await enter(session.user);sb.auth.onAuthStateChange(async(event,session)=>{if(event==="SIGNED_IN"&&session&&!user)await enter(session.user);if(event==="SIGNED_OUT")location.reload()});}
$("authForm").onsubmit=async e=>{e.preventDefault();showError("");try{const email=$("email").value.trim(),password=$("password").value;if(mode==="signup"){const username=$("username").value.trim();if(!/^[a-zA-Z0-9_]{3,24}$/.test(username))throw Error("Username must be 3–24 letters, numbers, or underscores.");const {data,error}=await sb.auth.signUp({email,password,options:{data:{username}}});if(error)throw error;if(data.session)await enter(data.user);else showError("Check your email to confirm your account, then sign in.");}else{const {data,error}=await sb.auth.signInWithPassword({email,password});if(error)throw error;await enter(data.user)}}catch(err){showError(err.message||"Something went wrong.")}};
function isBlockedByMe(otherId){return !!otherId&&blockedByMeIds.has(otherId);}
function isBlockedByOther(otherId){return !!otherId&&blockedMeIds.has(otherId);}
function isBlockedBetween(otherId){return isBlockedByMe(otherId)||isBlockedByOther(otherId);}
async function refreshBlockedUsers(){
  if(!sb||!user)return false;
  const {data,error}=await sb.from("chat_user_blocks").select("blocker_id,blocked_id,created_at").or(`blocker_id.eq.${user.id},blocked_id.eq.${user.id}`);
  if(error){blockDataAvailable=false;console.warn("Chatly blocking is not installed yet:",error.message);return false;}
  const mine=new Set(),theirs=new Set();
  for(const row of data||[]){
    if(row.blocker_id===user.id)mine.add(row.blocked_id);
    if(row.blocked_id===user.id)theirs.add(row.blocker_id);
  }
  blockedByMeIds=mine;blockedMeIds=theirs;blockDataAvailable=true;
  updateDirectBlockUI();
  return true;
}
function updateDirectBlockUI(){
  const conversation=conversations.find(item=>item.id===activeConversation);
  const notice=$("blockedNotice");
  if(!notice)return;
  const isDirect=!!conversation&&!conversation.isGroup;
  notice.classList.add("hidden");
  if(!isDirect){
    ["messageInput","attachButton"].forEach(id=>{const el=$(id);if(el)el.disabled=false;});
    const send=$("messageForm")?.querySelector(".send");if(send)send.disabled=false;
    const call=$("videoCallBtn");if(call)call.disabled=false;
    return;
  }
  const id=conversation.otherId,byMe=isBlockedByMe(id),byOther=isBlockedByOther(id),blocked=byMe||byOther;
  if(byMe||byOther){
    notice.classList.remove("hidden");
    notice.textContent=byMe&&byOther?"You've both blocked each other. Private messages and calls are unavailable.":byMe?`You've blocked ${conversationTitle(conversation)}. They cannot send you private messages or call you.`:`${conversationTitle(conversation)} has blocked you. You cannot send private messages or call them.`;
  }
  ["messageInput","attachButton"].forEach(id=>{const el=$(id);if(el)el.disabled=blocked;});
  const send=$("messageForm")?.querySelector(".send");if(send)send.disabled=blocked;
  const call=$("videoCallBtn");if(call){call.disabled=blocked;call.title=blocked?"Private calls are unavailable while either person is blocked":"Start video call";}
  const input=$("messageInput");if(input)input.placeholder=blocked?"Private messaging unavailable":"iMessage";
}
async function toggleActiveContactBlock(){
  const conversation=conversations.find(item=>item.id===activeConversation);
  if(!conversation||conversation.isGroup)return;
  const otherId=conversation.otherId,name=conversationTitle(conversation);
  if(isBlockedByMe(otherId)){
    if(!confirm(`Unblock ${name}? They will be able to message and call you again.`))return;
    const {error}=await sb.from("chat_user_blocks").delete().eq("blocker_id",user.id).eq("blocked_id",otherId);
    if(error){alert("Could not unblock this person: "+error.message);return;}
    await refreshBlockedUsers();renderConversations();return;
  }
  if(!confirm(`Block ${name}? They won't be able to send you private messages or call you. Existing messages will remain visible.`))return;
  const {error}=await sb.from("chat_user_blocks").insert({blocker_id:user.id,blocked_id:otherId});
  if(error&&error.code!=="23505"){alert("Could not block this person: "+error.message);return;}
  await refreshBlockedUsers();renderConversations();
  if(callState?.peerUserId===otherId)await finishCall(false);
}
async function manageBlockedPeople(){
  const {data,error}=await sb.from("chat_user_blocks").select("blocked_id,created_at").eq("blocker_id",user.id).order("created_at",{ascending:false});
  if(error){alert("Could not load blocked people: "+error.message);return;}
  const ids=[...new Set((data||[]).map(row=>row.blocked_id))];
  const {data:people,error:profileError}=ids.length?await sb.from("profiles").select("id,username,display_name,avatar_url").in("id",ids):{data:[],error:null};
  if(profileError){alert("Could not load blocked profiles: "+profileError.message);return;}
  const byId=new Map((people||[]).map(person=>[person.id,person]));
  const rows=ids.map(id=>{const person=byId.get(id)||{id,username:"Chatly user"};return `<div class="blocked-person-row"><div class="avatar" style="width:38px;height:38px">${person.avatar_url?`<img src="${esc(person.avatar_url)}" alt="">`:esc(initials(displayName(person)))}</div><div class="person-copy"><strong>${esc(displayName(person))}</strong><small>@${esc(person.username||"unknown")}</small></div><button class="secondary" type="button" data-unblock-person="${esc(id)}">Unblock</button></div>`;}).join("");
  modal("Blocked people",`${rows||'<p class="small muted">You have not blocked anyone.</p>'}<div class="modal-actions"><button class="secondary" id="closeBlockedPeople">Done</button></div>`);
  $("closeBlockedPeople").onclick=closeModal;
  document.querySelectorAll("[data-unblock-person]").forEach(button=>button.onclick=async()=>{
    const blockedId=button.dataset.unblockPerson;
    const {error}=await sb.from("chat_user_blocks").delete().eq("blocker_id",user.id).eq("blocked_id",blockedId);
    if(error){alert("Could not unblock this person: "+error.message);return;}
    await refreshBlockedUsers();renderConversations();await manageBlockedPeople();
  });
}
function subscribeToBlockChanges(){
  if(!sb||!user||blockChannel)return;
  blockChannel=sb.channel("chatly-block-list-"+user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"chat_user_blocks"},async change=>{
      const row=change.new||change.old;
      if(!row||(row.blocker_id!==user.id&&row.blocked_id!==user.id))return;
      await refreshBlockedUsers();
      renderConversations();
      if(callState?.peerUserId&&isBlockedBetween(callState.peerUserId))await finishCall(false);
    })
    .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Chatly block updates:",status);});
}
async function enter(authUser){
  user=authUser;
  const {data,error}=await sb.from("profiles").select("*").eq("id",user.id).single();if(error)throw error;
  profile=data;$("auth").classList.add("hidden");$("app").classList.remove("hidden");
  $("myName").textContent=profile.display_name||profile.username;
  setAvatar($("myAvatar"),profile.avatar_url,profile.display_name||profile.username);
  await refreshBlockedUsers();await loadConversations();
  subscribeToBlockChanges();subscribeToCallSignals();subscribeToGroupCallSignals();subscribeToMessageSounds();subscribeToGroupMemberships();
  setTimeout(()=>checkPendingIncomingCalls().catch(error=>console.warn("Pending call check failed:",error)),1100);
}
function displayName(p){return p?.display_name||p?.username||"Chatly user";}
async function loadConversations(){
  const loadToken=++conversationLoadToken;
  const {data,error}=await sb.from("conversations").select("id,user_one,user_two,created_at").or(`user_one.eq.${user.id},user_two.eq.${user.id}`).order("created_at",{ascending:false});
  if(error){if(loadToken===conversationLoadToken)$("conversationList").innerHTML=`<div class="empty">Could not load messages: ${esc(error.message)}</div>`;return;}
  const rows=data||[];
  let hiddenConversationIds=new Set();
  const hiddenResult=await sb.from("chat_hidden_conversations").select("conversation_id").eq("user_id",user.id);
  if(hiddenResult.error)console.warn("Conversation hide settings unavailable:",hiddenResult.error.message);
  else hiddenConversationIds=new Set((hiddenResult.data||[]).map(row=>row.conversation_id));
  const visibleRows=rows.filter(row=>!hiddenConversationIds.has(row.id));
  const hiddenMessagesResult=await sb.from("chat_message_hidden").select("message_id").eq("user_id",user.id);
  if(hiddenMessagesResult.error)console.warn("Hidden message previews unavailable:",hiddenMessagesResult.error.message);
  const hiddenMessageIds=new Set((hiddenMessagesResult.data||[]).map(row=>row.message_id));
  const ids=[...new Set(visibleRows.map(c=>c.user_one===user.id?c.user_two:c.user_one))];
  let profiles={};
  if(ids.length){const r=await sb.from("profiles").select("id,username,display_name,avatar_url").in("id",ids);if(r.error)console.error(r.error);else for(const p of r.data||[])profiles[p.id]=p;}

  // Build into a local array. Never mutate the shared list while awaits are pending.
  const nextConversations=[];
  for(const c of visibleRows){
    const other=c.user_one===user.id?c.user_two:c.user_one;
    const person=profiles[other];
    if(!person)continue;
    const {data:recent}=await sb.from("direct_messages").select("id,content,created_at,sender_id,attachment_name,attachment_type,attachment_path").eq("conversation_id",c.id).order("created_at",{ascending:false}).limit(40);
    const last=(recent||[]).find(message=>!hiddenMessageIds.has(message.id))||null;
    nextConversations.push({...c,otherId:other,person,last,isGroup:false});
  }

  const {data:memberships,error:me}=await sb.from("chat_group_members").select("group_id").eq("user_id",user.id);
  if(me){console.warn("Group list unavailable until the Chatly groups SQL is installed:",me.message);}
  else if((memberships||[]).length){
    const groupIds=[...new Set(memberships.map(x=>x.group_id))];
    const {data:groups,error:ge}=await sb.from("chat_groups").select("id,name,created_by,call_room,created_at").in("id",groupIds).order("created_at",{ascending:false});
    if(ge)console.warn("Could not load groups:",ge.message);
    else for(const g of groups||[]){
      const {data:gm}=await sb.from("chat_group_members").select("user_id").eq("group_id",g.id);
      const memberIds=(gm||[]).map(x=>x.user_id);
      const {data:people}=memberIds.length?await sb.from("profiles").select("id,username,display_name,avatar_url").in("id",memberIds):{data:[]};
      const memberProfiles=people||[];
      const {data:recent}=await sb.from("chat_group_messages").select("id,content,created_at,sender_id,attachment_name,attachment_type,attachment_path").eq("group_id",g.id).order("created_at",{ascending:false}).limit(40);
      const last=(recent||[]).find(message=>!hiddenMessageIds.has(message.id))||null;
      nextConversations.push({...g,isGroup:true,members:memberProfiles,memberIds,last});
    }
  }

  // If multiple legacy conversation rows exist for the same person, show one
  // contact entry only. Keep the most recently active thread for that person.
  const unique=new Map();
  for(const item of nextConversations){
    const key=item.isGroup?`group:${item.id}`:`direct:${item.otherId}`;
    const existing=unique.get(key);
    const activity=Date.parse(item.last?.created_at||item.created_at||0)||0;
    const existingActivity=existing?(Date.parse(existing.last?.created_at||existing.created_at||0)||0):-1;
    if(!existing||activity>existingActivity)unique.set(key,item);
  }
  if(loadToken!==conversationLoadToken)return;
  conversations=[...unique.values()].sort((a,b)=>new Date(b.last?.created_at||b.created_at)-new Date(a.last?.created_at||a.created_at));
  renderConversations();
}
function conversationTitle(c){return c.isGroup?c.name:nickname(c.otherId,displayName(c.person));}
function renderConversations(){
  const q=$("searchChats").value.trim().toLowerCase();
  const list=conversations.filter(c=>conversationTitle(c).toLowerCase().includes(q)||(c.isGroup&&(c.members||[]).some(p=>displayName(p).toLowerCase().includes(q))));
  $("conversationList").innerHTML=list.length?list.map(c=>{
    const n=conversationTitle(c),blocked=!c.isGroup&&isBlockedBetween(c.otherId),preview=blocked?(isBlockedByMe(c.otherId)?"You blocked this person":"This person blocked you"):c.last?(c.last.sender_id===user.id?"You: ":(c.isGroup?((c.members||[]).find(p=>p.id===c.last.sender_id)?.display_name||"Member")+": ":""))+messagePreview(c.last):c.isGroup?"Group conversation":"Start a conversation";
    const time=c.last?new Date(c.last.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):"";
    const avatar=c.isGroup?'<span style="font-size:23px">👥</span>':(c.person.avatar_url?`<img src="${esc(c.person.avatar_url)}" alt="">`:esc(initials(n)));
    return `<div class="conversation ${activeConversation===c.id?"active":""}" data-conv="${c.id}"><div class="avatar">${avatar}</div><div class="conv-copy"><div class="conv-top"><span class="conv-name">${esc(n)}</span><span class="conv-time">${time}</span></div><div class="conv-preview">${esc(preview)}</div></div></div>`;
  }).join(""):'<div class="empty"><div><p>No conversations yet.</p><button class="primary" id="listNewChat">Start a chat</button></div></div>';
  $("conversationList").querySelectorAll("[data-conv]").forEach(el=>el.onclick=()=>openConversation(el.dataset.conv));const btn=$("listNewChat");if(btn)btn.onclick=newChatModal;
}
async function newChatModal(){
  modal("Start a conversation",`<p class="muted small">Start a private chat or create a group with multiple Chatly usernames.</p><div class="modal-actions" style="justify-content:stretch"><button class="secondary" id="makeGroup" style="flex:1">👥 Create group</button><button class="secondary" id="makeDirect" style="flex:1">＋ Private chat</button></div><div id="newChatArea"><input class="field" id="findUsername" placeholder="Exact Chatly username"><p class="small" id="findError" style="color:#d84a5b"></p><div class="modal-actions"><button class="secondary" id="cancelModal">Cancel</button><button class="primary" id="findPerson">Find person</button></div></div>`);
  $("cancelModal").onclick=closeModal;$("makeGroup").onclick=createGroupModal;$("makeDirect").onclick=()=>{ $("findUsername").focus(); };
  $("findPerson").onclick=async()=>{const name=$("findUsername").value.trim();if(!name)return;$("findError").textContent="Searching…";const {data,error}=await sb.from("profiles").select("id,username,display_name,avatar_url").ilike("username",name).maybeSingle();if(error){$("findError").textContent=error.message;return;}if(!data){$("findError").textContent="No user found with that exact username.";return;}if(data.id===user.id){$("findError").textContent="That's your own username.";return;}if(isBlockedBetween(data.id)){$("findError").textContent="You cannot start a private conversation with this person while either account has blocked the other.";return;}const {data:cid,error:ce}=await sb.rpc("chatly_get_or_create_conversation",{p_other_user:data.id});if(ce){$("findError").textContent=ce.message;return;}const {error:unhideError}=await sb.from("chat_hidden_conversations").delete().eq("user_id",user.id).eq("conversation_id",cid);if(unhideError)console.warn("Could not restore hidden contact:",unhideError.message);closeModal();await loadConversations();await openConversation(cid);};
}
function createGroupModal(){
  modal("Create a group",`<p class="muted small">Give the group a name, then enter the exact Chatly usernames to add. Separate names with commas or new lines. You will be included automatically.</p><input class="field" id="groupNameInput" maxlength="48" placeholder="Group name"><textarea class="field" id="groupUsersInput" rows="4" placeholder="username1, username2, username3"></textarea><p class="small muted">Groups support up to 20 members, including you.</p><p class="small" id="groupError" style="color:#d84a5b"></p><div class="modal-actions"><button class="secondary" id="cancelModal">Cancel</button><button class="primary" id="createGroupButton">Create group</button></div>`);
  $("cancelModal").onclick=closeModal;$("createGroupButton").onclick=async()=>{
    const name=$("groupNameInput").value.trim();const names=[...new Set($("groupUsersInput").value.split(/[\n,;]+/).map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/^@/,"")))];
    if(!name){$("groupError").textContent="Enter a group name.";return;}if(!names.length){$("groupError").textContent="Add at least one other Chatly username.";return;}if(names.length>19){$("groupError").textContent="Add up to 19 other people.";return;}
    $("createGroupButton").disabled=true;$("groupError").textContent="Finding members…";
    try{let memberIds=[];if(names.length){const {data,error}=await sb.from("profiles").select("id,username").or(names.map(n=>"username.ilike."+n).join(","));if(error)throw error;const found=new Map((data||[]).map(p=>[p.username.toLowerCase(),p]));const missing=names.filter(n=>!found.has(n.toLowerCase()));if(missing.length)throw new Error("Usernames not found: "+missing.join(", "));memberIds=[...found.values()].map(p=>p.id).filter(id=>id!==user.id);}
      const {data:gid,error}=await sb.rpc("chatly_create_group",{p_name:name,p_member_ids:memberIds});if(error)throw error;closeModal();await loadConversations();await openConversation(gid);
    }catch(error){$("groupError").textContent=error.message||String(error);$("createGroupButton").disabled=false;}
  };
}
async function openConversation(id){
  if(messageSelectionMode)toggleMessageSelectionMode(false);
  const c=conversations.find(x=>x.id===id);if(!c)return;activeConversation=id;activeContact=c.person||null;seen=new Set();$("app").classList.add("chat-open");$("emptyState").classList.add("hidden");$("chatHead").classList.remove("hidden");$("messages").classList.remove("hidden");$("messageForm").classList.remove("hidden");
  const name=conversationTitle(c);$("chatName").textContent=name;if(c.isGroup){$("chatAvatar").innerHTML="👥";$("chatStatus").textContent=(c.members||[]).length+" members";$("renameContact").title="Add people to group";}else{setAvatar($("chatAvatar"),c.person.avatar_url,name);$("chatStatus").textContent="Chatly message";$("renameContact").title="Rename contact";}
  updateDirectBlockUI();renderConversations();if(liveChannel){sb.removeChannel(liveChannel);liveChannel=null;}if(activeGroupChannel){sb.removeChannel(activeGroupChannel);activeGroupChannel=null;}
  await loadMessages(true);
  if(c.isGroup){activeGroupChannel=sb.channel("group-chat-"+id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_group_messages",filter:"group_id=eq."+id},async payload=>{const near=nearBottomNow();const {data}=await sb.from("chat_group_messages").select("id,group_id,content,created_at,sender_id,attachment_path,attachment_name,attachment_type,attachment_size").eq("id",payload.new.id).single();if(data){playIncomingMessageSound(data);appendMessage(data);if(near||data.sender_id===user.id)scrollBottom();refreshPreview(id,data);}})
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"chat_group_messages",filter:"group_id=eq."+id},async()=>{await loadMessages(false);await loadConversations();})
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"chat_group_messages",filter:"group_id=eq."+id},async payload=>{removeMessageFromView(payload.old?.id);await loadConversations();})
    .subscribe();}
  else{liveChannel=sb.channel("dm-"+id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"direct_messages",filter:"conversation_id=eq."+id},async payload=>{const nearBottom=nearBottomNow();const {data}=await sb.from("direct_messages").select("id,content,created_at,sender_id,attachment_path,attachment_name,attachment_type,attachment_size").eq("id",payload.new.id).single();if(data){playIncomingMessageSound(data);appendMessage(data);if(nearBottom||data.sender_id===user.id)scrollBottom();refreshPreview(id,data);}})
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"direct_messages",filter:"conversation_id=eq."+id},async()=>{await loadMessages(false);await loadConversations();})
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"direct_messages",filter:"conversation_id=eq."+id},async payload=>{removeMessageFromView(payload.old?.id);await loadConversations();})
    .subscribe();}
}
function nearBottomNow(){const el=$("messages");return el.scrollHeight-el.scrollTop-el.clientHeight<110;}
function scrollBottom(){const el=$("messages");requestAnimationFrame(()=>{el.scrollTop=el.scrollHeight;});}
async function loadMessages(scroll){if(messageSelectionMode)toggleMessageSelectionMode(false);const c=conversations.find(x=>x.id===activeConversation);const table=c?.isGroup?"chat_group_messages":"direct_messages";const filter=c?.isGroup?"group_id":"conversation_id";const type=c?.isGroup?"group":"direct";const {data,error}=await sb.from(table).select("id,content,created_at,sender_id,attachment_path,attachment_name,attachment_type,attachment_size").eq(filter,activeConversation).order("created_at",{ascending:true}).limit(200);if(error){$("messages").textContent=error.message;return;}const hiddenResult=await sb.from("chat_message_hidden").select("message_id").eq("user_id",user.id).eq("message_type",type);if(hiddenResult.error)console.warn("Message hide settings unavailable:",hiddenResult.error.message);const hiddenIds=new Set((hiddenResult.data||[]).map(row=>row.message_id));$("messages").innerHTML="";seen.clear();(data||[]).filter(message=>!hiddenIds.has(message.id)).forEach(appendMessage);if(scroll)scrollBottom();}
function appendMessage(m){
  if(seen.has(m.id))return;
  seen.add(m.id);
  const row=document.createElement("div");
  row.className="message-row"+(m.sender_id===user.id?" mine":"");
  const currentConversation=conversations.find(c=>c.id===activeConversation);
  if(currentConversation?.isGroup&&m.sender_id!==user.id){const sender=(currentConversation.members||[]).find(p=>p.id===m.sender_id);const label=document.createElement("div");label.className="message-time";label.textContent=displayName(sender)||"Group member";row.append(label);}
  if(m.content){
    const bubble=document.createElement("div");
    bubble.className="bubble";
    bubble.textContent=m.content;
    row.append(bubble);
  }
  if(m.attachment_path){
    const holder=document.createElement("div");
    holder.className="message-attachment";
    const loading=document.createElement("div");
    loading.className="attachment-caption";
    loading.textContent="Loading attachment…";
    holder.append(loading);
    row.append(holder);
    renderMessageAttachment(m,holder).catch(error=>{
      holder.textContent="Could not load attachment: "+(error.message||"unknown error");
    });
  }
  const time=document.createElement("div");
  time.className="message-time";
  time.textContent=new Date(m.created_at).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  row.append(time);
  row.dataset.messageId=m.id;
  row._chatMessage=m;
  const indicator=document.createElement("button");
  indicator.type="button";
  indicator.className="message-select-indicator";
  indicator.setAttribute("aria-label","Select message");
  indicator.textContent=selectedMessages.has(m.id)?"✓":"";
  indicator.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();toggleMessageSelection(m,row);});
  row.append(indicator);
  row.addEventListener("click",event=>{
    if(!messageSelectionMode)return;
    if(event.target.closest("a,button,input,video,audio"))return;
    toggleMessageSelection(m,row);
  });
  if(messageSelectionMode&&selectedMessages.has(m.id))row.classList.add("selected-message");
  $("messages").append(row);
}
async function renderMessageAttachment(message,holder){
  const {data,error}=await sb.storage.from("chat-media").createSignedUrl(message.attachment_path,3600);
  if(error)throw error;
  const url=data.signedUrl;
  holder.innerHTML="";
  const type=message.attachment_type||"application/octet-stream";
  const caption=document.createElement("div");
  caption.className="attachment-caption";
  caption.textContent=message.attachment_name||"Attachment";
  if(type.startsWith("image/")){
    const image=document.createElement("img");
    image.src=url;image.alt=message.attachment_name||"Shared image";image.loading="lazy";
    holder.append(image,caption);
  }else if(type.startsWith("video/")){
    const video=document.createElement("video");
    video.src=url;video.controls=true;video.playsInline=true;video.preload="metadata";
    holder.append(video,caption);
  }else if(type.startsWith("audio/")){
    const audio=document.createElement("audio");
    audio.src=url;audio.controls=true;audio.preload="metadata";
    holder.append(audio,caption);
  }else{
    const link=document.createElement("a");
    link.href=url;link.target="_blank";link.rel="noopener noreferrer";
    link.textContent="📎 "+(message.attachment_name||"Download file");
    holder.append(link,caption);
  }
}
function removeMessageFromView(messageId){
  if(!messageId)return;
  const row=document.querySelector(`[data-message-id="${messageId}"]`);if(row)row.remove();
  seen.delete(messageId);
  selectedMessages.delete(messageId);
  if(messageSelectionMode)updateMessageSelectionUI();
}
function messageTableInfo(message){
  const c=conversations.find(item=>item.id===activeConversation);
  return c?.isGroup?{table:"chat_group_messages",type:"group",field:"group_id"}:{table:"direct_messages",type:"direct",field:"conversation_id"};
}
function updateMessageSelectionUI(){
  const items=[...selectedMessages.values()];
  const owned=items.filter(message=>message.sender_id===user.id);
  const editAllowed=items.length===1&&owned.length===1&&!!items[0].content;
  const toolbar=$("messageSelectionToolbar");
  if(toolbar)toolbar.classList.toggle("hidden",!messageSelectionMode);
  const count=$("messageSelectionCount");if(count)count.textContent=`${items.length} selected`;
  const edit=$("selectionEditBtn");if(edit)edit.disabled=!editAllowed;
  const del=$("selectionDeleteBtn");if(del){del.disabled=items.length===0;del.textContent=items.length>1?`Delete for me (${items.length})`:"Delete for me";}
  const unsend=$("selectionUnsendBtn");if(unsend){unsend.disabled=owned.length===0;unsend.textContent=owned.length>1?`Unsend (${owned.length})`:"Unsend";}
}
function toggleMessageSelectionMode(force){
  const next=typeof force==="boolean"?force:!messageSelectionMode;
  messageSelectionMode=next;
  if(!next)selectedMessages.clear();
  $("messages")?.classList.toggle("selection-mode",next);
  $("selectMessagesBtn").classList.toggle("active",next);
  $("selectMessagesBtn").textContent=next?"Cancel":"Select";
  $("selectMessagesBtn").title=next?"Cancel message selection":"Select messages";
  $("selectMessagesBtn").setAttribute("aria-pressed",String(next));
  document.querySelectorAll("#messages .message-row").forEach(row=>{
    const messageId=row.dataset.messageId;
    row.classList.toggle("selected-message",next&&selectedMessages.has(messageId));
    const marker=row.querySelector(".message-select-indicator");
    if(marker)marker.textContent=next&&selectedMessages.has(messageId)?"✓":"";
  });
  updateMessageSelectionUI();
}
function toggleMessageSelection(message,row){
  if(!messageSelectionMode)return;
  if(selectedMessages.has(message.id))selectedMessages.delete(message.id);
  else selectedMessages.set(message.id,message);
  const selected=selectedMessages.has(message.id);
  row.classList.toggle("selected-message",selected);
  const marker=row.querySelector(".message-select-indicator");if(marker)marker.textContent=selected?"✓":"";
  updateMessageSelectionUI();
}
async function deleteSelectedForMe(){
  const items=[...selectedMessages.values()];if(!items.length)return;
  const info=messageTableInfo(items[0]);
  const rows=items.map(message=>({user_id:user.id,message_id:message.id,message_type:info.type}));
  const {error}=await sb.from("chat_message_hidden").upsert(rows,{onConflict:"user_id,message_type,message_id",ignoreDuplicates:true});
  if(error){alert("Could not delete selected messages for you: "+error.message);return;}
  const ids=items.map(message=>message.id);
  toggleMessageSelectionMode(false);
  ids.forEach(removeMessageFromView);
  await loadConversations();
}
async function unsendSelectedForEveryone(){
  const items=[...selectedMessages.values()];
  const owned=items.filter(message=>message.sender_id===user.id);
  if(!owned.length)return;
  if(!confirm(`Unsend ${owned.length} message${owned.length===1?"":"s"} for everyone? Messages sent by other people will not be unsent.`))return;
  const info=messageTableInfo(owned[0]);
  const ids=owned.map(message=>message.id);
  const {data,error}=await sb.from(info.table).delete().in("id",ids).eq("sender_id",user.id).select("id");
  if(error){alert("Could not unsend selected messages: "+error.message);return;}
  const removed=new Set((data||[]).map(row=>row.id));
  if(!removed.size){alert("Chatly could not unsend those messages. You can only unsend your own messages.");return;}
  const paths=owned.filter(message=>removed.has(message.id)&&message.attachment_path).map(message=>message.attachment_path);
  if(paths.length){const {error:storageError}=await sb.storage.from("chat-media").remove(paths);if(storageError)console.warn("Messages removed but some attachment cleanup failed:",storageError.message);}
  toggleMessageSelectionMode(false);
  [...removed].forEach(removeMessageFromView);
  await loadConversations();
}

async function hideMessageForMe(message){
  const info=messageTableInfo(message);
  const {error}=await sb.from("chat_message_hidden").insert({user_id:user.id,message_id:message.id,message_type:info.type});
  if(error&&error.code!=="23505"){alert("Could not hide message: "+error.message);return;}
  closeModal();removeMessageFromView(message.id);await loadConversations();
}
async function unsendMessage(message){
  if(!confirm("Unsend this message for everyone?"))return;
  const info=messageTableInfo(message);
  const {data,error}=await sb.from(info.table).delete().eq("id",message.id).eq("sender_id",user.id).select("id").maybeSingle();
  if(error){alert("Could not unsend message: "+error.message);return;}
  if(!data){alert("Chatly couldn't remove that message. You can only unsend messages you sent.");return;}
  if(message.attachment_path){const {error:storageError}=await sb.storage.from("chat-media").remove([message.attachment_path]);if(storageError)console.warn("Message removed but its attachment cleanup failed:",storageError.message);}
  closeModal();removeMessageFromView(message.id);await loadConversations();
}
function editOwnMessage(message){
  modal("Edit message",`<textarea class="field" id="editMessageText" rows="5" maxlength="4000">${esc(message.content||"")}</textarea><div class="modal-actions"><button class="secondary" id="cancelModal">Cancel</button><button class="primary" id="saveEditedMessage">Save changes</button></div>`);
  $("cancelModal").onclick=closeModal;
  $("saveEditedMessage").onclick=async()=>{const content=$("editMessageText").value.trim();if(!content){alert("A message cannot be empty. Use Unsend for everyone to remove it.");return;}const info=messageTableInfo(message);const {data,error}=await sb.from(info.table).update({content}).eq("id",message.id).eq("sender_id",user.id).select("id").maybeSingle();if(error){alert("Could not edit message: "+error.message);return;}if(!data){alert("Chatly couldn't edit that message.");return;}closeModal();await loadMessages(false);await loadConversations();};
}

async function uploadChatFiles(fileList){
  if(!activeConversation||!user)return;
  const currentConversation=conversations.find(c=>c.id===activeConversation);
  const messageTable=currentConversation?.isGroup?"chat_group_messages":"direct_messages";
  const conversationField=currentConversation?.isGroup?"group_id":"conversation_id";
  const files=Array.from(fileList||[]);
  if(!files.length)return;
  const attachButton=$("attachButton");
  attachButton.disabled=true;
  try{
    for(const file of files){
      if(file.size>50*1024*1024)throw new Error(file.name+" is larger than the 50 MB limit.");
      $("uploadStatus").textContent="Uploading "+file.name+"…";
      const safeName=(file.name||"file").replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100);
      const path=activeConversation+"/"+user.id+"/"+crypto.randomUUID()+"-"+safeName;
      const fileType=file.type||"application/octet-stream";
      const {error:uploadError}=await sb.storage.from("chat-media").upload(path,file,{
        cacheControl:"3600",upsert:false,contentType:fileType
      });
      if(uploadError)throw uploadError;
      const messageId=crypto.randomUUID();
      const messageRow={
        id:messageId,
        [conversationField]:activeConversation,
        sender_id:user.id,
        content:"",
        attachment_path:path,
        attachment_name:file.name||"Attachment",
        attachment_type:fileType,
        attachment_size:file.size
      };
      const {error:messageError}=await sb.from(messageTable).insert(messageRow);
      if(messageError){
        await sb.storage.from("chat-media").remove([path]);
        throw messageError;
      }
      notifyChatlyPush("notify-message",{messageId,messageType:currentConversation?.isGroup?"group":"direct"});
    }
    $("uploadStatus").textContent=files.length===1?"Attachment sent.":files.length+" attachments sent.";
    setTimeout(()=>{if($("uploadStatus"))$("uploadStatus").textContent="";},2500);
  }catch(error){
    $("uploadStatus").textContent="Upload failed.";
    alert("Could not upload attachment: "+(error.message||error));
  }finally{
    attachButton.disabled=false;
    $("chatFileInput").value="";
  }
}

function refreshPreview(id,m){const c=conversations.find(x=>x.id===id);if(c){c.last=m;conversations.sort((a,b)=>new Date(b.last?.created_at||b.created_at)-new Date(a.last?.created_at||a.created_at));renderConversations();}}
$("messageForm").onsubmit=async e=>{
  e.preventDefault();const content=$("messageInput").value.trim();if(!content||!activeConversation)return;
  const c=conversations.find(x=>x.id===activeConversation);
  if(c&&!c.isGroup&&isBlockedBetween(c.otherId)){updateDirectBlockUI();return;}
  const table=c?.isGroup?"chat_group_messages":"direct_messages";
  const field=c?.isGroup?"group_id":"conversation_id";
  const messageId=crypto.randomUUID(),btn=$("messageForm").querySelector("button");btn.disabled=true;
  const {error}=await sb.from(table).insert({id:messageId,[field]:activeConversation,sender_id:user.id,content});
  btn.disabled=false;
  if(error){alert("Message could not send: "+error.message);return;}
  notifyChatlyPush("notify-message",{messageId,messageType:c?.isGroup?"group":"direct"});
  $("messageInput").value="";$("messageInput").style.height="auto";
};
$("messageInput").addEventListener("input",()=>{const el=$("messageInput");el.style.height="auto";el.style.height=Math.min(el.scrollHeight,120)+"px";});
$("messageInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey&&(sendWithEnter||e.ctrlKey||e.metaKey)){e.preventDefault();$("messageForm").requestSubmit();}});
$("selectMessagesBtn").onclick=()=>toggleMessageSelectionMode();
$("selectionCancelBtn").onclick=()=>toggleMessageSelectionMode(false);
$("selectionEditBtn").onclick=()=>{
  const items=[...selectedMessages.values()];
  if(items.length!==1||items[0].sender_id!==user.id||!items[0].content)return;
  const message=items[0];toggleMessageSelectionMode(false);editOwnMessage(message);
};
$("selectionDeleteBtn").onclick=deleteSelectedForMe;
$("selectionUnsendBtn").onclick=unsendSelectedForEveryone;
$("videoCallBtn").onclick=()=>{const c=conversations.find(x=>x.id===activeConversation);if(c?.isGroup)startGroupCall(c);else startVideoCall();};
const GROUP_CALL_MAX_PARTICIPANTS=6;
function groupCallStatus(message){const el=$("groupCallStatus");if(el)el.textContent=message||"";}
function groupCallName(group){return group?.name||"Group call";}
function findGroupMember(group,id){return (group?.members||[]).find(member=>member.id===id)||null;}
function groupMemberDisplay(group,id){const member=findGroupMember(group,id);return displayName(member)||"Chatly user";}
function groupCallTileId(id){return "group-call-tile-"+String(id).replace(/[^a-zA-Z0-9_-]/g,"-");}
function createGroupCallTile(id,name,avatarUrl,isLocal=false){
  const state=groupCallState;
  if(!state)return null;
  const tileId=groupCallTileId(id);
  let tile=$(tileId);
  if(tile)return tile;
  tile=document.createElement("div");tile.className="group-call-tile";tile.id=tileId;
  const video=document.createElement("video");video.autoplay=true;video.playsInline=true;video.muted=!!isLocal;video.classList.add("hidden");video.id=tileId+"-video";
  const avatar=document.createElement("div");avatar.className="group-call-tile-avatar";avatar.id=tileId+"-avatar";setAvatar(avatar,avatarUrl,name);
  const label=document.createElement("div");label.className="group-call-tile-name";label.textContent=isLocal?(name+" (You)"):name;
  tile.append(video,avatar,label);
  $("groupCallGrid").appendChild(tile);
  return tile;
}
function setGroupTileCamera(id,enabled){
  const tile=$(groupCallTileId(id));if(!tile)return;
  const video=tile.querySelector("video"),avatar=$(groupCallTileId(id)+"-avatar");
  if(video)video.classList.toggle("hidden",!enabled);
  if(avatar)avatar.classList.toggle("hidden",!!enabled);
}
function setGroupCallControls(){
  const state=groupCallState;if(!state)return;
  const mic=state.localStream?.getAudioTracks?.()[0];
  const camera=state.localStream?.getVideoTracks?.()[0];
  $("groupToggleMic").textContent=mic?.enabled===false?"Unmute mic":"Mute mic";
  $("groupToggleCamera").textContent=camera?.enabled===false?"Turn camera on":"Camera off";
  $("groupEndCall").classList.toggle("hidden",!state.isHost);
}
function showGroupCallUI(state){
  $("groupCallTitle").textContent=state.groupName;
  $("groupCallGrid").innerHTML="";
  $("groupCallOverlay").classList.remove("hidden");
  setGroupCallControls();
}
async function sendGroupCallSignal(type,state,toUser,payload={}){
  if(!sb||!user||!state||!toUser)throw new Error("Group call is not connected.");
  const {error}=await sb.from("chat_group_call_signals").insert({
    call_id:state.id,group_id:state.groupId,from_user:user.id,to_user:toUser,signal_type:type,payload
  });
  if(error)throw error;
}
async function loadGroupCallIceServers(){return await loadChatlyTurnIceServers();}
function updateGroupPeerTile(peerId){
  const state=groupCallState,peer=state?.peers.get(peerId);if(!state||!peer)return;
  const member=findGroupMember(state.group,peerId),name=displayName(member)||peer.name||"Chatly user";
  const tile=createGroupCallTile(peerId,name,member?.avatar_url||"",false);
  const video=$(groupCallTileId(peerId)+"-video"),avatar=$(groupCallTileId(peerId)+"-avatar");
  const label=tile?.querySelector(".group-call-tile-name");
  if(label)label.textContent=name+(peer.screenSharing?" · Sharing screen":"");
  if(video&&peer.remoteStream){video.srcObject=peer.remoteStream;video.play().catch(()=>{});}
  if(avatar)avatar.classList.toggle("hidden",!!peer.videoReady&&!peer.cameraOff);
  if(video)video.classList.toggle("hidden",!peer.videoReady||peer.cameraOff);
}
async function ensureGroupPeer(peerId,shouldOffer=false){
  const state=groupCallState;
  if(!state||state.closing||peerId===user.id)return null;
  const existing=state.peers.get(peerId);
  if(existing){
    if(shouldOffer&&!existing.offerStarted&&!existing.remoteDescriptionSet){await startGroupPeerOffer(peerId,existing);}
    return existing;
  }
  const member=findGroupMember(state.group,peerId);
  const peer={pc:null,remoteStream:new MediaStream(),pendingCandidates:[],remoteDescriptionSet:false,offerStarted:false,videoReady:false,cameraOff:false,lastSeenAt:Date.now(),name:displayName(member)||"Chatly user"};
  state.peers.set(peerId,peer);
  const tile=createGroupCallTile(peerId,peer.name,member?.avatar_url||"",false);
  if(!tile){state.peers.delete(peerId);return null;}
  const pc=new RTCPeerConnection({iceServers:state.iceServers,iceCandidatePoolSize:2});peer.pc=pc;
  state.localStream.getTracks().forEach(track=>{
    if(track.kind==="video"&&state.screenStream){const screenTrack=state.screenStream.getVideoTracks()[0];if(screenTrack)pc.addTrack(screenTrack,state.screenStream);else pc.addTrack(track,state.localStream);}
    else pc.addTrack(track,state.localStream);
  });
  peer.videoSender=pc.getSenders().find(sender=>sender.track?.kind==="video")||null;
  pc.ontrack=event=>{
    const tracks=event.streams?.[0]?.getTracks?.()||[event.track];
    for(const track of tracks){
      if(!peer.remoteStream.getTracks().some(existingTrack=>existingTrack.id===track.id))peer.remoteStream.addTrack(track);
      if(track.kind==="video"){
        track.onunmute=()=>{peer.videoReady=true;updateGroupPeerTile(peerId);};
        track.onmute=()=>{peer.videoReady=false;updateGroupPeerTile(peerId);};
        if(!track.muted)peer.videoReady=true;
      }
    }
    updateGroupPeerTile(peerId);
  };
  pc.onicecandidate=event=>{
    if(!event.candidate||groupCallState?.id!==state.id)return;
    const candidate=event.candidate.toJSON?event.candidate.toJSON():event.candidate;
    sendGroupCallSignal("ice",state,peerId,{candidate}).catch(error=>console.warn("Group call ICE signal failed:",error));
  };
  pc.onconnectionstatechange=()=>{
    if(groupCallState?.id!==state.id)return;
    if(pc.connectionState==="connected")groupCallStatus("Connected · "+(state.peers.size+1)+" people");
    else if(pc.connectionState==="connecting")groupCallStatus("Connecting to "+peer.name+"…");
    else if(pc.connectionState==="failed")groupCallStatus("Connection to "+peer.name+" failed. Check the network and TURN relay.");
    else if(pc.connectionState==="disconnected")groupCallStatus("Reconnecting to "+peer.name+"…");
  };
  if(shouldOffer)await startGroupPeerOffer(peerId,peer);
  return peer;
}
async function startGroupPeerOffer(peerId,peer){
  const state=groupCallState;
  if(!state||state.closing||!peer?.pc||peer.offerStarted||peer.remoteDescriptionSet)return;
  peer.offerStarted=true;
  try{
    const offer=await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    await sendGroupCallSignal("offer",state,peerId,{description:peer.pc.localDescription});
  }catch(error){peer.offerStarted=false;console.warn("Could not create group peer offer:",error);groupCallStatus("Could not connect to "+peer.name+": "+(error.message||error));}
}
async function flushGroupCandidates(peer){
  if(!peer?.pc||!peer.remoteDescriptionSet)return;
  const queued=peer.pendingCandidates.splice(0);
  for(const candidate of queued){try{await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(error){console.warn("Could not add group ICE candidate:",error);}}
}
async function receiveGroupCandidate(peer,candidate){
  if(!peer||!candidate)return;
  if(!peer.pc||!peer.remoteDescriptionSet){peer.pendingCandidates.push(candidate);return;}
  try{await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(error){console.warn("Could not add group ICE candidate:",error);}
}
function closeGroupPeer(peerId){
  const state=groupCallState,peer=state?.peers.get(peerId);if(!state||!peer)return;
  try{peer.pc?.close();}catch{}
  peer.remoteStream?.getTracks?.().forEach(track=>track.stop());
  state.peers.delete(peerId);
  $(groupCallTileId(peerId))?.remove();
}
async function onGroupParticipantChange(payload){
  const state=groupCallState;if(!state||state.closing)return;
  const row=payload?.new||payload?.old;if(!row||row.call_id!==state.id)return;
  if(payload.eventType==="DELETE"){
    if(row.user_id!==user.id)closeGroupPeer(row.user_id);
    return;
  }
  if(row.user_id===user.id)return;
  const peer=state.peers.get(row.user_id);if(peer)peer.lastSeenAt=Date.now();
  if(payload.eventType==="INSERT"&&user.id<row.user_id){
    try{await ensureGroupPeer(row.user_id,true);}catch(error){console.warn("Could not create group connection:",error);}
  }else if(payload.eventType==="UPDATE"&&user.id<row.user_id&&!state.peers.has(row.user_id)){
    try{await ensureGroupPeer(row.user_id,true);}catch(error){console.warn("Could not reconnect group member:",error);}
  }
}
async function setupGroupCallRealtime(state){
  if(state.participantChannel)await sb.removeChannel(state.participantChannel);
  await new Promise((resolve,reject)=>{
    let settled=false;
    state.participantChannel=sb.channel("chatly-group-call-participants-"+state.id)
      .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_group_call_participants",filter:"call_id=eq."+state.id},onGroupParticipantChange)
      .on("postgres_changes",{event:"UPDATE",schema:"public",table:"chat_group_call_participants",filter:"call_id=eq."+state.id},onGroupParticipantChange)
      .on("postgres_changes",{event:"DELETE",schema:"public",table:"chat_group_call_participants",filter:"call_id=eq."+state.id},onGroupParticipantChange)
      .subscribe(status=>{
        if(status==="SUBSCRIBED"&&!settled){settled=true;resolve();}
        else if((status==="CHANNEL_ERROR"||status==="TIMED_OUT")&&!settled){settled=true;reject(new Error("Could not subscribe to the group-call participant list: "+status));}
      });
  });
  // Refresh participant presence and remove peers that have disappeared.
  state.heartbeatTimer=setInterval(async()=>{
    if(groupCallState?.id!==state.id||state.closing)return;
    const now=new Date().toISOString();
    const {error}=await sb.from("chat_group_call_participants").update({last_seen_at:now}).eq("call_id",state.id).eq("user_id",user.id);
    if(error)console.warn("Group call heartbeat failed:",error.message);
    const cutoff=Date.now()-45000;
    for(const [peerId,peer] of state.peers){if(peer.lastSeenAt<cutoff)closeGroupPeer(peerId);}
  },15000);
  const {data:participants,error}=await sb.from("chat_group_call_participants").select("user_id,last_seen_at").eq("call_id",state.id);
  if(error)throw error;
  const now=Date.now();
  for(const row of participants||[]){
    if(row.user_id===user.id)continue;
    const lastSeen=Date.parse(row.last_seen_at||"");
    if(!Number.isFinite(lastSeen)||now-lastSeen>45000)continue;
    if(user.id<row.user_id)await ensureGroupPeer(row.user_id,true);
  }
  groupCallStatus("Waiting for group members to connect…");
}
async function enterGroupCall(callRow,group){
  if(callState||groupCallState)throw new Error("Finish your current call before joining a group call.");
  const state={id:callRow.id,groupId:callRow.group_id,groupName:groupCallName(group),group,startedBy:callRow.started_by,isHost:callRow.started_by===user.id,localStream:null,screenStream:null,screenTrack:null,cameraFacing:"user",iceServers:null,peers:new Map(),participantChannel:null,heartbeatTimer:null,closing:false};
  groupCallState=state;
  showGroupCallUI(state);
  groupCallStatus("Requesting camera and microphone…");
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw new Error("Camera and microphone require HTTPS and a supported browser.");
    state.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:{width:{ideal:1280},height:{ideal:720},facingMode:"user"}});
    state.cameraFacing=state.localStream.getVideoTracks?.()[0]?.getSettings?.().facingMode||"user";
    state.iceServers=await loadGroupCallIceServers();
    if(groupCallState?.id!==state.id)throw new Error("The group call ended while connecting.");
    createGroupCallTile(user.id,displayName(profile),profile?.avatar_url||"",true);
    const localVideo=$(groupCallTileId(user.id)+"-video");
    localVideo.srcObject=state.localStream;localVideo.play().catch(()=>{});
    setGroupTileCamera(user.id,true);
    setGroupCallControls();
    const {count:activeCount,error:countError}=await sb.from("chat_group_call_participants").select("user_id",{count:"exact",head:true}).eq("call_id",state.id).neq("user_id",user.id).gt("last_seen_at",new Date(Date.now()-45000).toISOString());
    if(countError)throw countError;
    if((activeCount||0)>=GROUP_CALL_MAX_PARTICIPANTS)throw new Error("This group call already has six active participants. Try again if someone leaves.");
    const {error:participantError}=await sb.from("chat_group_call_participants").upsert({call_id:state.id,group_id:state.groupId,user_id:user.id,last_seen_at:new Date().toISOString()},{onConflict:"call_id,user_id"});
    if(participantError)throw participantError;
    await setupGroupCallRealtime(state);
    setupInCallChat("group",state).catch(error=>console.warn("Could not start group call chat:",error));
    groupCallStatus("In group call · waiting for others");
  }catch(error){
    await cleanupGroupCall(false);
    throw error;
  }
}
async function startGroupCall(group){
  if(!group||!group.isGroup)return;
  if(callState||groupCallState){alert("Finish your current call before starting a group call.");return;}
  const members=(group.memberIds||[]).filter(id=>id!==user.id);
  if(!members.length){alert("Add at least one other person to this group before calling.");return;}
  let createdCallId=null;
  try{
    const {data:callRow,error}=await sb.from("chat_group_calls").insert({group_id:group.id,started_by:user.id}).select("id,group_id,started_by,created_at,ended_at").single();
    if(error)throw error;
    createdCallId=callRow.id;
    await enterGroupCall(callRow,group);
    const invites=members.map(to_user=>({call_id:callRow.id,group_id:group.id,from_user:user.id,to_user,signal_type:"invite",payload:{group_name:group.name,caller_name:displayName(profile)}}));
    const {error:inviteError}=await sb.from("chat_group_call_signals").insert(invites);
    if(inviteError)throw inviteError;
    notifyChatlyPush("notify-group-call",{callId:callRow.id,groupId:group.id});
    groupCallStatus("Calling "+members.length+" group member"+(members.length===1?"":"s")+"…");
  }catch(error){
    if(groupCallState)await cleanupGroupCall(false);
    if(createdCallId)await sb.from("chat_group_calls").update({ended_at:new Date().toISOString()}).eq("id",createdCallId).eq("started_by",user.id);
    alert("Could not start the group call: "+(error.message||error)+". Make sure the Group Calls SQL migration has been run in Supabase.");
  }
}
async function acceptGroupInvite(invite){
  const {data:callRow,error}=await sb.from("chat_group_calls").select("id,group_id,started_by,created_at,ended_at").eq("id",invite.callId).eq("group_id",invite.groupId).is("ended_at",null).single();
  if(error)throw new Error("This group call is no longer available.");
  let group=conversations.find(item=>item.isGroup&&item.id===invite.groupId);
  if(!group){await loadConversations();group=conversations.find(item=>item.isGroup&&item.id===invite.groupId);}
  if(!group)throw new Error("You are no longer a member of this group.");
  await enterGroupCall(callRow,group);
}
async function declineGroupInvite(invite){
  try{await sb.from("chat_group_call_signals").insert({call_id:invite.callId,group_id:invite.groupId,from_user:user.id,to_user:invite.fromUser,signal_type:"decline",payload:{}});}catch(error){console.warn("Could not send decline:",error);}
}
function showIncomingGroupInvite(invite){
  if(callState||groupCallState){declineGroupInvite(invite).catch(()=>{});return;}
  if(pendingGroupInvite){declineGroupInvite(invite).catch(()=>{});return;}
  pendingGroupInvite=invite;
  startCallRingtone("incoming");
  modal("Incoming group video call",`<p><strong>${esc(invite.callerName||"A group member")}</strong> is inviting you to call <strong>${esc(invite.groupName||"a group")}</strong>.</p><p class="small muted">Group video calls are hosted inside Chatly. Up to 6 people can join at once.</p><div class="modal-actions"><button class="secondary" id="declineGroupInvite">Decline</button><button class="primary" id="acceptGroupInvite">Join call</button></div>`);
  $("declineGroupInvite").onclick=async()=>{const current=pendingGroupInvite;pendingGroupInvite=null;stopCallRingtone();closeModal();if(current)await declineGroupInvite(current);};
  $("acceptGroupInvite").onclick=async()=>{const current=pendingGroupInvite;pendingGroupInvite=null;stopCallRingtone();closeModal();if(!current)return;try{await acceptGroupInvite(current);}catch(error){alert("Could not join the group call: "+(error.message||error));}};
}
async function handleGroupCallSignal(change){
  const row=change?.new;if(!row||row.to_user!==user?.id||row.from_user===user.id)return;
  if(row.signal_type==="invite"){
    const key=String(row.id||`${row.call_id}:${row.from_user}:${row.created_at||"invite"}`);
    if(handledGroupInviteIds.has(key))return;
    handledGroupInviteIds.add(key);if(handledGroupInviteIds.size>40)handledGroupInviteIds.clear();
  }
  const payload=row.payload||{};
  try{
    if(row.signal_type==="invite"){
      showIncomingGroupInvite({callId:row.call_id,groupId:row.group_id,fromUser:row.from_user,groupName:payload.group_name||"Group call",callerName:payload.caller_name||"A group member"});
      return;
    }
    const state=groupCallState;
    if(!state||state.id!==row.call_id)return;
    const peerId=row.from_user;
    if(row.signal_type==="offer"){
      const peer=await ensureGroupPeer(peerId,false);
      if(!peer?.pc)return;
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.description));
      peer.remoteDescriptionSet=true;
      await flushGroupCandidates(peer);
      const answer=await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      await sendGroupCallSignal("answer",state,peerId,{description:peer.pc.localDescription});
    }else if(row.signal_type==="answer"){
      const peer=state.peers.get(peerId);if(!peer?.pc||peer.remoteDescriptionSet)return;
      await peer.pc.setRemoteDescription(new RTCSessionDescription(payload.description));
      peer.remoteDescriptionSet=true;
      await flushGroupCandidates(peer);
    }else if(row.signal_type==="ice"){
      const peer=state.peers.get(peerId)||await ensureGroupPeer(peerId,false);
      await receiveGroupCandidate(peer,payload.candidate);
    }else if(row.signal_type==="camera"){
      const peer=state.peers.get(peerId);if(peer){peer.cameraOff=!payload.enabled;peer.screenSharing=!!payload.sharing;updateGroupPeerTile(peerId);}
    }else if(row.signal_type==="leave"){
      closeGroupPeer(peerId);groupCallStatus(groupMemberDisplay(state.group,peerId)+" left the call.");
    }else if(row.signal_type==="end"){
      await cleanupGroupCall(false);
      alert("The group call was ended.");
    }else if(row.signal_type==="decline"){
      groupCallStatus(groupMemberDisplay(state.group,peerId)+" declined the call.");
    }
  }catch(error){console.warn("Group call signal handling failed:",error);if(groupCallState?.id===row.call_id)groupCallStatus("Group call connection issue: "+(error.message||error));}
  finally{
    // Each signal is a one-use event. Deleting after processing keeps the table small.
    sb.from("chat_group_call_signals").delete().eq("id",row.id).eq("to_user",user.id).then(({error})=>{if(error)console.warn("Could not clear group call signal:",error.message);});
  }
}
function subscribeToGroupCallSignals(){
  if(!sb||!user||groupCallSignalChannel)return;
  groupCallSignalChannel=sb.channel("chatly-group-call-signals-"+user.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_group_call_signals",filter:"to_user=eq."+user.id},handleGroupCallSignal)
    .subscribe(status=>{if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Group call signaling subscription:",status);});
}
async function cleanupGroupCall(sendLeave=true){
  const state=groupCallState;if(!state)return;
  state.closing=true;
  if(sendLeave){
    for(const peerId of state.peers.keys())sendGroupCallSignal("leave",state,peerId,{}).catch(()=>{});
  }
  groupCallState=null;
  await closeInCallChat(state);
  resetInCallChatUI("group");
  if(state.heartbeatTimer)clearInterval(state.heartbeatTimer);
  if(state.participantChannel)await sb.removeChannel(state.participantChannel);
  try{await sb.from("chat_group_call_participants").delete().eq("call_id",state.id).eq("user_id",user.id);}catch{}
  for(const peer of state.peers.values()){try{peer.pc?.close();}catch{}peer.remoteStream?.getTracks?.().forEach(track=>track.stop());}
  state.peers.clear();
  state.screenStream?.getTracks?.().forEach(track=>{track.onended=null;track.stop();});
  state.localStream?.getTracks?.().forEach(track=>track.stop());
  $("groupShareScreen").textContent="Share screen";$("groupShareScreen").classList.remove("share-active");
  $("groupCallOverlay").classList.add("hidden");
  $("groupCallGrid").innerHTML="";
}
async function leaveGroupCall(){
  const state=groupCallState;if(!state)return;
  await cleanupGroupCall(true);
}
async function endGroupCallForEveryone(){
  const state=groupCallState;if(!state)return;
  const {data:participants}=await sb.from("chat_group_call_participants").select("user_id").eq("call_id",state.id);
  await Promise.all((participants||[]).filter(participant=>participant.user_id!==user.id).map(participant=>sendGroupCallSignal("end",state,participant.user_id,{}).catch(error=>console.warn("Could not notify group member:",error))));
  const {error}=await sb.from("chat_group_calls").update({ended_at:new Date().toISOString()}).eq("id",state.id).eq("started_by",user.id);
  if(error){groupCallStatus("Could not end the group call: "+error.message);return;}
  await cleanupGroupCall(false);
}
function toggleGroupCallMic(){
  const track=groupCallState?.localStream?.getAudioTracks?.()[0];if(!track)return;
  track.enabled=!track.enabled;setGroupCallControls();
}
function toggleGroupCallCamera(){
  const state=groupCallState,track=state?.localStream?.getVideoTracks?.()[0];if(!track)return;
  track.enabled=!track.enabled;
  if(!state.screenStream)setGroupTileCamera(user.id,track.enabled);
  setGroupCallControls();
  for(const peerId of state.peers.keys())sendGroupCallSignal("camera",state,peerId,{enabled:state.screenStream?true:track.enabled,sharing:!!state.screenStream}).catch(error=>console.warn("Could not sync group camera:",error));
}
async function flipGroupCamera(){
  const state=groupCallState;if(!state?.localStream)return;
  try{
    const {oldTrack,nextTrack,nextFacing}=await acquireAlternateCameraTrack(state.localStream,state.cameraFacing||"user");
    const replacedSenders=[];
    try{
      if(!state.screenStream){
        for(const peer of state.peers.values()){
          const sender=peer.videoSender||peer.pc?.getSenders().find(item=>item.track?.kind==="video");
          if(sender){await sender.replaceTrack(nextTrack);replacedSenders.push(sender);}
        }
      }
    }catch(error){
      await Promise.all(replacedSenders.map(sender=>sender.replaceTrack(oldTrack).catch(()=>{})));
      nextTrack.stop();throw error;
    }
    state.localStream.removeTrack(oldTrack);state.localStream.addTrack(nextTrack);oldTrack.stop();
    state.cameraFacing=nextFacing;
    if(!state.screenStream){
      const localVideo=$(groupCallTileId(user.id)+"-video");
      if(localVideo){localVideo.srcObject=state.localStream;localVideo.classList.toggle("hidden",!nextTrack.enabled);localVideo.play().catch(()=>{});}
      $(groupCallTileId(user.id)+"-avatar")?.classList.toggle("hidden",!!nextTrack.enabled);
    }
    setGroupCallControls();
    for(const peerId of state.peers.keys())if(!state.screenStream)sendGroupCallSignal("camera",state,peerId,{enabled:nextTrack.enabled,sharing:false}).catch(()=>{});
    groupCallStatus("Camera switched.");
  }catch(error){alert("Could not flip the group-call camera: "+(error.message||error));}
}

async function startGroupScreenShare(){
  const state=groupCallState;if(!state?.localStream){alert("Join the group call before sharing your screen.");return;}
  let displayStream=null;const replaced=[];
  try{
    displayStream=await requestChatlyScreenCapture();
    if(groupCallState?.id!==state.id||state.closing){displayStream.getTracks().forEach(track=>track.stop());return;}
    const screenTrack=displayStream.getVideoTracks()[0];
    if(!screenTrack)throw new Error("The screen picker did not provide a video track.");
    // Set this before replacing senders so any peer created during this operation
    // starts with the screen track rather than the camera track.
    state.screenStream=displayStream;state.screenTrack=screenTrack;
    for(const [peerId,peer] of state.peers){
      if(!peer.pc)continue;
      const sender=getChatlyVideoSender(peer.pc,peer.videoSender);
      if(!sender)throw new Error("The video connection to "+peer.name+" is not ready. Try again in a moment.");
      const previousTrack=sender.track;
      await sender.replaceTrack(screenTrack);
      peer.videoSender=sender;
      replaced.push({peerId,sender,previousTrack});
    }
    state.screenSenders=replaced;
    const localVideo=$(groupCallTileId(user.id)+"-video");
    if(localVideo){localVideo.srcObject=displayStream;localVideo.classList.remove("hidden");localVideo.play().catch(()=>{});}
    $(groupCallTileId(user.id)+"-avatar")?.classList.add("hidden");
    const localLabel=$(groupCallTileId(user.id))?.querySelector(".group-call-tile-name");
    if(localLabel)localLabel.textContent=displayName(profile)+" (You · Sharing screen)";
    $("groupShareScreen").textContent="Stop sharing";$("groupShareScreen").classList.add("share-active");
    groupCallStatus("You're sharing your screen with the group.");
    for(const peerId of state.peers.keys())sendGroupCallSignal("camera",state,peerId,{enabled:true,sharing:true}).catch(error=>console.warn("Could not sync group screen-share state:",error));
    screenTrack.onended=()=>{if(groupCallState?.id===state.id)stopGroupScreenShare();};
  }catch(error){
    // Roll back any peers already switched if one peer fails.
    for(const item of replaced){try{await item.sender.replaceTrack(item.previousTrack||state.localStream.getVideoTracks()[0]||null);}catch(rollbackError){console.warn("Could not roll back a partial screen share:",rollbackError);}}
    if(state.screenStream===displayStream){state.screenStream=null;state.screenTrack=null;state.screenSenders=[];}
    displayStream?.getTracks?.().forEach(track=>{track.onended=null;track.stop();});
    if(error.name!=="AbortError")alert("Could not share your screen: "+(error.message||error));
  }
}
async function stopGroupScreenShare(){
  const state=groupCallState;if(!state?.screenStream)return;
  const display=state.screenStream;state.screenStream=null;state.screenTrack=null;
  const camera=state.localStream?.getVideoTracks?.()[0];
  for(const [peerId,peer] of state.peers){
    const sender=getChatlyVideoSender(peer.pc,peer.videoSender);
    if(sender){try{await sender.replaceTrack(camera||null);peer.videoSender=sender;}catch(error){console.warn("Could not restore group camera:",error);}}
  }
  display.getTracks().forEach(track=>{track.onended=null;track.stop();});
  const localVideo=$(groupCallTileId(user.id)+"-video");
  if(localVideo){localVideo.srcObject=state.localStream;localVideo.classList.toggle("hidden",!camera?.enabled);localVideo.play().catch(()=>{});}
  $(groupCallTileId(user.id)+"-avatar")?.classList.toggle("hidden",!!camera?.enabled);
  const localLabel=$(groupCallTileId(user.id))?.querySelector(".group-call-tile-name");
  if(localLabel)localLabel.textContent=displayName(profile)+" (You)";
  $("groupShareScreen").textContent="Share screen";$("groupShareScreen").classList.remove("share-active");
  for(const peerId of state.peers.keys())sendGroupCallSignal("camera",state,peerId,{enabled:!!camera?.enabled,sharing:false}).catch(()=>{});
  groupCallStatus("Screen sharing stopped.");
}
$("groupShareScreen").onclick=()=>groupCallState?.screenStream?stopGroupScreenShare():startGroupScreenShare();
$("groupFlipCamera").onclick=flipGroupCamera;
$("groupCallChatToggle").onclick=()=>toggleInCallChat("group");
$("groupCallChatForm").onsubmit=event=>{event.preventDefault();sendInCallChatMessage("group");};
$("groupToggleMic").onclick=toggleGroupCallMic;
$("groupToggleCamera").onclick=toggleGroupCallCamera;
$("groupLeaveCall").onclick=leaveGroupCall;
$("groupEndCall").onclick=endGroupCallForEveryone;
$("attachButton").onclick=()=>$("chatFileInput").click();
$("chatFileInput").onchange=event=>uploadChatFiles(event.target.files);
function playIncomingMessageSound(message){
  if(!message||message.sender_id===user?.id)return;
  if(message.id&&playedMessageSoundIds.has(message.id))return;
  if(message.id){
    playedMessageSoundIds.add(message.id);
    if(playedMessageSoundIds.size>150)playedMessageSoundIds.clear();
  }
  playChatSound("message");
}
function subscribeToGroupMemberships(){
  if(!sb||!user||groupMembershipChannel)return;
  groupMembershipChannel=sb.channel("chatly-group-members-"+user.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_group_members",filter:"user_id=eq."+user.id},()=>{
      loadConversations().catch(error=>console.warn("Could not refresh group list:",error));
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"chat_group_members",filter:"user_id=eq."+user.id},()=>{
      loadConversations().catch(error=>console.warn("Could not refresh group list:",error));
      if(activeConversation&&!conversations.some(item=>item.id===activeConversation)){
        activeConversation=null;$("chatHead").classList.add("hidden");$("messages").classList.add("hidden");$("messageForm").classList.add("hidden");$("emptyState").classList.remove("hidden");
      }
    }).subscribe(status=>{
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Chatly group membership subscription:",status);
    });
}
function subscribeToMessageSounds(){
  if(!sb||!user||messageSoundChannel)return;
  messageSoundChannel=sb.channel("chatly-message-sounds-"+user.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"direct_messages"},payload=>{
      const message=payload?.new;
      if(message&&conversations.some(c=>!c.isGroup&&c.id===message.conversation_id))playIncomingMessageSound(message);
    })
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"chat_group_messages"},payload=>{
      const message=payload?.new;
      if(message&&conversations.some(c=>c.isGroup&&c.id===message.group_id))playIncomingMessageSound(message);
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"direct_messages"},payload=>{
      if(payload?.new)loadConversations().catch(error=>console.warn("Could not refresh direct-message preview:",error));
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"direct_messages"},payload=>{
      if(payload?.old)loadConversations().catch(error=>console.warn("Could not refresh direct-message preview:",error));
    })
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"chat_group_messages"},payload=>{
      if(payload?.new)loadConversations().catch(error=>console.warn("Could not refresh group-message preview:",error));
    })
    .on("postgres_changes",{event:"DELETE",schema:"public",table:"chat_group_messages"},payload=>{
      if(payload?.old)loadConversations().catch(error=>console.warn("Could not refresh group-message preview:",error));
    }).subscribe(status=>{
      if(status==="CHANNEL_ERROR"||status==="TIMED_OUT")console.warn("Chatly message sounds:",status);
    });
}
$("acceptCall").onclick=acceptIncomingCall;
$("declineCall").onclick=rejectIncomingCall;
$("cancelCall").onclick=()=>finishCall(true,"cancel");
$("endCall").onclick=()=>finishCall(true,callState?.phase==="outgoing"?"cancel":"hangup");
$("closeCall").onclick=()=>finishCall(false);
function toggleCallMicrophone(){
  const track=callState?.localStream?.getAudioTracks?.()[0];
  if(track){track.enabled=!track.enabled;refreshCallControls();}
}
function toggleCallCamera(){
  const call=callState;
  const track=call?.localStream?.getVideoTracks?.()[0];
  if(track){
    track.enabled=!track.enabled;
    call.localCameraOff=!track.enabled;
    if(!call.screenStream){
      $("localVideo").classList.toggle("hidden",!track.enabled);
      $("localCameraOff").classList.toggle("visible",!track.enabled);
    }
    setAvatar($("localCameraAvatar"),profile?.avatar_url,profile?.display_name||profile?.username||"You");
    refreshCallControls();
    if(call.peerUserId){
      sendCallSignal("camera",call,{enabled:call.screenStream?true:track.enabled,sharing:!!call.screenStream}).catch(error=>console.warn("Could not sync camera state:",error));
    }
  }
}
$("toggleMic").onclick=toggleCallMicrophone;
$("toggleMicRinging").onclick=toggleCallMicrophone;
$("toggleCamera").onclick=toggleCallCamera;
$("toggleCameraRinging").onclick=toggleCallCamera;
$("shareScreenCall").onclick=()=>callState?.screenStream?stopPrivateScreenShare():startPrivateScreenShare();
$("flipCameraCall").onclick=flipPrivateCamera;
$("callChatToggle").onclick=()=>toggleInCallChat("direct");
$("privateCallChatForm").onsubmit=event=>{event.preventDefault();sendInCallChatMessage("direct");};
$("searchChats").oninput=renderConversations;
$("newChat").onclick=newChatModal;$("emptyNewChat").onclick=newChatModal;
$("backToChats").onclick=()=>{$("app").classList.remove("chat-open");};
$("renameContact").onclick=()=>{
  const c=conversations.find(x=>x.id===activeConversation);if(!c)return;
  if(c.isGroup){manageGroupMembers(c);return;}
  const old=nickname(c.otherId,displayName(c.person));
  modal("Contact options",`<label class="small muted">Your contact name</label><input class="field" id="nicknameInput" maxlength="32" value="${esc(old)}"><div class="modal-actions"><button class="secondary" id="cancelModal">Cancel</button><button class="secondary" id="saveNickname">Save name</button></div><button class="secondary ${isBlockedByMe(c.otherId)?"":"board-danger"}" id="toggleBlockFromOptions" type="button">${isBlockedByMe(c.otherId)?"Unblock this person":"Block this person"}</button><button class="secondary board-danger" id="removeContact" type="button">Remove contact from my list</button><p class="small muted">Blocking prevents private messages and one-to-one calls in either direction. Existing messages stay visible. People in shared group chats can still see each other's group messages.</p><p class="small muted">Removing a contact only hides this conversation from your list.</p>`);
  $("cancelModal").onclick=closeModal;
  $("saveNickname").onclick=()=>{const val=$("nicknameInput").value.trim();if(val)saveNickname(c.otherId,val);closeModal();$("chatName").textContent=val||displayName(c.person);renderConversations();};
  $("toggleBlockFromOptions").onclick=async()=>{closeModal();await toggleActiveContactBlock();};
  $("removeContact").onclick=()=>removeContactConversation(c);
};
async function removeContactConversation(conversation){
  if(!conversation||conversation.isGroup)return;
  if(!confirm("Remove this contact from your Chatly list? This only hides the conversation for you; it does not delete the other person's copy."))return;
  const {error}=await sb.from("chat_hidden_conversations").insert({user_id:user.id,conversation_id:conversation.id});
  if(error&&error.code!=="23505"){alert("Could not remove contact: "+error.message);return;}
  closeModal();if(liveChannel){await sb.removeChannel(liveChannel);liveChannel=null;}
  activeConversation=null;$("app").classList.remove("chat-open");$("chatHead").classList.add("hidden");$("messages").classList.add("hidden");$("messageForm").classList.add("hidden");$("emptyState").classList.remove("hidden");
  await loadConversations();
}
function manageGroupMembers(group){
  const isOwner=group.created_by===user.id;
  const memberRows=(group.members||[]).map(member=>`<div class="board-member-row"><span class="member-name">${esc(displayName(member))}${member.id===user.id?" (You)":""}</span>${isOwner&&member.id!==user.id?`<button class="message-tool-btn board-danger" data-remove-member="${esc(member.id)}" type="button">Remove</button>`:""}</div>`).join("");
  modal("Group options",`<div class="small muted">Members</div><div>${memberRows||"No members found."}</div>${isOwner?`<label class="small muted">Group name</label><input class="field" id="groupRenameInput" maxlength="48" value="${esc(group.name)}"><button class="secondary" id="saveGroupName" type="button">Save group name</button>`:""}<p class="small muted">Add people by entering exact Chatly usernames.</p><input class="field" id="addGroupUsers" placeholder="username1, username2"><p class="small" id="addGroupError" style="color:#d84a5b"></p><div class="modal-actions"><button class="secondary" id="cancelModal">Close</button><button class="primary" id="addGroupPeople">Add people</button></div><button class="secondary board-danger" id="leaveGroup" type="button">Leave group</button>`);
  $("cancelModal").onclick=closeModal;
  $("addGroupPeople").onclick=async()=>{
    const names=[...new Set($("addGroupUsers").value.split(/[\n,;]+/).map(x=>x.trim().replace(/^@/,"")).filter(Boolean))];if(!names.length)return;
    $("addGroupError").textContent="Finding members…";
    try{const {data,error}=await sb.from("profiles").select("id,username").or(names.map(n=>"username.ilike."+n).join(","));if(error)throw error;const found=new Map((data||[]).map(p=>[p.username.toLowerCase(),p]));const missing=names.filter(n=>!found.has(n.toLowerCase()));if(missing.length)throw Error("Usernames not found: "+missing.join(", "));const ids=[...found.values()].map(p=>p.id).filter(id=>!group.memberIds.includes(id));const {error:rpcError}=await sb.rpc("chatly_add_group_members",{p_group_id:group.id,p_member_ids:ids});if(rpcError)throw rpcError;closeModal();await loadConversations();await openConversation(group.id);}catch(error){$("addGroupError").textContent=error.message||String(error);}
  };
  $("leaveGroup").onclick=async()=>{
    if(!confirm("Leave this group? It will disappear from your message list."))return;
    const {error}=await sb.from("chat_group_members").delete().eq("group_id",group.id).eq("user_id",user.id);
    if(error){alert("Could not leave group: "+error.message);return;}
    closeModal();if(activeGroupChannel){await sb.removeChannel(activeGroupChannel);activeGroupChannel=null;}activeConversation=null;
    $("app").classList.remove("chat-open");$("chatHead").classList.add("hidden");$("messages").classList.add("hidden");$("messageForm").classList.add("hidden");$("emptyState").classList.remove("hidden");await loadConversations();
  };
  if(isOwner){
    $("saveGroupName").onclick=async()=>{const name=$("groupRenameInput").value.trim();if(!name)return;const {error}=await sb.from("chat_groups").update({name}).eq("id",group.id).eq("created_by",user.id);if(error){alert("Could not rename group: "+error.message);return;}closeModal();await loadConversations();await openConversation(group.id);};
    document.querySelectorAll("[data-remove-member]").forEach(button=>button.onclick=async()=>{const memberId=button.dataset.removeMember;if(!confirm("Remove this person from the group?"))return;const {error}=await sb.from("chat_group_members").delete().eq("group_id",group.id).eq("user_id",memberId);if(error){alert("Could not remove member: "+error.message);return;}closeModal();await loadConversations();await openConversation(group.id);});
  }
}
function modal(title,body){$("modalRoot").innerHTML=`<div class="modal-back" id="modalBack"><section class="modal"><h2>${esc(title)}</h2>${body}</section></div>`;$("modalBack").onclick=e=>{if(e.target.id==="modalBack")closeModal();};}
function closeModal(){$("modalRoot").innerHTML="";}
$("settings").onclick=profileModal;
function profileModal(){
  const dark=document.body.classList.contains("dark");
  const accent=localStorage.getItem("chatly-accent")||"blue";
  const wallpaper=localStorage.getItem("chatly-wallpaper")||"plain";
  const textSize=localStorage.getItem("chatly-text-size")||"normal";
  const layout=localStorage.getItem("chatly-layout")||"spacious";
  const bubbleShape=localStorage.getItem("chatly-bubble-shape")||"rounded";
  const reducedMotion=localStorage.getItem("chatly-reduce-motion")==="on";
  modal("Customize Chatly",`<div class="settings-section">
      <div class="settings-section-title">Your profile</div>
      <div class="avatar avatar-preview" id="profilePreview"></div>
      <label class="small muted" for="displayNameInput">Display name</label>
      <input class="field" id="displayNameInput" maxlength="32" value="${esc(profile.display_name||profile.username)}">
      <label class="small muted" for="avatarFile">Profile picture</label>
      <input class="field" id="avatarFile" type="file" accept="image/*">
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Sounds</div>
      <label class="settings-toggle"><input id="soundEnabledInput" type="checkbox" ${soundEnabled?"checked":""}><span>Play sounds and ringtones while Chatly is open</span></label>
      <div class="sound-choice-block">
        <label class="small muted" for="messageSoundSelect">Message sound</label>
        <div class="sound-choice-row"><select class="field" id="messageSoundSelect">${Object.entries(MESSAGE_SOUND_OPTIONS).map(([value,label])=>`<option value="${value}" ${messageSoundChoice===value?"selected":""}>${label}</option>`).join("")}</select><button type="button" class="secondary" id="previewMessageSound">Preview</button></div>
        <label class="small muted" for="callRingtoneSelect">Incoming-call ringtone</label>
        <div class="sound-choice-row"><select class="field" id="callRingtoneSelect">${Object.entries(CALL_RINGTONE_OPTIONS).map(([value,label])=>`<option value="${value}" ${callRingtoneChoice===value?"selected":""}>${label}</option>`).join("")}</select><button type="button" class="secondary" id="previewCallRingtone">Preview</button></div>
        <div class="small muted" id="testSoundStatus" aria-live="polite">Choose a sound and tap Preview.</div>
        <p class="small muted sound-platform-note">Custom sounds play while Chatly is open. Background push alerts use the device's notification sound.</p>
      </div>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Appearance</div>
      <label class="small muted">Theme</label>
      <div class="theme-row"><button class="theme-choice ${!dark?"selected":""}" id="lightTheme" type="button">☀ Light</button><button class="theme-choice ${dark?"selected":""}" id="darkTheme" type="button">☾ Dark</button></div>
      <div class="settings-grid">
        <label class="settings-control"><span class="small muted">Accent color</span><select class="field" id="accentColorSelect">${Object.entries(CHATLY_ACCENTS).map(([key,value])=>`<option value="${key}" ${accent===key?"selected":""}>${value.label}</option>`).join("")}</select></label>
        <label class="settings-control"><span class="small muted">Chat wallpaper</span><select class="field" id="chatWallpaperSelect">${Object.entries(CHATLY_WALLPAPERS).map(([key,value])=>`<option value="${key}" ${wallpaper===key?"selected":""}>${value.label}</option>`).join("")}</select></label>
        <label class="settings-control"><span class="small muted">Message text size</span><select class="field" id="messageTextSizeSelect"><option value="small" ${textSize==="small"?"selected":""}>Small</option><option value="normal" ${textSize==="normal"?"selected":""}>Normal</option><option value="large" ${textSize==="large"?"selected":""}>Large</option></select></label>
        <label class="settings-control"><span class="small muted">Bubble shape</span><select class="field" id="bubbleShapeSelect"><option value="classic" ${bubbleShape==="classic"?"selected":""}>Classic</option><option value="rounded" ${bubbleShape==="rounded"?"selected":""}>Rounded</option><option value="pill" ${bubbleShape==="pill"?"selected":""}>Pill</option></select></label>
      </div>
      <label class="small muted" for="chatLayoutSelect">Message spacing</label>
      <select class="field" id="chatLayoutSelect"><option value="spacious" ${layout==="spacious"?"selected":""}>Comfortable</option><option value="compact" ${layout==="compact"?"selected":""}>Compact</option></select>
      <label class="settings-toggle"><input id="sendWithEnterInput" type="checkbox" ${sendWithEnter?"checked":""}><span>Press Enter to send (turn off to use Ctrl/⌘ + Enter)</span></label>
      <label class="settings-toggle"><input id="reduceMotionInput" type="checkbox" ${reducedMotion?"checked":""}><span>Reduce animations</span></label>
      <p class="settings-help">Appearance choices are saved on this device. Change them whenever you like.</p>
    </div>
    <div class="settings-section">
      <div class="settings-section-title">Notifications & privacy</div>
      <div class="push-settings-block"><strong>Push notifications</strong><p class="small muted">Get message alerts and incoming-call notifications when Chatly is in the background.</p><button class="secondary" id="pushNotificationsBtn" type="button">Enable notifications</button><div class="small muted" id="pushNotificationStatus" aria-live="polite">Checking notification support…</div></div>
      <button class="secondary" id="manageBlockedPeopleBtn" type="button">Manage blocked people</button>
    </div>
    <div class="modal-actions"><button class="secondary" id="cancelModal" type="button">Close</button><button class="primary" id="saveProfile" type="button">Save profile</button></div>`);
  const modalElement=document.querySelector("#modalBack .modal");if(modalElement)modalElement.classList.add("settings-modal");
  setAvatar($("profilePreview"),profile.avatar_url,profile.display_name||profile.username);
  $("cancelModal").onclick=closeModal;
  $("manageBlockedPeopleBtn").onclick=manageBlockedPeople;
  $("soundEnabledInput").onchange=()=>{
    soundEnabled=$("soundEnabledInput").checked;
    localStorage.setItem("chatly-sounds",soundEnabled?"on":"off");
    if(!soundEnabled){pendingChatSounds.length=0;stopCallRingtone();}
  };
  $("messageSoundSelect").onchange=()=>{messageSoundChoice=$("messageSoundSelect").value;localStorage.setItem("chatly-message-sound",messageSoundChoice);};
  $("callRingtoneSelect").onchange=()=>{callRingtoneChoice=$("callRingtoneSelect").value;localStorage.setItem("chatly-call-ringtone",callRingtoneChoice);};
  async function previewChatSound(kind){
    soundEnabled=true;$("soundEnabledInput").checked=true;localStorage.setItem("chatly-sounds","on");
    $("testSoundStatus").textContent="Playing preview…";
    const ready=await unlockChatAudio();
    if(ready){playChatSoundNow(audioContextInstance,kind,kind==="message"?messageSoundChoice:callRingtoneChoice);$("testSoundStatus").textContent=kind==="message"?"Message sound preview played.":"Call ringtone preview played.";}
    else $("testSoundStatus").textContent="Your browser blocked audio. Tap Preview again or check device sound.";
  }
  $("previewMessageSound").onclick=()=>previewChatSound("message");
  $("previewCallRingtone").onclick=()=>previewChatSound("incoming");
  $("accentColorSelect").onchange=()=>applyChatlyAccent($("accentColorSelect").value);
  $("chatWallpaperSelect").onchange=()=>applyChatlyWallpaper($("chatWallpaperSelect").value);
  $("messageTextSizeSelect").onchange=()=>applyChatlyTextSize($("messageTextSizeSelect").value);
  $("chatLayoutSelect").onchange=()=>applyChatlyLayout($("chatLayoutSelect").value);
  $("bubbleShapeSelect").onchange=()=>applyChatlyBubbleShape($("bubbleShapeSelect").value);
  $("sendWithEnterInput").onchange=()=>{sendWithEnter=$("sendWithEnterInput").checked;localStorage.setItem("chatly-send-enter",sendWithEnter?"on":"off");};
  $("reduceMotionInput").onchange=()=>applyChatlyReducedMotion($("reduceMotionInput").checked);
  $("pushNotificationsBtn").onclick=async()=>{
    const button=$("pushNotificationsBtn");button.disabled=true;
    try{if(button.dataset.enabled==="true")await disableChatlyPushNotifications();else await enableChatlyPushNotifications();await refreshPushSettingsUI();}
    catch(error){$("pushNotificationStatus").textContent=error.message||"Could not change notification settings.";}
    finally{button.disabled=false;}
  };
  refreshPushSettingsUI();
  $("lightTheme").onclick=()=>setTheme(false);$("darkTheme").onclick=()=>setTheme(true);
  $("saveProfile").onclick=async()=>{
    try{
      const display=$("displayNameInput").value.trim()||profile.username;
      let avatar_url=profile.avatar_url||null;const file=$("avatarFile").files[0];
      if(file){
        if(file.size>4*1024*1024)throw Error("Choose an image under 4 MB.");
        const ext=(file.name.split(".").pop()||"jpg").toLowerCase().replace(/[^a-z0-9]/g,"");
        const path=`${user.id}/${crypto.randomUUID()}.${ext}`;
        const up=await sb.storage.from("chat-avatars").upload(path,file,{upsert:false,contentType:file.type});
        if(up.error)throw up.error;avatar_url=sb.storage.from("chat-avatars").getPublicUrl(path).data.publicUrl;
      }
      const {data,error}=await sb.from("profiles").update({display_name:display,avatar_url}).eq("id",user.id).select().single();
      if(error)throw error;profile=data;$("myName").textContent=display;setAvatar($("myAvatar"),avatar_url,display);
      soundEnabled=$("soundEnabledInput").checked;messageSoundChoice=$("messageSoundSelect").value;callRingtoneChoice=$("callRingtoneSelect").value;
      localStorage.setItem("chatly-sounds",soundEnabled?"on":"off");localStorage.setItem("chatly-message-sound",messageSoundChoice);localStorage.setItem("chatly-call-ringtone",callRingtoneChoice);
      if(!soundEnabled){pendingChatSounds.length=0;stopCallRingtone();}
      closeModal();
    }catch(err){alert("Could not save profile: "+err.message);}
  };
}
function setTheme(dark){document.body.classList.toggle("dark",dark);localStorage.setItem("chatly-theme",dark?"dark":"light");$("lightTheme")?.classList.toggle("selected",!dark);$("darkTheme")?.classList.toggle("selected",dark);}
setTheme(localStorage.getItem("chatly-theme")==="dark");
applySavedChatlyCustomizations();
$("signOut").onclick=async()=>{await finishCall(false);await cleanupGroupCall(false);if(callSignalChannel)await sb.removeChannel(callSignalChannel);if(groupCallSignalChannel)await sb.removeChannel(groupCallSignalChannel);if(blockChannel)await sb.removeChannel(blockChannel);await sb.auth.signOut();};
window.addEventListener("pagehide",()=>{if(callState)stopCallMedia(callState);});
if("serviceWorker"in navigator&&location.protocol!=="file:"){
  chatlyServiceWorkerPromise=navigator.serviceWorker.register("./sw.js").then(reg=>{chatlyServiceWorkerRegistration=reg;return reg;}).catch(error=>{console.warn("Chatly service worker registration failed:",error);throw error;});
  navigator.serviceWorker.addEventListener("message",event=>{
    if(event.data?.type==="CHATLY_NOTIFICATION_CLICK"){
      checkPendingIncomingCalls().catch(error=>console.warn("Could not restore incoming call from notification:",error));
      if(event.data?.data?.conversationId){const id=event.data.data.conversationId;if(conversations.some(c=>c.id===id))openConversation(id);}
    }
  });
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&user)setTimeout(()=>checkPendingIncomingCalls().catch(()=>{}),650);});
start().catch(err=>{console.error(err);showError(err.message);});
