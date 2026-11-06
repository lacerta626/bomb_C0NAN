import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const migration = read('supabase-migration-ranking-v3.sql');
const migrationSql = migration.replace(/--.*$/gm, '');
const attemptsMigration = read('supabase-migration-attempts-v4.sql');
const setup = read('supabase-setup.sql');
const access = read('minigame/minigame-access.js');
const runner = read('minigame/game-runner-auth.js');
const subpageTransitions = read('subpage-unified.js');
const easy = read('games/easy/js/script.js');
const hard = read('games/hard/script.js');

assert(!/drop\s+table|truncate|drop[^;]+cascade/i.test(migrationSql), 'Migration contains a destructive operation.');
assert(!/drop\s+table|truncate|drop[^;]+cascade/i.test(attemptsMigration.replace(/--.*$/gm, '')), 'Attempts migration contains a destructive operation.');
assert(/'easy', 3-r\.easy_used/.test(attemptsMigration) && /r\.easy_used >= 3/.test(attemptsMigration), 'Easy attempts must be three.');
assert(/'hard', 3-r\.hard_used/.test(attemptsMigration) && /r\.hard_used >= 3/.test(attemptsMigration), 'Hard attempts must be three.');
assert(/attempt_number between 1 and 3/.test(attemptsMigration), 'Third game result must be accepted.');
assert((migration.match(/create function public\.verify_launch\(p_token uuid, p_mode text\)/g) || []).length === 1, 'verify_launch must have one final definition.');
assert(!/verify_launch\(/.test(setup), 'Base setup must not redefine ranked-session RPCs.');
assert(/p_access_token: participant\.token/.test(access), 'start_game must receive the participant token.');
assert(/sessionStorage\.getItem\(storageKey\)[\s\S]{0,80}\|\| localStorage\.getItem\(storageKey\)/.test(runner), 'Runner must use the storage fallback.');
assert(/#launch=/.test(access) && /hashParams\.get\('launch'\)/.test(runner), 'Runner must support one-time fragment handoff.');
assert(!/event-ui a,.mode-card/.test(subpageTransitions), 'Shared page transitions must not bypass the authenticated mode-card launch.');
assert(!/removeItem\(storageKey\)[\s\S]{0,200}verify_launch/.test(runner), 'Runner must not delete the token before verification.');
assert(/remainingSeconds: Number\(session\.remaining_seconds\)/.test(runner), 'Runner must pass server remaining time.');
assert(/after1107:session/.test(easy) && /after1107:session/.test(hard), 'Both games must consume the server session time.');
assert(/const TOTAL_TIME = 90/.test(easy), 'Easy limit must remain 90 seconds.');
assert(/time: 120/.test(hard), 'Hard limit must remain 120 seconds.');

for (const htmlFile of ['minigame/index.html', 'minigame/easy/index.html', 'minigame/hard/index.html', 'leaderboard.html', 'admin-supabase.html']) {
  const html = read(htmlFile);
  for (const match of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css|html))[^" ]*"/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue;
    const target = path.resolve(path.dirname(path.join(root, htmlFile)), match[1]);
    assert(fs.existsSync(target), `${htmlFile} references missing file: ${match[1]}`);
  }
}

console.log('Static integration checks passed.');
