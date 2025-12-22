import { NextRequest, NextResponse } from "next/server";
import { db, users, userSettings } from "@/lib/db";
import { eq } from "drizzle-orm";

interface SessionData {
  userId: string;
  exp: number;
}

function parseToken(token: string): SessionData | null {
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    const data = JSON.parse(decoded) as SessionData;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function getSession(request: NextRequest): SessionData | null {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return parseToken(authHeader.slice(7));
}

export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
      with: {
        subscription: true,
        settings: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Get user error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { hotkey, language, startOnLogin, showInTray } = body;

    const [updatedSettings] = await db
      .update(userSettings)
      .set({
        ...(hotkey !== undefined && { hotkey }),
        ...(language !== undefined && { language }),
        ...(startOnLogin !== undefined && { startOnLogin }),
        ...(showInTray !== undefined && { showInTray }),
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, session.userId))
      .returning();

    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
