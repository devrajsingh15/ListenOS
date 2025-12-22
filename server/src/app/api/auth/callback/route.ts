import { NextRequest, NextResponse } from "next/server";
import { db, users, subscriptions, userSettings } from "@/lib/db";
import { eq } from "drizzle-orm";

const WORKOS_API_KEY = process.env.WORKOS_API_KEY;
const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID;

interface WorkOSUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  profile_picture_url?: string;
}

interface WorkOSAuthResponse {
  user: WorkOSUser;
  access_token: string;
  refresh_token: string;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Missing authorization code" }, { status: 400 });
  }

  try {
    // Exchange code for tokens with WorkOS
    const tokenResponse = await fetch(
      "https://api.workos.com/user_management/authenticate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: WORKOS_CLIENT_ID,
          client_secret: WORKOS_API_KEY,
          grant_type: "authorization_code",
          code,
        }),
      }
    );

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error("WorkOS auth error:", error);
      return NextResponse.json({ error: "Authentication failed" }, { status: 401 });
    }

    const authData: WorkOSAuthResponse = await tokenResponse.json();
    const workosUser = authData.user;

    // Check if user exists in our database
    let dbUser = await db.query.users.findFirst({
      where: eq(users.workosUserId, workosUser.id),
    });

    if (!dbUser) {
      // Create new user
      const [newUser] = await db
        .insert(users)
        .values({
          workosUserId: workosUser.id,
          email: workosUser.email,
          firstName: workosUser.first_name,
          lastName: workosUser.last_name,
          profilePicture: workosUser.profile_picture_url,
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
          email: workosUser.email,
          firstName: workosUser.first_name,
          lastName: workosUser.last_name,
          profilePicture: workosUser.profile_picture_url,
          updatedAt: new Date(),
        })
        .where(eq(users.id, dbUser.id));
    }

    // Create session token
    const sessionData = {
      userId: dbUser.id,
      workosUserId: workosUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profilePicture: dbUser.profilePicture,
      accessToken: authData.access_token,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    const token = Buffer.from(JSON.stringify(sessionData)).toString("base64");

    // Redirect to deep link for Tauri app
    const redirectUrl = `listenos://auth-callback?token=${encodeURIComponent(token)}`;

    return NextResponse.redirect(redirectUrl);
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
