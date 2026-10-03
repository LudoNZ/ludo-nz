/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.178.77"],
  // the interview prep lessons and seed SQL are read off disk at runtime by
  // server actions; make sure the deployed server bundle includes them
  outputFileTracingIncludes: {
    "/interview-prep": ["./src/content/interview-prep/**/*", "./interview-prep/db/seed.sql"],
  },
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
