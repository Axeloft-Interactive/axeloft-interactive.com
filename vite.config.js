import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sandbox: resolve(__dirname, 'sandbox/index.html'),
        umbrashift: resolve(__dirname, 'umbrashift/index.html')
      }
    }
  }
})
