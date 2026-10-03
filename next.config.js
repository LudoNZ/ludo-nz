/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.178.77"],
  // the interview prep lessons are markdown read off disk at runtime by a
  // server action; make sure the deployed server bundle includes them
  outputFileTracingIncludes: {
    "/interview-prep": ["./src/content/interview-prep/**/*"],
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
