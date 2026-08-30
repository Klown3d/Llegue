/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        ink: "var(--ink)",
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        line: "var(--line)",
        signal: "var(--signal)",
        cyan: "var(--cyan)",
      },
      boxShadow: {
        panel: "0 24px 70px rgba(15, 31, 46, .16)",
      },
    },
  },
  plugins: [],
};
