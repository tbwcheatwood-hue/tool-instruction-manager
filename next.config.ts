import type { NextConfig } from "next";

const alsOrigin = (process.env.ALS_API_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

const nextConfig: NextConfig = {
  // StrictMode remounts embeds in dev and was loading ALS twice (doubled UI / GPU crash).
  reactStrictMode: false,
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: "/als-studio",
        destination: "/als-studio/index.html",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/als-studio",
        destination: `${alsOrigin}/`,
      },
      {
        source: "/als-studio/:path*",
        destination: `${alsOrigin}/:path*`,
      },
    ];
  },
};

export default nextConfig;
