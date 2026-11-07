import fs from 'node:fs';import path from 'node:path';const root=path.resolve(import.meta.dirname,'..');const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');const ok=(v,m)=>{if(!v)throw Error(m)};
const sql=read('sql/PUBLIC_SUPABASE_SETUP.sql');const clean=sql.replace(/--.*$/gm,'');const access=read('minigame/minigame-access.js');const runner=read('minigame/game-runner-auth.js');const home=read('home.html');const mini=read('minigame/index.html');
ok(!/drop\s+|truncate\s+|delete\s+|alter\s+table\s+public\.(participant_codes|game_results)|verify_launch|admin_list_codes/i.test(clean),'SQL touches legacy objects');
ok(/public_game_open_sessions/.test(sql)&&/public_game_open_records/.test(sql),'Independent tables missing');
ok(/public_game_start/.test(sql)&&/public_game_verify/.test(sql)&&/public_game_submit/.test(sql)&&/public_game_leaderboard/.test(sql)&&/public_game_ranking_page/.test(sql),'Public RPCs missing');
ok(/session_id uuid not null unique/.test(sql)&&/for update/.test(sql)&&/server_elapsed>=minimum_elapsed/.test(sql),'Server validation missing');
ok(/distinct on\(r?\.?player_hash\)/.test(sql)&&/remaining_seconds desc/.test(sql),'Best-record ranking rule missing');
ok(/public-supabase-client/.test(access)&&/public_game_start/.test(access)&&!/participant|check_code|start_game\(/.test(access),'Code-free launcher missing');
ok(/public_game_verify/.test(runner)&&/public_game_submit/.test(runner)&&/top10/.test(runner),'Runner integration missing');
const rankingPage=read('public-ranking.html');const rankingJs=read('public-ranking.js');ok(/TOP 10/.test(rankingPage)&&/전체 랭킹/.test(rankingPage)&&/MY RECORD/.test(rankingPage),'Ranking controls missing');ok(/public_game_ranking_page/.test(rankingJs)&&/is_current_player/.test(rankingJs),'Current-player ranking missing');
ok(/public-ranking\.html/.test(home)&&!/leaderboard\.html/.test(home),'Home ranking link is not isolated');ok(!/participant-code/.test(mini),'Selector exposes legacy UI');
ok(/const TOTAL_TIME = 90/.test(read('games/easy/js/script.js')),'Easy limit changed');ok(/time: 120/.test(read('games/hard/script.js')),'Hard limit changed');
for(const htmlFile of ['index.html','home.html','event.html','notice.html','archive.html','public-ranking.html','minigame/index.html','minigame/easy/index.html','minigame/hard/index.html']){const html=read(htmlFile);for(const match of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css|html))/g)){if(/^https?:/.test(match[1]))continue;ok(fs.existsSync(path.resolve(path.dirname(path.join(root,htmlFile)),match[1])),`${htmlFile} missing ${match[1]}`);}}
console.log('Standalone public checks passed.');
