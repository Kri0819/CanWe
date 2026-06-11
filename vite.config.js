import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})


vercel.json

{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
