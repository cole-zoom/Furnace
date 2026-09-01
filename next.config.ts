import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Promoted out of experimental in Next 16. Turns a typo'd <Link href> into a
  // build error instead of a 404 someone finds in production.
  typedRoutes: true,

  // This app is one person's private data. Nothing here should ever be indexed,
  // framed, or have its URLs leaked to third parties via the referer header.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
