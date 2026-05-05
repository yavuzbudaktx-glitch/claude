import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        arabic: ["Amiri", "Scheherazade New", "serif"],
        serif: ["Fraunces", "ui-serif", "Georgia", "serif"],
      },
      keyframes: {
        drift: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(40px,-30px,0) scale(1.08)" },
        },
        drift2: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(-50px,40px,0) scale(0.95)" },
        },
        drift3: {
          "0%, 100%": { transform: "translate3d(0,0,0) scale(1.05)" },
          "50%": { transform: "translate3d(30px,30px,0) scale(1)" },
        },
        fadeIn: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        drift: "drift 22s ease-in-out infinite",
        drift2: "drift2 28s ease-in-out infinite",
        drift3: "drift3 26s ease-in-out infinite",
        fadeIn: "fadeIn .4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
