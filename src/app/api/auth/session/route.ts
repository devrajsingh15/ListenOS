import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

// Force dynamic rendering - this route should not be pre-rendered
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();

    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch user data from database
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

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
      },
      subscription: user.subscription,
      settings: user.settings,
    });
  } catch (error) {
    console.error("Session fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST endpoint for getting session by Clerk user ID
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clerkUserId } = body;

    if (!clerkUserId) {
      return NextResponse.json({ error: "Missing Clerk user ID" }, { status: 400 });
    }

    // Get user from our database
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

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePicture: user.profilePicture,
      },
      subscription: user.subscription,
      settings: user.settings,
    });
  } catch (error) {
    console.error("Session fetch error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
