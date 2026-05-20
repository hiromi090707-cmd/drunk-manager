import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    host: true,
    allowedHosts: ['rhythm-populations-preserve-installed.trycloudflare.com', 'all']
  }
})
