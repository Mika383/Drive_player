# 0004 — Kiến trúc MVP Drive Player

Trạng thái: Accepted — giai đoạn 1–2 Done trên máy phát triển; giai đoạn 3–5 Pending
Ngày: 19/10/2026

Lưu ý: Phần “đề xuất/dự kiến” bên dưới là thiết kế tại thời điểm phê duyệt. Schema nền tảng và giai đoạn 1–2 đã được triển khai. Phép thử hàng chờ theo danh sách quét trong [kế hoạch 0005](0005-arbitrary-track-startup.md) được thực hiện sau đó; playlist và player sản phẩm của giai đoạn 3–5 vẫn Pending.
Phê duyệt giai đoạn 1–2: 19/10/2026.
Hướng stack được xác nhận: 19/10/2026 — một ứng dụng Next.js cho web và API, giữ PostgreSQL/Prisma.
Lưu refresh token Google đã mã hóa trên server được người dùng duyệt: 19/10/2026.
Định dạng âm thanh bản đầu được người dùng duyệt: MP3 và M4A/AAC; file khác giữ nguyên trong `incoming/`, báo chưa hỗ trợ, chưa tự chuyển mã.
Tệp MP3/M4A lớn hơn 25 MiB vẫn được nhập và phát thủ công; giao diện báo tự chuyển bài khi khóa màn hình chưa được bảo đảm nếu bài sau chưa sẵn sàng. Mốc 25 MiB thuộc prototype 0003, không phải giới hạn thư viện; phép thử 0005 dùng bộ đệm phiên 50 MiB cho các bài không đang nghe.
Nút tải nhạc từ web giới hạn 200 MiB mỗi tệp ở bản đầu. Tệp thả trực tiếp vào Drive không chịu giới hạn upload của ứng dụng nhưng vẫn phải thuộc định dạng hỗ trợ để nhập/phát.
Mô hình triển khai Next.js Node server và PostgreSQL trên máy chủ luôn hoạt động được người dùng duyệt: 19/10/2026. Nhà cung cấp/domain chưa chốt.
Mỗi Gmail dùng một folder Drive trong bản đầu; sau khi thiết lập và nhập bài, chưa hỗ trợ đổi sang folder khác. Người dùng duyệt: 19/10/2026.
Trong mỗi playlist, một bài chỉ xuất hiện tối đa một lần. Người dùng duyệt: 19/10/2026.

## Mục tiêu và phạm vi

Xây ứng dụng web cho nhiều người dùng Gmail cá nhân, ưu tiên iPhone, có thể thêm vào Màn hình chính. Mỗi người dùng chọn một thư mục My Drive và chia sẻ thư mục đó cho tài khoản dịch vụ với quyền Editor. Âm thanh, ảnh bìa và lời nằm trên Drive; máy chủ giữ tài khoản, chỉ mục, playlist, yêu thích và cài đặt. Phiên bản đầu chỉ có thư viện cá nhân, cần mạng để dùng.

MVP cần có: đăng nhập Google; chọn/xác nhận folder; `incoming/` và `songs/`; quét, phát trước khi nhập, xác nhận nhập; tìm kiếm; player và hàng chờ; playlist, yêu thích; chỉnh lời theo dòng và ảnh bìa tùy chọn; phát khi khóa màn hình. Chia sẻ giữa người dùng và thư viện công khai để sau.

## Cơ sở từ phép thử

- Prototype đã xác nhận đăng nhập, chọn folder qua Picker chuyển hướng, xác nhận Editor, quét, nhập và phát trên máy tính/iPhone. Một tệp thử nằm ngoài folder bị tài khoản dịch vụ từ chối; đây không thay thế kiểm thử an ninh đầy đủ.
- Player đổi `src` lúc `ended` không đạt chuyển bài liên tục từ biểu tượng iPhone. Phép thử hai phần tử audio, tải sẵn **toàn bộ** một bài kế tiếp dưới 25 MiB, đạt hai lần chuyển liên tục trong cả web app độc lập và biểu tượng mở Safari theo báo cáo người dùng. Chưa có bằng chứng cho danh sách dài, mạng yếu hoặc nhiều định dạng. Xem `spikes/drive-ios/RESULTS.md`.

## Stack đang đề xuất sau khi người dùng yêu cầu một ứng dụng Next.js

| Thành phần | Đề xuất | Lý do |
| --- | --- | --- |
| Web và API | Một ứng dụng Next.js App Router + TypeScript, Route Handlers trên Node runtime | Giao diện, OAuth, Drive API và route âm thanh trong cùng ứng dụng; tách module dịch vụ và player để không dồn logic vào page/route. [Next.js Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route) hỗ trợ request/response tùy chỉnh. |
| Cơ sở dữ liệu | PostgreSQL + Prisma migrations | Lưu ánh xạ Google account–folder, chỉ mục bài, playlist và cài đặt bền vững; phù hợp số lượng người dùng tăng. |
| Repository | Một package Next.js dùng `pnpm`; không cần workspace ở MVP | Giảm cấu hình và số tiến trình. Code tách theo module trong một ứng dụng. |
| Triển khai đầu tiên | Một tiến trình Next.js Node chạy liên tục và PostgreSQL; HTTPS/domain riêng trước khi mời người dùng thật | [Next.js hỗ trợ self-hosted Node server và phản hồi stream](https://nextjs.org/docs/app/guides/self-hosting). Không dùng ngrok cho sản phẩm. Chưa chọn nhà cung cấp, kích cỡ hoặc chi phí. |

Dependency dự kiến cho giai đoạn nền tảng: `next`, `react`, `react-dom`, `typescript`, `prisma`, Prisma Client/adapter PostgreSQL tương thích với phiên bản được ghim, driver `pg` nếu adapter yêu cầu, và `google-auth-library` đã được dùng trong prototype. Chưa thêm UI framework, state library, queue, Redis hoặc package upload/lyrics trước khi có nhu cầu cụ thể. Mỗi dependency được kiểm tra phiên bản/đường nâng cấp trước khi cài; không chạy theo `latest` không kiểm soát.

Không đề xuất Vercel Functions làm API âm thanh/upload chính ở MVP: hiện Vercel nêu giới hạn payload 4,5 MB và thời lượng thực thi Function, trong khi nhạc có thể lớn và cần truyền liên tục. Đây là suy luận kiến trúc từ [giới hạn Vercel](https://vercel.com/docs/functions/limitations), không phải kết quả benchmark Drive Player. Next.js vẫn có thể triển khai lên Vercel sau này nếu thay thiết kế route nhạc/upload hoặc kiểm chứng được giới hạn phù hợp.

## Ranh giới dữ liệu và quyền

- Đăng nhập Google bằng OAuth code flow phía server. Dùng `openid email profile` cho danh tính và `drive.file` cho thao tác Drive của người dùng. Picker chọn folder; backend kiểm tra folder thuộc My Drive của đúng Gmail, có quyền thêm tệp. Tài khoản dịch vụ chỉ được người dùng chia sẻ folder đó; backend vẫn kiểm tra từng file thuộc cây folder trước khi đọc/phát. [Google mô tả `drive.file` là quyền theo tệp được chọn qua Picker](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
- Lưu refresh token người dùng cho thao tác tạo folder/tải lên về sau, dùng `access_type=offline`; token chỉ ở server, mã hóa khi lưu DB, khóa mã hóa ở secret store/biến môi trường. [Google yêu cầu lưu refresh token an toàn](https://developers.google.com/identity/protocols/oauth2/resources/best-practices). Lát cắt hiện tại đã dùng AES-256-GCM; luân chuyển khóa và thao tác thu hồi/ngắt kết nối Google chưa triển khai.
- Phiên người dùng dùng cookie HttpOnly/Secure/SameSite, lưu session bền vững để cùng Gmail trên thiết bị khác thấy lại folder đã liên kết sau khi đăng nhập; không đồng bộ cookie giữa thiết bị. Tách session khỏi token Google. CSRF, giới hạn yêu cầu và xác thực tài nguyên áp dụng cho thao tác ghi và stream.
- Chỉ mục DB là dữ liệu dẫn xuất; Drive là nguồn tệp. Khi tệp bị đổi/xóa hoặc thu hồi quyền, quét lại và báo trạng thái rõ ràng. Không tự khôi phục bằng cách đọc Drive ngoài folder.
- Tài khoản dịch vụ có thể thấy nhiều folder được các người dùng khác nhau chia sẻ. Vì vậy **mọi** thao tác liệt kê, đọc, đổi tên, di chuyển và stream phải gắn với `library.rootDriveId` của phiên hiện tại; quyền của Google đối với tài khoản dịch vụ không thay thế kiểm tra cách ly giữa người dùng trong ứng dụng.

## Thiết kế dữ liệu ban đầu để thẩm định

Các bảng dùng UUID làm PK, timestamp UTC trong DB và hiển thị mặc định GMT+7; mặc định giao diện tiếng Anh, có tiếng Việt theo chỉ dẫn dự án. Mọi FK có index phục vụ truy vấn và hành vi xóa được chốt trong migration; không dùng `ON DELETE CASCADE` cho dữ liệu thư viện quan trọng. Đây là thiết kế ban đầu: năm bảng `users`, `google_credentials`, `sessions`, `libraries`, `audit_events` đã có trong migration nền tảng; các bảng còn lại vẫn là đề xuất cho giai đoạn sau.

| Bảng | Cột chính và ràng buộc | Mục đích |
| --- | --- | --- |
| `users` | `id uuid PK`, `google_sub text UNIQUE NOT NULL`, `email text NOT NULL`, `display_name text NULL`, `created_at`, `updated_at` | Dùng Google subject làm định danh ổn định; email chỉ để hiển thị/đối chiếu. |
| `google_credentials` | `user_id uuid PK/FK users`, `refresh_ciphertext bytea NOT NULL`, `nonce bytea NOT NULL`, `auth_tag bytea NOT NULL`, `key_version int NOT NULL`, `scopes text NOT NULL`, `updated_at`, `revoked_at NULL` | Chỉ lưu refresh token đã mã hóa; không lưu access token bền vững. Một bộ quyền Drive mỗi người dùng. |
| `sessions` | `id_hash text PK`, `user_id uuid FK users NOT NULL`, `created_at`, `revoked_at NULL` | Cookie giữ ID ngẫu nhiên; DB chỉ lưu hash. Không có timeout bất hoạt mặc định. |
| `libraries` | `id uuid PK`, `user_id uuid UNIQUE/FK users`, `root_drive_id text NOT NULL`, `incoming_drive_id text NULL`, `songs_drive_id text NULL`, `verified_at NULL`, `last_scan_at NULL`, `revision int DEFAULT 1`, timestamps | Một folder nhạc cho mỗi tài khoản trong MVP; sau khi thiết lập/nhập bài không cho đổi root ở bản đầu. `revision` bảo vệ cập nhật cấu hình. |
| `tracks` | `id uuid PK`, `library_id uuid FK libraries`, `audio_drive_id text NOT NULL`, `container_drive_id text NOT NULL`, `file_name text`, `mime_type text`, `size_bytes bigint`, `title text`, `artist text NULL`, `album text NULL`, `duration_ms int NULL`, `cover_drive_id text NULL`, `lyrics_drive_id text NULL`, `state text`, `revision int DEFAULT 1`, timestamps; `UNIQUE(library_id,audio_drive_id)` | Chỉ mục bài đã nhập. `state` ban đầu gồm `ready`, `missing`, `needs_attention`; thay đổi metadata có kiểm tra revision. |
| `playlists` | `id uuid PK`, `user_id uuid FK users`, `name text NOT NULL`, `description text NULL`, `created_at`, `updated_at`, `deleted_at NULL` | Playlist cá nhân; xóa mềm để có thể phục hồi. |
| `playlist_items` | `id uuid PK`, `playlist_id uuid FK playlists`, `track_id uuid FK tracks`, `position int NOT NULL`, `created_at`; `UNIQUE(playlist_id,track_id)`, index `(playlist_id,position,id)` | Thứ tự playlist ổn định; một bài chỉ xuất hiện một lần trong playlist. |
| `favorites` | PK `(user_id,track_id)` cùng FK tới `users`/`tracks`, `created_at` | Danh sách yêu thích cá nhân. |
| `user_preferences` | `user_id uuid PK/FK users`, `language text`, `theme text`, `repeat_mode text`, `updated_at` | Cài đặt có giá trị hợp lệ ở backend; hàng chờ phiên phát có thể giữ ở client trước. |
| `drive_operations` | `id uuid PK`, `library_id uuid FK libraries`, `kind text`, `source_drive_id text`, `target_drive_id text NULL`, `idempotency_key text`, `state text`, `error_code text NULL`, timestamps; `UNIQUE(library_id,idempotency_key)` | Theo dõi thao tác nhập/tải lên khi Drive và DB không có transaction chung; hỗ trợ đối soát/retry an toàn. |
| `audit_events` | `id uuid PK`, `actor_user_id uuid FK users`, `action text`, `resource text`, `resource_id text`, `before jsonb NULL`, `after jsonb NULL`, `request_id text`, `created_at` | Ghi thay đổi folder, nhập, playlist, lời và thu hồi quyền; không ghi token hay nội dung nhạc. |

Index truy vấn ban đầu: `(library_id,state,title,id)` cho danh sách/tìm kiếm cơ bản; `(playlist_id,position,id)` cho thứ tự; `(user_id,created_at,id)` cho playlist; unique theo Drive ID như trên. Chưa thêm full-text/trigram index trước khi có dữ liệu và truy vấn thực. Migration đầu tiên chỉ tạo bảng mới nên không có dữ liệu cũ cần chuyển; rollback bằng sao lưu DB trước mỗi migration sau này, không xóa bảng chứa dữ liệu để “rollback” tự động.

## API và luồng nghiệp vụ dự kiến

- API JSON dùng tiền tố `/v1`, HTTP status thật, response chuẩn `{ status, data, message, error }`. OAuth redirect và byte stream âm thanh là ngoại lệ không trả JSON. Backend kiểm tra quyền trên mọi route, không dựa vào ẩn nút ở UI.
- Đăng nhập: `/v1/auth/google/start` → callback xác minh `state` và ID token → tìm/tạo `users` theo `google_sub` → lưu refresh token đã mã hóa nếu Google cấp → tạo session. Chọn folder qua Picker chuyển hướng để tránh lỗi iframe từng thấy trên iPhone; callback kiểm tra state/cookie, Gmail và metadata folder. Picker nhúng có thể giữ như tùy chọn sau khi ổn định.
- Thiết lập: route chọn folder, xác nhận tài khoản dịch vụ là Editor, tạo/kiểm tra `incoming/` và `songs/` bằng OAuth người dùng. Nếu không đủ quyền, giữ trạng thái rõ ràng và không đánh dấu thư viện đã sẵn sàng.
- Nhập: `GET /v1/incoming` quét folder chờ có phân trang Drive; `POST /v1/tracks/import` nhận file ID và idempotency key. Backend xác nhận tệp đang trong `incoming/`, đúng loại và chủ sở hữu phù hợp; tạo folder bài, chuyển tệp sau xác nhận, cập nhật `tracks`, audit. Nếu Drive thành công còn DB thất bại, `drive_operations` giữ trạng thái để đối soát, không thử di chuyển trùng.
- Upload: route nhận tệp tối đa 200 MiB, stream qua OAuth người dùng vào `incoming/`; kiểm tra kích thước/loại thực tế, không đọc hết vào RAM server. Tệp upload xong vẫn chờ người dùng xác nhận nhập.
- Thư viện: danh sách/tìm kiếm từ chỉ mục DB có cursor ổn định, lọc theo trạng thái, cập nhật metadata/ảnh/lời có revision; nếu Drive từ chối hoặc tệp mất, trả trạng thái rõ và cho quét lại.
- Phát: `GET /v1/audio/:trackId` dùng session, lấy Drive ID từ DB, kiểm tra cây folder và quyền hiện tại, proxy byte range từ Drive. Đường tải sẵn bài tiếp theo dùng route này; không đưa service account token cho browser. Thao tác playlist/yêu thích kiểm tra `user_id` và `library_id` khớp phiên.
- Người dùng tự chỉnh lời theo từng dòng; `lyrics.json` nằm trong folder bài trên Drive, metadata/phiên bản trong DB. Thay đổi lời yêu cầu xác nhận lưu và có kiểm tra revision; định dạng JSON chi tiết cần ADR riêng trước khi viết editor.

## Bảo mật, vận hành và phục hồi

- Khóa mã hóa token, OAuth client secret, service account credential và DB URL ở server secret store/biến môi trường; không commit hoặc gửi sang browser. Mã hóa có phiên bản khóa để luân chuyển. Đăng xuất chỉ thu hồi session; thao tác ngắt kết nối Google/thu hồi token cần quy tắc dữ liệu riêng trước khi triển khai.
- Session cookie HttpOnly/Secure/SameSite, kiểm tra CSRF/Origin cho thao tác ghi; giới hạn tần suất login, upload, quét và stream theo tài khoản/IP. Log có request ID, không ghi access/refresh token, cookie, mã xác thực hay nội dung Drive.
- Ứng dụng chạy một instance ở MVP để giảm phối hợp cache/session. DB sao lưu theo lịch khi triển khai; sức chứa Drive vẫn thuộc tài khoản người dùng. Health endpoint chỉ trả tình trạng ứng dụng/DB, không lộ credential.
- Nếu người dùng thu hồi quyền Drive hoặc bỏ chia sẻ folder, dừng thao tác liên quan và hướng dẫn cấp lại. Không tự mở rộng OAuth scope hoặc đọc folder khác. Tệp Drive bị di chuyển/xóa sẽ được đánh dấu `missing`; không xóa chỉ mục/playlist tức thời.
- Không có transaction chung giữa Google Drive và PostgreSQL. `drive_operations` và quét đối soát là cơ chế phục hồi khi nhập/upload bị ngắt giữa chừng; audit DB đi cùng transaction của thay đổi DB khi có thể.

## Phát nhạc và dữ liệu Drive

Kế hoạch [0005](0005-arbitrary-track-startup.md) được duyệt sau 0004 và cập nhật quy tắc tải trước: ưu tiên bài đang nghe, chuẩn bị bài gần nhất cùng tối đa hai bài xa hơn trong bộ đệm phiên 50 MiB. Hiện quy tắc này chỉ được triển khai ở trang thử `/queue-spike`; player sản phẩm của giai đoạn 4 vẫn Pending.

- Phát qua API có xác thực, hỗ trợ byte range. Bài đang nghe được ưu tiên; khi đệm đủ, chuẩn bị bài gần nhất và phần đầu của tối đa hai bài sau theo kế hoạch 0005. Chỉ báo sẵn sàng khi bài gần nhất đã tải đủ và phần tử chờ có thể phát; nếu chưa đủ, giao diện báo đang tải và không tuyên bố phát liền mạch.
- Phép thử 0005 dùng bộ đệm phiên tối đa 50 MiB cho các bài không đang nghe, không lưu qua phiên và không bật nghe offline. Thiết kế player sản phẩm vẫn cần đo bộ nhớ, dữ liệu di động và hành vi iOS trên danh sách dài, tệp lớn và mạng yếu.
- Tệp MP3/M4A lớn hơn 25 MiB vẫn có thể nhập và phát theo luồng trực tiếp. Mốc 25 MiB thuộc phép thử prototype 0003, không phải giới hạn tải trước của phép thử 0005. Nếu bài kế tiếp chưa sẵn sàng hoặc vượt khả năng bộ đệm, giao diện phải báo rằng phát liên tục khi khóa màn hình chưa được bảo đảm; không âm thầm bỏ bài hoặc từ chối nhập.
- Người dùng phải xác nhận trước khi di chuyển/đổi tên tệp từ `incoming/` vào `songs/`; giữ nguyên tệp chưa chọn, tránh ghi đè. Tác vụ Drive và DB có thể thành công từng phần nên cần trạng thái thao tác, idempotency và đối soát khi lỗi.
- Upload từ web kiểm tra tối đa 200 MiB mỗi tệp ở cả UI và backend, truyền dạng stream đến Drive qua danh tính người dùng; từ chối trước khi upload khi có `Content-Length` vượt giới hạn và ngắt nếu byte thực tế vượt giới hạn. Không đọc toàn tệp vào RAM server.
- Bản đầu chỉ nhập/phát MP3 và M4A/AAC trên iPhone. Tệp định dạng khác vẫn thấy trong `incoming/` với thông báo chưa hỗ trợ và không bị đổi/xóa; không tự chuyển mã. Kiểm tra phần mở rộng, MIME và khả năng giải mã thực tế trước khi nhập; phần mở rộng không đủ để bảo đảm phát được.

## Các giai đoạn đề xuất

1. **Thiết kế hợp đồng:** chốt phần cần cho lát cắt: một root/Gmail, `incoming/`, `songs/`, quyền Drive, token và phát một bài; bài trùng và `lyrics.json` chờ giai đoạn tương ứng. Done — ADR 0001–0002 và `docs/DEVELOPMENT.md`.
2. **Lát cắt chạy được:** Next.js, Prisma migration đầu, OAuth, session bền vững, chọn/kiểm tra folder, quét và phát một bài bằng byte range. Done trên máy phát triển — migration đã áp; HTTP ẩn danh và OAuth redirect đã kiểm tra; người dùng xác nhận đăng nhập, chọn folder, kiểm tra Editor, chuẩn bị folder, quét và phát/tua. Hai tệp nhỏ phát được; MP3 8,5 MB đã đệm hết, tua và kết thúc trong Edge sau khi yêu cầu `preload="auto"` cho bài tối đa 25 MiB. Đăng nhập cùng Gmail ở cửa sổ InPrivate đã vào thẳng thư viện cũ. Trang `/queue-spike` của ứng dụng Next.js đã được thử riêng trên iPhone; chưa có kết quả thử iPhone cho player một bài ở trang gốc.
3. **Quản lý thư viện:** incoming, upload 200 MiB, xác nhận nhập, chỉ mục, tìm kiếm, playlist, yêu thích, thao tác idempotent/audit. Pending.
4. **Player iPhone:** hàng chờ, phát ngẫu nhiên/lặp lại, tải trước có giới hạn, điều khiển màn hình khóa; kiểm tra nhiều bài, mạng yếu và định dạng. Pending.
5. **Hoàn thiện:** ảnh bìa, lời đồng bộ theo dòng, giao diện responsive, vận hành/backup và phát hành. Pending.

Phê duyệt kế hoạch này cho phép thực hiện giai đoạn 1 và 2 với các quyết định đã chốt. Các phần chưa chốt trong giai đoạn 3–5 phải được hỏi và cập nhật kế hoạch trước khi code. Không triển khai thật lên Internet chỉ từ phê duyệt kiến trúc; domain, nhà cung cấp, cấu hình bảo mật và rollback phải được trình bày để duyệt ở kế hoạch phát hành.

## Điều cần chốt trước triển khai

1. **Đã xác nhận hướng stack:** một ứng dụng Next.js cùng PostgreSQL/Prisma. Hướng chạy Next.js như Node server liên tục nằm trong đề xuất; chi phí/nhà cung cấp/domain chọn sau khi đo tải MVP.
2. **Đã duyệt:** lưu refresh token người dùng đã mã hóa trên server để upload/tạo thư mục từ nhiều phiên.
3. **Đã duyệt định dạng và kích thước:** MP3 và M4A/AAC; bài trên 25 MiB vẫn nhập/phát thủ công, báo giới hạn chuyển bài nền; upload web tối đa 200 MiB mỗi tệp. Không thể lấy kết quả hai bài nhỏ để cam kết tệp lớn.
4. **Đã chốt folder và playlist:** một folder mỗi Gmail, chưa hỗ trợ đổi root sau thiết lập/nhập bài ở bản đầu; một bài chỉ xuất hiện một lần trong mỗi playlist. **Chưa chốt nghiệp vụ:** định dạng `lyrics.json`, ảnh bìa, xử lý bài trùng nội dung; ngắt kết nối Google có giữ dữ liệu chỉ mục không. Các mục này chặn triển khai phần tương ứng, không chặn lát cắt đăng nhập/chọn folder/phát một bài.

## Hoàn tác và điều kiện hoàn thành

- Mỗi giai đoạn có migration áp dụng theo phiên bản, sao lưu DB trước thay đổi có dữ liệu, và có thể đưa mã về bản trước nếu schema vẫn tương thích. Không tự động xóa dữ liệu Drive khi rollback ứng dụng.
- Hoàn thành MVP khi các luồng đã duyệt chạy được trên iPhone với quyền chỉ trong folder, phiên bền vững, nhập/upload/playlist/lyrics và player; lỗi/quyền/empty state rõ ràng; tài liệu vận hành cập nhật. Chỉ ghi “đã kiểm thử” cho phép thử thực sự được người dùng yêu cầu và đã chạy.

Đã tạo ứng dụng Next.js, cài dependency ghim phiên bản, sinh Prisma Client và áp migration đầu lên DB phát triển. Route ẩn danh đã được kiểm tra trên server địa phương; người dùng đã xác nhận luồng Gmail thật, folder, Editor, quét và phát/tua trong Edge. Trang thử hàng chờ `/queue-spike` đã có kết quả trên iPhone Safari và web app Màn hình chính: bài tải sẵn chuyển liên tục trong lần thử giới hạn, còn nhánh phát trực tiếp lúc trang ẩn có thể đứng ở giây 0. Chưa thử tệp lớn hơn 25 MiB, M4A/AAC, nhiều người dùng hoặc hosting.
