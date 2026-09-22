/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep development output separate so a concurrent production build cannot
  // invalidate the dev server's chunk manifest.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
};

export default nextConfig;
