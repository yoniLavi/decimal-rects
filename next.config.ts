import type { NextConfig } from "next";

// Static export so the app can be hosted on GitHub Pages. A project site is
// served under /<repo>/, so CI sets PAGES_BASE_PATH; local dev stays at "/".
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
};

export default nextConfig;
