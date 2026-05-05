import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["Amiri", "Scheherazade New", "serif"],
      },
      colors: {
        ink: "#0b1020",
        panel: "#121833",
        muted: "#9aa3c7",
        accent: "#7c5cff",
      },
    },
  },
  plugins: [],
};

export default config;
