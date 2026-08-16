/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile shared workspace packages from source (they ship raw TS).
  transpilePackages: [
    '@heritage/domain',
    '@heritage/database',
    '@heritage/validation',
    '@heritage/search',
  ],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
