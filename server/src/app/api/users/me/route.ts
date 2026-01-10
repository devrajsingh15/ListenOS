import { NextRequest, NextResponse } from "next/server";
import { db, users, userSettings } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET(request: NextRequest) {
  try {
    const body = await request.json();
    const { clerkUserId } = body;

    if (!clerkUserId) {
      return NextResponse.json({ error: "Missing Clerk user ID" }, { status: 400 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
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
  try {
    const body = await request.json();
    const { clerkUserId, hotkey, language, startOnLogin, showInTray } = body;

    if (!clerkUserId) {
      return NextResponse.json({ error: "Missing Clerk user ID" }, { status: 400 });
    }

    // First get the user to find their internal ID
    const user = await db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [updatedSettings] = await db
      .update(userSettings)
      .set({
        ...(hotkey !== undefined && { hotkey }),
        ...(language !== undefined && { language }),
        ...(startOnLogin !== undefined && { startOnLogin }),
        ...(showInTray !== undefined && { showInTray }),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(userSettings.userId, user.id))
      .returning();

    return NextResponse.json({ settings: updatedSettings });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
