import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Groq API for LLM processing
const GROQ_LLM_URL = "https://api.groq.com/openai/v1/chat/completions";

interface ProcessRequest {
  text: string;
  context?: {
    active_app?: string;
    selected_text?: string;
    os: string;
    mode: "dictation" | "command";
  };
  conversation_history?: string;
  custom_commands?: Array<{ trigger: string; name: string; id: string }>;
  dictation_style?: "formal" | "casual" | "very_casual";
}

interface VoiceActionResponse {
  action_type: string;
  payload: Record<string, unknown>;
  refined_text: string | null;
  response_text: string | null;
  requires_confirmation: boolean;
}

function normalizeInput(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,!?]$/, "")
    .replace(/, /g, " ")
    .replace(/\s+/g, " ");
}

function isFarewellPhrase(text: string): boolean {
  const t = normalizeInput(text);
  const farewell = new Set([
    "bye",
    "goodbye",
    "good bye",
    "see you",
    "see ya",
    "talk to you later",
    "catch you later",
    "ok bye",
    "okay bye",
    "thanks bye",
  ]);
  return farewell.has(t);
}

function isPowerControlAction(result: Pick<VoiceActionResponse, "action_type" | "payload">): boolean {
  if (result.action_type !== "SystemControl") return false;
  const action = String(result.payload?.action ?? "").toLowerCase();
  return action === "shutdown" || action === "restart" || action === "sleep";
}

export async function POST(request: NextRequest) {
  try {
    // Check for API key auth (desktop app) first
    const apiKey = request.headers.get("X-API-Key")?.trim();
    const validApiKey = process.env.LISTENOS_API_KEY?.trim();
    const hasConfiguredApiKey = !!validApiKey;
    
    // If valid API key provided, skip Clerk auth entirely
    let isAuthorized = !!(hasConfiguredApiKey && apiKey && apiKey === validApiKey);
    
    // Only check Clerk auth if no valid API key
    if (!isAuthorized) {
      try {
        const { userId } = await auth();
        isAuthorized = !!userId;
      } catch {
        // Clerk auth failed, that's ok if we have API key
        isAuthorized = false;
      }
    }
    
    if (!isAuthorized) {
      console.log("Auth failed for process request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get API key from environment
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
      return NextResponse.json(
        { error: "Server configuration error: Missing API key" },
        { status: 500 }
      );
    }

    const body: ProcessRequest = await request.json();
    const { text, context, conversation_history, custom_commands, dictation_style } = body;

    if (!text) {
      return NextResponse.json({ error: "No text provided" }, { status: 400 });
    }

    // Check for local commands first (fast path)
    const localAction = detectLocalCommand(text);
    if (localAction) {
      if (isFarewellPhrase(text) && isPowerControlAction(localAction as VoiceActionResponse)) {
        return NextResponse.json({
          action_type: "NoAction",
          payload: {
            blocked_action: "power_control",
            reason: "farewell_phrase",
          },
          refined_text: null,
          response_text:
            "Ignoring shutdown/restart because this sounded like a goodbye phrase.",
          requires_confirmation: false,
        });
      }
      return NextResponse.json(localAction);
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(context, custom_commands, dictation_style);

    // Call Groq LLM
    const response = await fetch(GROQ_LLM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `User request: "${text}"\n\nAnalyze and respond with the appropriate action.`,
          },
        ],
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq LLM error:", errorText);
      // Fallback to dictation mode
      return NextResponse.json({
        action_type: "TypeText",
        payload: {},
        refined_text: text,
        response_text: null,
        requires_confirmation: false,
      });
    }

    const result = await response.json();
    const content = result.choices?.[0]?.message?.content || "{}";

    try {
      const parsed = JSON.parse(content);
      const llmAction = parseLLMResponse(parsed, text);
      if (isFarewellPhrase(text) && isPowerControlAction(llmAction)) {
        return NextResponse.json({
          action_type: "NoAction",
          payload: {
            blocked_action: "power_control",
            reason: "farewell_phrase",
          },
          refined_text: null,
          response_text:
            "Ignoring shutdown/restart because this sounded like a goodbye phrase.",
          requires_confirmation: false,
        });
      }
      return NextResponse.json(llmAction);
    } catch {
      // Fallback to dictation
      return NextResponse.json({
        action_type: "TypeText",
        payload: {},
        refined_text: text,
        response_text: null,
        requires_confirmation: false,
      });
    }
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Detect simple commands locally (no LLM needed)
function detectLocalCommand(text: string): object | null {
  const t = normalizeInput(text);

  const wordCount = t.split(/\s+/).length;
  if (wordCount > 6) return null;

  // Volume control
  if (t.includes("volume") || t === "mute" || t === "unmute") {
    const direction = t.includes("up") || t.includes("louder") ? "up" :
                     t.includes("down") || t.includes("quieter") ? "down" : "mute";
    return { action_type: "VolumeControl", payload: { direction } };
  }

  // Media control
  if (t === "play" || t === "pause" || t === "resume") {
    return { action_type: "SpotifyControl", payload: { action: "play_pause" } };
  }
  if (t === "next" || t === "skip" || t === "next song") {
    return { action_type: "SpotifyControl", payload: { action: "next" } };
  }
  if (t === "previous" || t === "previous song") {
    return { action_type: "SpotifyControl", payload: { action: "previous" } };
  }

  // System controls
  if (t.includes("lock") && (t.includes("computer") || t.includes("screen") || t === "lock")) {
    return { action_type: "SystemControl", payload: { action: "lock" } };
  }
  if (t.includes("screenshot")) {
    return { action_type: "SystemControl", payload: { action: "screenshot" } };
  }
  const hasNegation =
    t.includes("don't") ||
    t.includes("dont") ||
    t.includes("do not") ||
    t.includes("not ") ||
    t.includes("never") ||
    t.includes("cancel");
  if (
    !hasNegation &&
    (t === "sleep" ||
      t.startsWith("sleep ") ||
      t.startsWith("put computer to sleep") ||
      t.startsWith("put pc to sleep"))
  ) {
    return { action_type: "SystemControl", payload: { action: "sleep" } };
  }

  // App opening
  const openMatch = t.match(/^(?:open|launch|start)\s+(.+)$/);
  if (openMatch) {
    const app = openMatch[1];
    const webApps: Record<string, string> = {
      youtube: "https://youtube.com",
      gmail: "https://gmail.com",
      twitter: "https://twitter.com",
      github: "https://github.com",
      netflix: "https://netflix.com",
    };
    if (webApps[app]) {
      return { action_type: "OpenUrl", payload: { url: webApps[app] } };
    }
    return { action_type: "OpenApp", payload: { app } };
  }

  // Web search
  const searchMatch = t.match(/^(?:search|google|look up)\s+(?:for\s+)?(.+)$/);
  if (searchMatch) {
    return { action_type: "WebSearch", payload: { query: searchMatch[1] } };
  }

  return null;
}

// Build system prompt for LLM
function buildSystemPrompt(
  context?: ProcessRequest["context"],
  customCommands?: ProcessRequest["custom_commands"],
  dictationStyle?: string
): string {
  const os = context?.os || "unknown";
  const mode = context?.mode || "command";

  let prompt = `You are ListenOS, a voice assistant. Determine if the user wants to execute a COMMAND or just TYPE text.

CONTEXT:
- OS: ${os}
- Mode: ${mode}
- Active App: ${context?.active_app || "unknown"}

ACTIONS (respond with JSON):

1. TypeText - Type/dictate text into active window
   {"action": "type_text", "refined_text": "text to type"}
   USE FOR: messages, sentences, greetings being typed (not commands)

2. OpenApp - Open an application  
   {"action": "open_app", "app": "app_name"}
   TRIGGERS: "open [app]", "launch [app]", "start [app]"

3. OpenUrl - Open URL in browser
   {"action": "open_url", "url": "https://..."}
   TRIGGERS: "open youtube", "go to gmail", "open netflix"

4. WebSearch - Search the web
   {"action": "web_search", "query": "search terms"}
   TRIGGERS: "search for [x]", "google [x]", "look up [x]"

5. VolumeControl - System volume
   {"action": "volume_control", "direction": "up|down|mute"}
   TRIGGERS: "volume up/down", "mute", "louder", "quieter"

6. SystemControl - System actions
   {"action": "system_control", "system_action": "lock|sleep|screenshot"}
   TRIGGERS: "lock computer", "take screenshot", "sleep"

7. SpotifyControl - Media control
   {"action": "spotify_control", "media_action": "play_pause|next|previous"}
   TRIGGERS: "play", "pause", "next song", "previous"
`;

  if (customCommands && customCommands.length > 0) {
    prompt += `\nCUSTOM COMMANDS:\n`;
    customCommands.forEach((cmd) => {
      prompt += `- "${cmd.trigger}" -> command "${cmd.name}" (id: ${cmd.id})\n`;
    });
  }

  prompt += `
RULES:
1. "open youtube/gmail/netflix" = OpenUrl (web apps)
2. "open chrome/notepad/vscode" = OpenApp (desktop apps)
3. "hello", "how are you", sentences = TypeText (dictation)
4. Explicit commands with trigger words = appropriate action
5. When in doubt, TypeText
6. Always respond with valid JSON`;

  return prompt;
}

// Parse LLM response into standardized format
function parseLLMResponse(parsed: Record<string, unknown>, originalText: string): VoiceActionResponse {
  const action = parsed.action as string || "type_text";

  const actionMap: Record<string, string> = {
    type_text: "TypeText",
    open_app: "OpenApp",
    open_url: "OpenUrl",
    web_search: "WebSearch",
    volume_control: "VolumeControl",
    system_control: "SystemControl",
    spotify_control: "SpotifyControl",
    no_action: "TypeText",
  };

  const actionType = actionMap[action] || "TypeText";

  // Build payload based on action type
  let payload: Record<string, unknown> = {};
  let refinedText: string | null = null;

  switch (actionType) {
    case "TypeText":
      refinedText = (parsed.refined_text as string) || (parsed.text as string) || originalText;
      break;
    case "OpenApp":
      payload = { app: parsed.app || parsed.application };
      break;
    case "OpenUrl":
      payload = { url: parsed.url };
      break;
    case "WebSearch":
      payload = { query: parsed.query || parsed.search_query };
      break;
    case "VolumeControl":
      payload = { direction: parsed.direction || "up" };
      break;
    case "SystemControl":
      payload = { action: parsed.system_action || parsed.action_type };
      break;
    case "SpotifyControl":
      payload = { action: parsed.media_action || "play_pause" };
      break;
  }

  return {
    action_type: actionType,
    payload,
    refined_text: refinedText,
    response_text: null,
    requires_confirmation: false,
  };
}
