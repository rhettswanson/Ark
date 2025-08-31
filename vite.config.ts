import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Ark/',  // This ensures paths work on GitHub Pages (repo name 'Ark')
  build: {
    outDir: 'docs'  // Build to 'docs/' instead of 'dist/'
  }
})
