-- AFTER 11:07 / 현재 갤러리 방명록 전체 삭제 (1회용)
-- 주의: 아래 DELETE는 되돌릴 수 없습니다. 필요한 경우 먼저 백업하세요.
-- 사용자가 요청한 현재 작성 글만 삭제하며 게임·랭킹 데이터는 건드리지 않습니다.

begin;

select count(*) as entries_to_delete
from public.gallery_guestbook;

delete from public.gallery_guestbook;
delete from public.gallery_guestbook_password_attempts;

commit;

select count(*) as remaining_entries
from public.gallery_guestbook;
