import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        body: ['"Nunito"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
