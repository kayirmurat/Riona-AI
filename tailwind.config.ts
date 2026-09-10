import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#ffffff",
        "surface-muted": "#f7f7f8",
        "surface-sunken": "#eeeef0",
        border: "#e5e5e7",
        ink: "#1a1a1e",
        "ink-muted": "#6b6b74",
        accent: "#c15f3c",
      },
    },
  },
  plugins: [],
};

export default config;
