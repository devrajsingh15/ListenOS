import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  "/auth/sign-in(.*)",
  "/auth/sign-up(.*)",
  "/auth/callback(.*)",
  "/assistant(.*)", // Voice overlay is always accessible
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // Allow public routes without authentication
  if (isPublicRoute(request)) {
    return;
  }
  
  // For the main app routes, don't force auth - just let the app handle it
  // This allows the app to show signed-out state gracefully
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
