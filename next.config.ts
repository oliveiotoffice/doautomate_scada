import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.18.80'],
  images: {
    qualities: [100, 75],
  },
};

export default nextConfig;
