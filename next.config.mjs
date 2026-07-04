import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    skipWaiting: true,
    clientsClaim: true,
    // Never satisfy /zuya or API navigations from a stale precache — the login
    // page must always come fresh from the network so a half-updated service
    // worker can't serve an old, broken auth bundle.
    navigateFallbackDenylist: [/^\/zuya/, /^\/api/],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withPWA(nextConfig);
