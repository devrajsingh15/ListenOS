import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { userSettings, users } from "../../../../drizzle/schema";
import { eq } from "drizzle-orm";

// GET user settings
export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    if (!user.length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get settings
    const settings = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user[0].id))
      .limit(1);

    if (!settings.length) {
      // Return defaults
      return NextResponse.json({
        hotkey: "Control+Space",
        language: "en",
        startOnLogin: true,
        showInTray: true,
      });
    }

    return NextResponse.json(settings[0]);
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PUT update user settings
export async function PUT(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { hotkey, language, startOnLogin, showInTray } = body;

    // Find user
    const user = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, clerkUserId))
      .limit(1);

    if (!user.length) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Upsert settings
    const existing = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user[0].id))
      .limit(1);

    if (existing.length) {
      await db
        .update(userSettings)
        .set({
          hotkey: hotkey ?? existing[0].hotkey,
          language: language ?? existing[0].language,
          startOnLogin: startOnLogin ?? existing[0].startOnLogin,
          showInTray: showInTray ?? existing[0].showInTray,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(userSettings.userId, user[0].id));
    } else {
      await db.insert(userSettings).values({
        userId: user[0].id,
        hotkey: hotkey ?? "Control+Space",
        language: language ?? "en",
        startOnLogin: startOnLogin ?? true,
        showInTray: showInTray ?? true,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
