import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const redirectUrl = searchParams.get("redirect_url");
  
  try {
    const { userId, getToken } = await auth();
    
    if (!userId) {
      // Not authenticated, redirect to sign-in
      const signInUrl = new URL("/sign-in", request.url);
      if (redirectUrl) {
        signInUrl.searchParams.set("redirect_url", redirectUrl);
      }
      return NextResponse.redirect(signInUrl);
    }

    // Get user details
    const user = await currentUser();
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get session token
    const token = await getToken();

    // Prepare user data for the desktop app
    const userData = {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      profilePicture: user.imageUrl || "",
    };

    // If redirect_url is provided (desktop app callback), redirect there with token
    if (redirectUrl && redirectUrl.startsWith("listenos://")) {
      const callbackUrl = new URL(redirectUrl);
      callbackUrl.searchParams.set("token", token || "");
      callbackUrl.searchParams.set("user", encodeURIComponent(JSON.stringify(userData)));
      return NextResponse.redirect(callbackUrl.toString());
    }

    // Otherwise return JSON response
    return NextResponse.json({
      success: true,
      user: userData,
      token,
    });
  } catch (error) {
    console.error("Auth callback error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}
