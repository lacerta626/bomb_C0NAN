import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.svg': 'image/svg+xml',
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const requested = pathname === '/' ? '/archive.html' : pathname;
  const target = path.resolve(root, `.${requested}`);
  if (!target.startsWith(root) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    response.writeHead(404).end('Not found');
    return;
  }
  const stat = fs.statSync(target);
  const range = request.headers.range;
  const headers = { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
  if (range) {
    const [startText, endText] = range.replace('bytes=', '').split('-');
    const start = Number(startText);
    const end = endText ? Number(endText) : stat.size - 1;
    response.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Content-Length': end - start + 1 });
    fs.createReadStream(target, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { ...headers, 'Content-Length': stat.size });
  fs.createReadStream(target).pipe(response);
}).listen(4173, '127.0.0.1', () => console.log('http://127.0.0.1:4173/archive.html'));
