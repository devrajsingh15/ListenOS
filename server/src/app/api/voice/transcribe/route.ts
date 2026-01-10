import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

// Groq API for transcription
const GROQ_API_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function POST(request: NextRequest) {
  try {
    // Check for API key auth (desktop app) first
    const apiKey = request.headers.get("X-API-Key");
    const validApiKey = process.env.LISTENOS_API_KEY || "listenos-desktop-app";
    
    // If valid API key provided, skip Clerk auth entirely
    let isAuthorized = apiKey === validApiKey;
    
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
      console.log("Auth failed - apiKey:", apiKey, "validApiKey:", validApiKey);
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

    // Get the form data with audio file
    const formData = await request.formData();
    const audioFile = formData.get("file") as File;
    const hints = formData.get("hints") as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Build request to Groq
    const groqFormData = new FormData();
    groqFormData.append("file", audioFile);
    groqFormData.append("model", "whisper-large-v3-turbo");
    groqFormData.append("response_format", "json");
    groqFormData.append("language", "en");

    if (hints) {
      groqFormData.append("prompt", `Vocabulary hints: ${hints}`);
    }

    // Call Groq API
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqKey}`,
      },
      body: groqFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Groq API error:", errorText);
      return NextResponse.json(
        { error: "Transcription failed", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({
      text: result.text || "",
      confidence: 0.95,
      duration_ms: 0,
      is_final: true,
    });
  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
