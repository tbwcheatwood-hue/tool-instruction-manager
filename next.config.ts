import type { NextConfig } from "next";

const consolidated = process.env.BUILD_CONSOLIDATED === "1";
const alsOrigin = (process.env.ALS_API_URL || "http://127.0.0.1:8888").replace(/\/$/, "");

const nextConfig: NextConfig = {
  ...(consolidated ? { output: "export" as const } : {}),
  images: { unoptimized: true },
  reactStrictMode: false,
  poweredByHeader: false,
  async redirects() {
    if (consolidated) {
      return [];
    }
    return [
      {
        source: "/als-studio",
        destination: "/als-studio/index.html",
        permanent: false,
      },
    ];
  },
  async rewrites() {
    if (consolidated) {
      return [];
    }
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
