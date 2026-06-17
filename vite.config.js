import { resolve } from 'path'
import { defineConfig } from 'vite'

function umamiPlugin() {
  return {
    name: 'inject-umami',
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: {
            defer: true,
            src: 'https://umami-g2si5q885cap7u1hnj17wmmx.joukevandam.nl/script.js',
            'data-website-id': '68a84c22-819d-4356-a152-85d9b141d787'
          },
          injectTo: 'head'
        }
      ]
    }
  }
}

export default defineConfig({
  plugins: [umamiPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        umbrashift: resolve(__dirname, 'umbrashift/index.html')
      }
    }
  }
})
