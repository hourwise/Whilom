/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Compile shared workspace packages from source (they ship raw TS).
  transpilePackages: [
    '@whilom/domain',
    '@whilom/database',
    '@whilom/validation',
    '@whilom/search',
  ],
};

export default nextConfig;
