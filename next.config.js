/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.178.77"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.themealdb.com",
      },
    ],
  },
}

module.exports = nextConfig
