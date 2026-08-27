/** @type {import('next').NextConfig} */
const nextConfig = {
  // These packages ship native bindings or lazily-resolved assets that must not be
  // bundled by webpack/turbopack. Keeping them external is what makes the converter
  // module work in both `next dev` and a standalone production build.
  serverExternalPackages: ['sharp', 'unpdf', 'mammoth', 'pdf-lib'],
  output: 'standalone',
  experimental: {
    // Upload cap for server actions is unused (we post to route handlers), but the
    // body-size guard for route handlers is enforced in src/lib/limits.ts instead.
  },
};

export default nextConfig;
