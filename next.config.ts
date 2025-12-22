import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable static export for Tauri
  output: "export",
  
  // Disable image optimization for static export
  images: {
    unoptimized: true,
  },
  
  // Ensure trailing slashes for static files
  trailingSlash: true,

  // Disable dev indicator that might show up in the overlay
  devIndicators: false,
};

export default nextConfig;
