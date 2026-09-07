/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        // Avatars, voice lines and tilesets are content-stable and large.
        // Without this they are refetched on every visit, which was a big part
        // of why the first conversation felt slow on a second playthrough.
        source: '/:path(vrm|audio|assets)/:rest*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable'
          }
        ]
      }
    ];
  }
};

export default nextConfig;
