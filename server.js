import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const DIST_DIR = path.join(__dirname, 'dist');
const MAILING_LIST_PATH = process.env.MAILING_LIST_PATH || '/app/data/mailing-list.txt';

// Simple MIME types map for serving static files
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer((req, res) => {
  // Handle POST request to /api/subscribe
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

        // Ensure parent directory for mailing list file exists (if customized via env)
        const dir = path.dirname(MAILING_LIST_PATH);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Pre-create file with headers if it doesn't exist
        if (!fs.existsSync(MAILING_LIST_PATH)) {
          fs.writeFileSync(
            MAILING_LIST_PATH,
            "# Axeloft Interactive Mailing List\n# Subscriptions are appended below.\n# Users are assured they will be mailed less than 1x per year.\n",
            'utf8'
          );
        }

        // Append to mailing-list.txt
        fs.appendFileSync(MAILING_LIST_PATH, `${email}\n`, 'utf8');

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

  // Handle static files serving (GET/HEAD requests)
  if (req.method === 'GET' || req.method === 'HEAD') {
    let filePath = path.join(DIST_DIR, req.url.split('?')[0].split('#')[0]);

    // Route rewriting for directory roots
    if (req.url === '/' || req.url === '/umbrashift' || req.url === '/umbrashift/') {
      if (req.url === '/') {
        filePath = path.join(DIST_DIR, 'index.html');
      } else {
        filePath = path.join(DIST_DIR, 'umbrashift', 'index.html');
      }
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to 404.html for any unmatched routes
        const fallbackPath = path.join(DIST_DIR, '404.html');
        fs.readFile(fallbackPath, (err404, data404) => {
          if (err404) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain');
            res.end('404 Not Found');
          } else {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/html');
            res.end(data404);
          }
        });
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      res.statusCode = 200;
      res.setHeader('Content-Type', contentType);

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      // Stream file content
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Internal Server Error');
      });
      stream.pipe(res);
    });
    return;
  }

  // Fallback for unsupported HTTP methods
  res.statusCode = 405;
  res.end('Method Not Allowed');
});

server.listen(PORT, () => {
  console.log(`Production server running at http://localhost:${PORT}`);
});
