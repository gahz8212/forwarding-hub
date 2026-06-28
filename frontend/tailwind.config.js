/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: '#1e293b',
          blue: '#2563eb',
          light: '#f8fafc'
        }
      }
    },
  },
  plugins: [],
}
