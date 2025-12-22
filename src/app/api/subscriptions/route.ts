import { NextRequest, NextResponse } from "next/server";
import { db, subscriptions } from "@/lib/db";
import { eq } from "drizzle-orm";

// Force dynamic rendering - this route should not be pre-rendered
export const dynamic = "force-dynamic";

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

// GET /api/subscriptions - Get current user's subscription
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, session.userId),
    });

    if (!subscription) {
      // Create default free subscription if none exists
      const [newSubscription] = await db
        .insert(subscriptions)
        .values({
          userId: session.userId,
          plan: "free",
          status: "active",
        })
        .returning();

      return NextResponse.json({ subscription: newSubscription });
    }

    return NextResponse.json({ subscription });
  } catch (error) {
    console.error("Get subscription error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// Subscription plans info
export async function OPTIONS() {
  return NextResponse.json({
    plans: [
      {
        id: "free",
        name: "Free",
        price: 0,
        features: [
          "50 voice commands/day",
          "Basic transcription",
          "Standard actions",
        ],
      },
      {
        id: "pro",
        name: "Pro",
        price: 9.99,
        features: [
          "Unlimited voice commands",
          "Advanced AI responses",
          "Priority processing",
          "Custom commands",
          "Email support",
        ],
      },
      {
        id: "team",
        name: "Team",
        price: 29.99,
        features: [
          "Everything in Pro",
          "Team management",
          "Shared custom commands",
          "Analytics dashboard",
          "Priority support",
        ],
      },
    ],
  });
}
