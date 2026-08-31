/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allows the seeded mobile fixture server to run beside a normal dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
}

export default nextConfig
