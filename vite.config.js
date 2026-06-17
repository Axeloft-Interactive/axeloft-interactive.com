import { resolve } from 'path'
import { defineConfig } from 'vite'

const umamiScript = '<script defer src="https://umami-g2si5q885cap7u1hnj17wmmx.joukevandam.nl/script.js" data-website-id="68a84c22-819d-4356-a152-85d9b141d787"></script>';

function umamiPlugin() {
  return {
    name: 'inject-umami',
    transformIndexHtml(html) {
      if (html.includes('</head>')) {
        return html.replace('</head>', `  ${umamiScript}\n  </head>`);
      }
      return html.replace('<body>', `<head>\n    ${umamiScript}\n  </head>\n  <body>`);
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
