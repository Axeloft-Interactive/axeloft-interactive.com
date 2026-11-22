import { resolve } from 'path'
import { defineConfig } from 'vite'
import fs from 'fs'
import { transformSync } from 'esbuild'

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

function mailingListPlugin() {
  return {
    name: 'mailing-list-backend',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === 'POST' && req.url === '/api/subscribe') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const email = data.email;
              if (!email || !email.includes('@')) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid email address' }));
                return;
              }
              
              // Append to mailing-list.txt in the workspace root
              const filePath = resolve(__dirname, 'mailing-list.txt');
              fs.appendFileSync(filePath, `${email}\n`, 'utf8');
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Server error' }));
            }
          });
          return;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === 'POST' && req.url === '/api/subscribe') {
          let body = '';
          req.on('data', chunk => {
            body += chunk;
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              const email = data.email;
              if (!email || !email.includes('@')) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid email address' }));
                return;
              }
              
              // Append to mailing-list.txt in the workspace root
              const filePath = resolve(__dirname, 'mailing-list.txt');
              fs.appendFileSync(filePath, `${email}\n`, 'utf8');
              
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Server error' }));
            }
          });
          return;
        }
        next();
      });
    }
  };
}

function minifyHtml(html) {
  // Remove HTML comments
  let minified = html.replace(/<!--[\s\S]*?-->/g, '');

  // Extract inline script contents and minify them
  minified = minified.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (match, scriptContent) => {
    // If the script tag has src, skip minifying body
    if (match.includes(' src=')) {
      return match;
    }
    try {
      const { code } = transformSync(scriptContent, {
        minify: true,
        loader: 'js',
      });
      const openTag = match.match(/<script\b[^>]*>/i)[0];
      return `${openTag}${code.trim()}</script>`;
    } catch (err) {
      console.warn('Failed to minify inline script:', err);
      return match;
    }
  });

  // Extract inline style contents and minify them
  minified = minified.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, styleContent) => {
    try {
      const { code } = transformSync(styleContent, {
        minify: true,
        loader: 'css',
      });
      const openTag = match.match(/<style\b[^>]*>/i)[0];
      return `${openTag}${code.trim()}</style>`;
    } catch (err) {
      console.warn('Failed to minify inline style:', err);
      return match;
    }
  });

  // Split into lines and collapse whitespaces
  const lines = minified.split('\n');
  let inScriptOrStyle = false;
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.includes('<script') || line.includes('<style')) {
      inScriptOrStyle = true;
    }

    result.push(line);

    if (line.includes('</script>') || line.includes('</style>')) {
      inScriptOrStyle = false;
    }
  }

  let finalHtml = '';
  let prevInScriptOrStyle = false;
  inScriptOrStyle = false;

  for (let i = 0; i < result.length; i++) {
    const line = result[i];
    const startsTag = line.startsWith('<');

    if (line.includes('<script') || line.includes('<style')) {
      inScriptOrStyle = true;
    }

    if (finalHtml === '') {
      finalHtml = line;
    } else if (inScriptOrStyle || prevInScriptOrStyle) {
      finalHtml += '\n' + line;
    } else {
      const prevEndsWithTag = finalHtml.endsWith('>');
      if (prevEndsWithTag && startsTag) {
        finalHtml += line;
      } else {
        finalHtml += ' ' + line;
      }
    }

    if (line.includes('</script>') || line.includes('</style>')) {
      inScriptOrStyle = false;
    }
    prevInScriptOrStyle = inScriptOrStyle;
  }

  return finalHtml;
}

function htmlMinifierPlugin() {
  let isBuild = false;
  return {
    name: 'html-minifier',
    configResolved(config) {
      isBuild = config.command === 'build';
    },
    transformIndexHtml(html) {
      if (isBuild) {
        return minifyHtml(html);
      }
      return html;
    }
  };
}

export default defineConfig({
  plugins: [umamiPlugin(), dev404Plugin(), mailingListPlugin(), htmlMinifierPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        404: resolve(__dirname, '404.html')
      }
    }
  }
})
