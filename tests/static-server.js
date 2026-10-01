// Minimal static file server for tests and local play. Usage: node tests/static-server.js [port]
// Exports start(port) for the test suite; serves the repository root.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

function start(port = 0) {
    const server = http.createServer((req, res) => {
        let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const file = path.normalize(path.join(ROOT, urlPath));
        if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404);
            res.end('Not found');
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
    });
    return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (require.main === module) {
    const port = Number(process.argv[2]) || 8000;
    start(port).then(() => console.log(`Serving ${ROOT} at http://127.0.0.1:${port}/`));
}

module.exports = { start };
