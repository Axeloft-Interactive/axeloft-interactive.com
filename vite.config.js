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

function dev404Plugin() {
  return {
    name: 'dev-404-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Only handle GET requests that don't look like assets, modules, or vite client stuff
        if (req.method === 'GET' && !req.url.startsWith('/@') && !req.url.startsWith('/node_modules') && !req.url.includes('.')) {
          const matchedRoutes = ['/', '/umbrashift', '/umbrashift/'];
          const cleanUrl = req.url.split('?')[0].split('#')[0];
          if (!matchedRoutes.includes(cleanUrl)) {
            // Rewrite URL to serve /404.html automatically
            req.url = '/404.html';
          }
        }
        next();
      });
    }
  }
}

export default defineConfig({
  plugins: [umamiPlugin(), dev404Plugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        umbrashift: resolve(__dirname, 'umbrashift/index.html'),
        404: resolve(__dirname, '404.html')
      }
    }
  }
})
