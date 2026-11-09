import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        black: "#000000",
        ink: "#050505",
        lavender: {
          DEFAULT: "#C4B5FD",
          bright: "#DDD6FE",
          deep: "#8B7CF6",
          dim: "#6D6494",
        },
        olive: {
          DEFAULT: "#9AAA6A",
          bright: "#C5D4A1",
          deep: "#6E7F45",
          dim: "#3E4A2C",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Ubuntu", "Segoe UI", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "2px",
        md: "2px",
        lg: "2px",
        xl: "2px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(196,181,253,0.65), 0 0 28px rgba(139,124,246,0.22)",
        olive: "0 0 18px rgba(154,170,106,0.2)",
      },
    },
  },
  plugins: [],
};

export default config;
