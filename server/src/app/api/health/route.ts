import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    services: {
      groq: !!process.env.GROQ_API_KEY,
      deepgram: !!process.env.DEEPGRAM_API_KEY,
      database: !!process.env.DATABASE_URL,
      clerk: !!process.env.CLERK_SECRET_KEY,
    },
  });
}
