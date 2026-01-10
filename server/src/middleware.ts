import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/auth(.*)",
  "/api/webhooks(.*)",
  "/api/health",
]);

// Routes that need API key auth instead of Clerk (for desktop app)
const isDesktopApiRoute = createRouteMatcher([
  "/api/voice/(.*)",
  "/api/settings",
]);

export default clerkMiddleware(async (auth, request) => {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
      },
    });
  }

  // Allow public routes without authentication
  if (isPublicRoute(request)) {
    return;
  }

  // For desktop API routes, check for either Clerk auth or API key
  if (isDesktopApiRoute(request)) {
    const apiKey = request.headers.get("X-API-Key");
    
    // If API key is provided, bypass Clerk auth (let route handler validate)
    if (apiKey) {
      return NextResponse.next();
    }
    
    // Otherwise, require Clerk auth (will be checked by route handler)
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
