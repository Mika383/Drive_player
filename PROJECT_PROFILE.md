# Drive Player — hồ sơ dự án

## Trạng thái

- Prototype Drive/iPhone nằm trong `spikes/drive-ios`. Ứng dụng Next.js gốc repo đã hoàn thành lát cắt giai đoạn 1–2 của kế hoạch 0004 trên máy phát triển: migration, đăng nhập Google, chọn/xác nhận folder, quét và phát/tua một bài. Người dùng đã thử hai tệp nhỏ và một MP3 8,5 MB trên Edge; bài lớn đã đệm tới cuối, tua và kết thúc sau khi điều chỉnh tải trước. Đăng nhập cùng Gmail trong cửa sổ InPrivate vào thẳng thư viện mà không phải chọn folder lại.
- Trang `/queue-spike` thử hàng chờ tạm theo danh sách quét, tối đa 50 MiB bộ đệm phiên và hai phần tử audio. Người dùng đã thử trên Edge và iPhone: khi bài kế tiếp báo sẵn sàng, chuyển bài khi khóa màn hình đạt trong một lần thử lại ở Safari và web app Màn hình chính. Nhánh phát trực tiếp khi bài sau chưa sẵn sàng vẫn có thể đứng ở giây 0 trên Safari lúc trang ẩn. Kết quả này chưa chứng minh độ ổn định dài hạn; trang thử chưa được typecheck/build bởi agent. Playlist lưu PostgreSQL và nhập bài vẫn chưa triển khai.
- Repository GitHub `Mika383/Drive_player` là Public. `origin` dùng alias SSH `github-mika383`; danh tính commit Mika383 chỉ được cấu hình trong repository này.

## Mục đích và người dùng

- Ứng dụng nghe nhạc cá nhân cho nhiều người dùng, ưu tiên iPhone ở phiên bản đầu.
- Sản phẩm là web app, có thể thêm vào màn hình chính điện thoại để truy cập như ứng dụng (hướng PWA); vẫn cần kết nối mạng để sử dụng.
- Mỗi người dùng đăng nhập Google và sử dụng một thư mục Google Drive của chính họ làm kho tệp nhạc, ảnh bìa và lời bài hát.
- Phiên bản đầu hỗ trợ tài khoản Gmail cá nhân; Google Workspace chưa thuộc phạm vi đã chốt.
- Giai đoạn đầu, mỗi thư viện chỉ dành cho chủ sở hữu. Chia sẻ giữa người dùng hoặc thư viện công khai là hướng phát triển sau, chưa thuộc phạm vi đầu tiên.

## Yêu cầu sản phẩm đã xác nhận

- Ứng dụng chỉ được đọc/ghi bên trong thư mục Drive được người dùng cho phép; không được đọc ngoài thư mục đó.
- Người dùng chấp nhận chia sẻ thư mục này cho tài khoản dịch vụ của ứng dụng với quyền Editor. Prototype và lát cắt Next.js đã xác nhận chọn/kiểm tra thư mục, quét và phát trong phạm vi thử; thao tác nhập/upload sản phẩm và kiểm thử cách ly nhiều người dùng còn chưa hoàn thành.
- Có thư mục riêng để người dùng thả nhiều tệp nhạc. Ứng dụng hiển thị danh sách chờ để lọc/chọn và xác nhận nhập.
- Tệp chưa được chọn giữ nguyên trong thư mục chờ. Người dùng có thể phát chúng trước khi nhập.
- Sau xác nhận nhập, ứng dụng được di chuyển/đổi tên tệp trong thư mục đã cấp quyền để tổ chức thư viện; không ghi đè tệp khi trùng tên.
- Tải nhạc lên từ web là một luồng sử dụng; ứng dụng tổ chức tệp trong thư mục Drive đã cấp quyền.
- Ảnh bìa và lời đồng bộ là tùy chọn. Nhạc không có các tệp này vẫn phát được.
- Lời bài hát được chỉnh thủ công theo từng câu/dòng. Khi phát, danh sách lời cuộn để câu hiện tại trượt vào vùng sáng cố định; chưa cần tô sáng từng chữ.
- Bản đầu không có nhận diện lời hoặc căn mốc tự động.
- Máy chủ được phép lưu tài khoản, chỉ mục bài hát, playlist và cài đặt để quản lý/tìm kiếm nhanh. Tệp âm thanh, ảnh bìa và lời bài hát nằm trên Drive của người dùng.
- Playlist cá nhân thuộc phạm vi phiên bản đầu.
- Tìm kiếm trong thư viện và hàng chờ phát thuộc phạm vi phiên bản đầu; hàng chờ có phát tiếp, phát ngẫu nhiên và lặp lại.
- Danh sách bài hát Yêu thích thuộc phạm vi phiên bản đầu.
- Mong muốn phát nhạc trên web khi iPhone tắt màn hình.
- Phiên bản đầu không có chế độ tải nhạc để nghe offline.

## Cấu trúc tệp đang đề xuất

```text
Thư mục được cấp quyền/
├─ incoming/                 # tệp chờ người dùng chọn nhập
└─ songs/
   └─ <mã bài hát>/
      ├─ audio.<định dạng gốc>
      ├─ cover.<định dạng ảnh>  # tùy chọn
      └─ lyrics.json           # tùy chọn
```

`incoming/` và `songs/` đã được duyệt và được lát cắt hiện tại tạo/kiểm tra. Cấu trúc riêng cho từng bài trong `songs/` và định dạng `lyrics.json` vẫn là đề xuất, chưa được duyệt thành hợp đồng dữ liệu. Việc sắp xếp tệp nhạc chỉ diễn ra sau khi người dùng xác nhận nhập.

## Rủi ro và việc cần kiểm chứng

- Prototype đã liệt kê/phát tệp mới được thả vào thư mục chia sẻ; cần kiểm tra thêm các trường hợp quyền kế thừa bị giới hạn và thao tác sắp xếp trong sản phẩm.
- Một tệp thử ngoài thư mục đã bị Google Drive từ chối và endpoint prototype cũng từ chối theo báo cáo người dùng; cần kiểm tra rộng hơn ranh giới quyền giữa nhiều tài khoản trước khi triển khai công khai.
- Phát và điều khiển khi khóa màn hình đã đạt trong các phép thử giới hạn trên iPhone. Nhánh chuyển bài khi chưa tải sẵn còn lỗi trên Safari; chưa cam kết hành vi đồng nhất giữa các phiên bản iOS, định dạng và điều kiện mạng.
- MP3 và M4A/AAC đã được chọn cho bản đầu; khả năng giải mã các biến thể tệp trên iPhone vẫn cần kiểm tra.
- Thiết kế đồng bộ và phục hồi khi tệp Drive bị đổi, xóa, thu hồi quyền, hoặc khi thao tác Drive thành công nhưng cập nhật chỉ mục máy chủ thất bại.

## Hướng kiến trúc đã xác nhận

- Một ứng dụng Next.js App Router dùng TypeScript cho web và API `/v1`; không tách Vite/Fastify. PostgreSQL/Prisma 7 cho dữ liệu, pnpm cho một package. Kế hoạch `docs/plans/0004-mvp-architecture-proposal.md` đã được duyệt riêng giai đoạn 1–2. Xem `docs/DEVELOPMENT.md` và ADR 0001–0002.
- Máy chủ lưu refresh token Google đã mã hóa bằng AES-256-GCM trong lát cắt hiện tại. Luân chuyển khóa và luồng thu hồi/ngắt kết nối Google còn cần thiết kế trước khi triển khai sản phẩm.
- Bản đầu nhận MP3 và M4A/AAC; tệp khác giữ nguyên trong `incoming/` và báo chưa hỗ trợ. Không tự chuyển mã.
- Tệp nhạc trên 25 MiB vẫn có thể nhập/phát, nhưng phải báo giới hạn tự chuyển bài khi khóa màn hình. Upload từ web tối đa 200 MiB mỗi tệp; tệp thả trực tiếp vào Drive không chịu giới hạn upload của web.

## Chưa quyết định

- Nhà cung cấp hạ tầng, tên miền, chi phí, bản chạy sản phẩm và chi tiết vận hành. Mô hình một tiến trình Next.js chạy liên tục cùng PostgreSQL đã được duyệt, chưa triển khai.
- Phạm vi tính năng chính của phiên bản đầu đã được xác nhận; chi tiết nghiệp vụ và hợp đồng dữ liệu còn cần thiết kế.
- Chi tiết định dạng `lyrics.json`, metadata bài hát, quy tắc nhận diện trùng và cấu trúc thư mục chính thức.
- Định dạng ảnh, chi tiết xử lý tệp không hợp lệ và cách áp dụng giới hạn upload 200 MiB; định dạng nhạc MP3/M4A/AAC và mức upload đã được chốt nhưng chưa triển khai luồng nhập/upload sản phẩm.
- Hoàn thiện giới hạn tài nguyên và bảo vệ đường truyền nhạc, token, dữ liệu người dùng trước khi mở nhiều người dùng trên Internet; lát cắt hiện tại đã có xác thực, kiểm tra thư mục và mã hóa token.
