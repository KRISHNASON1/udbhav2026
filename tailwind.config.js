/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./user-dashboard.html",
    "./admin/*.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./*.js"
  ],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0f',
        foreground: '#ffffff',
        accent: '#ff00ff',
        primary: '#8b5cf6',
        secondary: '#06b6d4',
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
