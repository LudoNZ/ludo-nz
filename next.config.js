/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // how long the CDN may hand out a page's old HTML while it fetches a
  // fresh copy (Next's default is a year). Old HTML from before a deploy
  // asks for script files the new build doesn't have and the page
  // crashes, so keep the window short: past this, a visitor waits for the
  // fresh page instead. Must be longer than any page's revalidate (the
  // root layout's is an hour).
  expireTime: 2 * 60 * 60,
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
