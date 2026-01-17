/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      {
        source: "/(.*)\\.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/partners/start',
        destination: '/venues',
        permanent: true,
      },
      {
        source: '/partners',
        destination: '/venues',
        permanent: true,
      },
      {
        source: '/partners/:path*',
        destination: '/venues/:path*',
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
