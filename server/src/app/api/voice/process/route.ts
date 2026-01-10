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

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get API key from environment
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
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
      return NextResponse.json(localAction);
    }

    // Build system prompt
    const systemPrompt = buildSystemPrompt(context, custom_commands, dictation_style);

    // Call Groq LLM
    const response = await fetch(GROQ_LLM_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
      return NextResponse.json(parseLLMResponse(parsed, text));
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
  const t = text.trim().toLowerCase()
    .replace(/[.,!?]$/, "")
    .replace(/, /g, " ");

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
  if (t.includes("sleep") && (t.includes("computer") || t === "sleep")) {
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

  let prompt = `You are ListenOS, an AI voice assistant that converts spoken commands into executable actions.

CURRENT CONTEXT:
- Operating System: ${os}
- Mode: ${mode}
- Active App: ${context?.active_app || "unknown"}

AVAILABLE ACTIONS (respond with JSON):
1. TypeText - Type text into active window
   {"action": "type_text", "refined_text": "cleaned up text to type"}

2. OpenApp - Open an application
   {"action": "open_app", "app": "app_name"}

3. OpenUrl - Open a URL in browser
   {"action": "open_url", "url": "https://..."}

4. WebSearch - Search the web
   {"action": "web_search", "query": "search terms"}

5. VolumeControl - Control system volume
   {"action": "volume_control", "direction": "up|down|mute"}

6. SystemControl - System actions
   {"action": "system_control", "system_action": "lock|sleep|screenshot|shutdown|restart"}

7. SpotifyControl - Media control
   {"action": "spotify_control", "media_action": "play_pause|next|previous"}

8. Respond - Answer a question conversationally
   {"action": "respond", "response": "your answer here"}

9. NoAction - When no action is needed
   {"action": "no_action"}
`;

  if (customCommands && customCommands.length > 0) {
    prompt += `\n\nCUSTOM COMMANDS (user-defined):\n`;
    customCommands.forEach((cmd) => {
      prompt += `- "${cmd.trigger}" -> Execute command "${cmd.name}" (id: ${cmd.id})\n`;
    });
  }

  if (dictationStyle) {
    prompt += `\n\nDICTATION STYLE: ${dictationStyle}`;
    if (dictationStyle === "casual" || dictationStyle === "very_casual") {
      prompt += " - Use less formal punctuation and capitalization";
    }
  }

  prompt += `\n\nRULES:
1. For dictation mode or unclear intent, use TypeText with cleaned-up text
2. For questions about facts/knowledge, use Respond
3. For app/system commands, use the appropriate action
4. Always respond with valid JSON`;

  return prompt;
}

// Parse LLM response into standardized format
function parseLLMResponse(parsed: Record<string, unknown>, originalText: string): object {
  const action = parsed.action as string || "type_text";

  const actionMap: Record<string, string> = {
    type_text: "TypeText",
    open_app: "OpenApp",
    open_url: "OpenUrl",
    web_search: "WebSearch",
    volume_control: "VolumeControl",
    system_control: "SystemControl",
    spotify_control: "SpotifyControl",
    respond: "Respond",
    no_action: "NoAction",
    clarify: "Clarify",
  };

  const actionType = actionMap[action] || "TypeText";

  // Build payload based on action type
  let payload: Record<string, unknown> = {};
  let refinedText: string | null = null;
  let responseText: string | null = null;

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
    case "Respond":
    case "Clarify":
      responseText = (parsed.response as string) || (parsed.message as string) || "";
      break;
  }

  return {
    action_type: actionType,
    payload,
    refined_text: refinedText,
    response_text: responseText,
    requires_confirmation: false,
  };
}
