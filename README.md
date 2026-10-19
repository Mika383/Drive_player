# Drive Player

Ứng dụng web nghe nhạc cá nhân dùng một thư mục Google Drive của từng người dùng làm kho tệp. Giao diện có thể thêm vào Màn hình chính iPhone nhưng vẫn cần mạng.

**Trạng thái:** đang phát triển. Ứng dụng Next.js hiện đăng nhập Google, gắn và xác nhận thư mục, quét và phát tệp MP3/M4A/AAC trong thư mục đã cấp quyền. Trang `/queue-spike` là phép thử hàng chờ và tải trước, chưa phải player sản phẩm. Nhập bài, upload, playlist bền vững, yêu thích, ảnh bìa và lời đồng bộ chưa triển khai trong ứng dụng chính.

## Chạy trên máy phát triển

Khuyến nghị Node.js 24 (`package.json` cho phép Node.js 22 trở lên), Corepack/pnpm 10.16.0, PostgreSQL và Google Cloud OAuth/Drive đã cấu hình. Sao chép `.env.example` thành `.env`, điền thông tin cục bộ và giữ khóa tài khoản dịch vụ ngoài repository. Xem [hướng dẫn phát triển](docs/DEVELOPMENT.md) trước khi áp migration.

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm db:migrate
corepack pnpm db:generate
corepack pnpm dev
```

Mở `http://localhost:3000`. Tệp `.env` và khóa thật không được đưa vào Git.

## Tài liệu

- [Hồ sơ dự án](PROJECT_PROFILE.md): phạm vi sản phẩm, quyết định và việc chưa chốt.
- [Hướng dẫn phát triển](docs/DEVELOPMENT.md): cấu hình, API hiện có và kết quả thử cục bộ.
- [Kế hoạch MVP](docs/plans/0004-mvp-architecture-proposal.md) và [phép thử hàng chờ](docs/plans/0005-arbitrary-track-startup.md): giai đoạn đã làm và giới hạn còn lại.
- [ADR về quyền Drive](docs/adr/0001-drive-boundary-and-credentials.md) và [phạm vi phát nhạc iPhone](docs/adr/0002-ios-playback-scope.md).
- [Prototype Drive/iPhone](spikes/drive-ios/README.md) và [kết quả thử](spikes/drive-ios/RESULTS.md).

Đường chuyển bài đã tải sẵn đạt trong các lần thử iPhone giới hạn. Khi bài tiếp theo chưa sẵn sàng, Safari có thể báo đang phát nhưng đứng ở giây 0 lúc màn hình khóa. Chưa có kiểm chứng ổn định dài hạn hoặc triển khai production.
