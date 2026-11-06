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
assert(works.length === 13, `Expected 13 works, received ${works.length}.`);
assert(gallery.every((artist) => artist.category === 'participant'), 'All registered artist works must be in the participant category.');
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
for (let index = 1; index <= 8; index += 1) {
  assert(fs.existsSync(path.join(root, `assets/GOODS_${index}.jpg`)), `Missing collaboration image GOODS_${index}.jpg.`);
}
assert(fs.existsSync(path.join(root, 'assets/GOODS_9.png')), 'Missing collaboration image GOODS_9.png.');
assert(!fs.existsSync(path.join(root, 'assets/gallery/대이님_0.png')), 'Removed Daeyi image must not remain in deployment assets.');
const guestbookSql = fs.readFileSync(path.join(root, 'supabase-gallery-guestbook.sql'), 'utf8');
assert(/enable row level security/i.test(guestbookSql), 'Gallery guestbook must enable RLS.');
assert(/post_gallery_guestbook/.test(guestbookSql) && /30 seconds/.test(guestbookSql), 'Guestbook server rate limit is missing.');

const passwordMigration = fs.readFileSync(path.join(root, 'supabase-gallery-guestbook-password-v2.sql'), 'utf8');
assert(/add column if not exists password_hash text/i.test(passwordMigration), 'Nullable password hash migration is missing.');
assert(/extensions\.crypt\(p_password, extensions\.gen_salt\('bf', 12\)\)/i.test(passwordMigration), 'Guestbook passwords must use bcrypt.');
assert(/drop function if exists public\.post_gallery_guestbook\(text, text, text\)/i.test(passwordMigration), 'Legacy passwordless post RPC must be removed.');
assert(/failed_attempts >= 5/i.test(passwordMigration) && /interval '15 minutes'/i.test(passwordMigration), 'Password attempt limiting is missing.');
assert(/revoke execute on function public\.verify_gallery_guestbook_password_internal/i.test(passwordMigration), 'Internal password verifier must not be publicly executable.');
assert(/delete_gallery_guestbook\(uuid, text, text\)/i.test(passwordMigration), 'Password-verified delete RPC is missing.');

const cleanupSql = fs.readFileSync(path.join(root, 'supabase-gallery-guestbook-clear-current.sql'), 'utf8');
assert(/delete from public\.gallery_guestbook;/i.test(cleanupSql), 'Explicit guestbook cleanup is missing.');
assert(!/(delete|truncate)\s+(from\s+)?public\.(game_|participant_|admin_)/i.test(cleanupSql), 'Guestbook cleanup must not touch game or admin data.');

console.log('Gallery integration checks passed: 8 artist groups, 13 works, 111 PDF pages, 9 collaboration images.');
