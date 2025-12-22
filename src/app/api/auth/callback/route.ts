import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db, users, subscriptions, userSettings } from "@/lib/db";
import { eq } from "drizzle-orm";

// Force dynamic rendering - this route should not be pre-rendered
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId: clerkUserId } = await auth();
    
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { email, firstName, lastName, profilePicture } = body;

    // Check if user exists in our database
    let dbUser = await db.query.users.findFirst({
      where: eq(users.clerkUserId, clerkUserId),
    });

    if (!dbUser) {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          clerkUserId,
          email: email || "",
          firstName,
          lastName,
          profilePicture,
        })
        .returning();

      dbUser = newUser;

      // Create default subscription (free plan)
      await db.insert(subscriptions).values({
        userId: dbUser.id,
        plan: "free",
        status: "active",
      });

      // Create default settings
      await db.insert(userSettings).values({
        userId: dbUser.id,
      });
    } else {
      // Update existing user info
      await db
        .update(users)
        .set({
          email: email || dbUser.email,
          firstName,
          lastName,
          profilePicture,
          updatedAt: new Date(),
        })
        .where(eq(users.id, dbUser.id));
    }

    // Fetch updated user with relations
    const fullUser = await db.query.users.findFirst({
      where: eq(users.id, dbUser.id),
      with: {
        subscription: true,
        settings: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: fullUser?.id,
        email: fullUser?.email,
        firstName: fullUser?.firstName,
        lastName: fullUser?.lastName,
        profilePicture: fullUser?.profilePicture,
      },
      subscription: fullUser?.subscription,
      settings: fullUser?.settings,
    });
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Handle GET for redirect flow
export async function GET() {
  return NextResponse.redirect(new URL("/"));
}
