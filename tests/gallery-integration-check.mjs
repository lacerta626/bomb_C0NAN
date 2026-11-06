import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const source = fs.readFileSync(path.join(root, 'gallery-data.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const gallery = context.window.AFTER_GALLERY;
const works = gallery.flatMap((artist) => artist.works || []);

assert(gallery.length === 8, `Expected 8 artist groups, received ${gallery.length}.`);
assert(works.length === 14, `Expected 14 works, received ${works.length}.`);
assert(new Set(gallery.map((artist) => artist.id)).size === gallery.length, 'Gallery IDs must be unique.');

for (const artist of gallery) {
  for (const field of ['thumbnail', 'image']) {
    assert(fs.existsSync(path.join(root, artist[field])), `Missing ${field}: ${artist[field]}`);
  }
  for (const work of artist.works || []) {
    assert(fs.existsSync(path.join(root, work.file)), `Missing work file: ${work.file}`);
    if (work.thumbnail) assert(fs.existsSync(path.join(root, work.thumbnail)), `Missing work thumbnail: ${work.thumbnail}`);
  }
}

const expectedPdfPages = new Map([
  ['assets/gallery/파님회지.pdf', 37],
  ['assets/gallery/B90님회지.pdf', 20],
  ['assets/gallery/파앙님회지.pdf', 30],
  ['assets/gallery/애플쿠키님회지.pdf', 24],
]);
for (const [file, expected] of expectedPdfPages) {
  const pdf = fs.readFileSync(path.join(root, file)).toString('latin1');
  const actual = [...pdf.matchAll(/\/Type\s*\/Page(?!s)\b/g)].length;
  assert(actual === expected, `${file} expected ${expected} pages, received ${actual}.`);
}

const tenshi = gallery.find((artist) => artist.artist === '텐시님');
assert(tenshi.thumbnail.endsWith('텐시님 섬네일.png'), 'Tenshi must use the supplied thumbnail.');
assert(tenshi.works.map((work) => work.file).join('|').endsWith('텐시님_1.jpg|assets/gallery/텐시님_2.jpg'), 'Tenshi pages are out of order.');
assert(!tenshi.works.some((work) => work.file === tenshi.thumbnail), 'Tenshi thumbnail must not be repeated as body content.');

const publicGalleryData = JSON.stringify(gallery.filter((artist) => artist.artist === '익명'));
assert(!/달구|청님/.test(publicGalleryData), 'Anonymous artist identity leaked into public data.');
assert(fs.existsSync(path.join(root, 'vendor/pdfjs/pdf.min.mjs')), 'PDF.js library is missing.');
assert(fs.existsSync(path.join(root, 'vendor/pdfjs/pdf.worker.min.mjs')), 'PDF.js worker is missing.');

console.log('Gallery integration checks passed: 8 artist groups, 14 works, 111 PDF pages.');
