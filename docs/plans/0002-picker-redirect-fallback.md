# 0002 — Thử Picker chuyển hướng trên iPhone

Trạng thái: Accepted — Done
Ngày: 19/10/2026
Được duyệt: 19/10/2026

## Mục tiêu và phát hiện hiện tại

Hộp Google Picker nhúng đôi lúc hiển thị “Can't access your Google Account” trên iPhone, cả khi mở trực tiếp trong Safari và từ biểu tượng. Người dùng đã mở Drive trong Safari bằng đúng Gmail nhưng lỗi vẫn còn. Prototype đã xác thực Google bằng OAuth phía server, dùng `drive.file` và chỉ chấp nhận thư mục My Drive do tài khoản đăng nhập sở hữu. Không thay đổi ranh giới quyền này.

Google mô tả luồng Picker chuyển hướng bằng `trigger_onepick=true`: yêu cầu OAuth riêng chỉ có scope `drive.file`, `prompt=consent`, `allow_folder_selection=true`, rồi trả `picked_file_ids` về callback. Tài liệu trình bày luồng này chủ yếu cho ứng dụng desktop/mobile, nên khả năng áp dụng với web app phải được thử thực tế, không coi là đã bảo đảm. Nguồn: [Google Picker cho desktop/mobile](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker), [so sánh các luồng](https://developers.google.com/workspace/drive/picker/guides/overview).

## Phạm vi đề xuất

1. Giữ nút Picker nhúng hiện tại. Thêm lựa chọn **Chọn thư mục qua Google** để mở luồng chuyển hướng toàn trang, chỉ trong prototype.
2. Tạo state ngẫu nhiên một lần, hết hạn nhanh, gắn với phiên đăng nhập hiện có. Callback phải đối chiếu state, cookie phiên, mã lỗi/hủy, đúng một folder ID và chỉ xử lý một lần.
3. Trao đổi authorization code trên server. Chỉ yêu cầu và chấp nhận `drive.file` trong luồng chọn thư mục mới; không thêm scope đọc toàn Drive. Dùng `about.get` chỉ với trường `user.emailAddress` để xác nhận token mới thuộc đúng Gmail đã đăng nhập; không đọc metadata tệp bên ngoài thư mục. Sau đó kiểm tra metadata thư mục, chủ sở hữu và quyền thêm tệp. Tiếp tục bước xác nhận Editor của tài khoản dịch vụ như cũ.
4. Không log authorization code, token, cookie, folder ID hay nội dung Drive. Không gửi token mới cho browser. Token của prototype vẫn chỉ giữ trong bộ nhớ; không thêm database hoặc dependency.
5. Nếu Google không hỗ trợ luồng chuyển hướng cho web client, ghi lỗi chính xác rồi dừng thử. Không mở rộng quyền Drive hoặc tự bỏ qua Picker.

## Ảnh hưởng và rủi ro

- API/callback: mở rộng `/oauth/callback` để phân biệt đăng nhập và chọn thư mục bằng state; giữ đường đăng nhập cũ hoạt động.
- Session: phải gắn folder được trả về với đúng tài khoản và đúng phiên đã khởi tạo chọn thư mục; không chấp nhận ID tùy ý từ callback.
- OAuth: Google có thể yêu cầu consent lại. Luồng chuyển hướng có thể không được phép với web app dù tài liệu nêu client web. Rủi ro: Medium.
- Thiết bị: cần người dùng thử trên iPhone thật. Không kết luận từ kiểm tra URL hoặc desktop.
- Vấn đề phát nhạc nền ở web app độc lập là vấn đề khác; thay Picker không giải quyết chuyển bài bị im lặng.

## Xác minh và hoàn tác

- Kiểm tra callback sai/thiếu state, phiên khác, nhiều ID, hủy thao tác đều bị từ chối; xác nhận không đổi folder đang chọn khi lỗi.
- Thử lại Picker nhúng và đăng nhập cũ để bảo đảm không hỏng luồng đang hoạt động.
- Trên iPhone, thử chọn đúng thư mục, xác nhận Editor, quét và phát bài; thử chọn folder ngoài quyền hoặc không thuộc sở hữu phải bị từ chối.
- Nếu luồng chuyển hướng không dùng được, bỏ nút/nhánh mới và giữ prototype hiện tại; không có migration hay dữ liệu Drive phải hoàn tác.

## Điều kiện hoàn thành

Có kết quả thực tế trên iPhone cho lựa chọn Picker chuyển hướng, ghi đạt/không đạt và lỗi nếu có vào `spikes/drive-ios/RESULTS.md`. Không thay đổi scope Drive, không để lộ secret, không sửa các tệp nhạc hiện có.

## Kết quả 19/10/2026

- Picker chuyển hướng ban đầu mở được nhưng chạm thư mục chỉ đi vào bên trong. Thêm `mimetypes=application/vnd.google-apps.folder` theo tham số lọc của Google, giữ `allow_folder_selection=true` và `drive.file`.
- Người dùng thử lại trên iPhone, chọn được thư mục thử nghiệm và xác nhận Editor, quét, phát bài đều thành công. Đây là báo cáo thử thực tế của người dùng; chưa có kiểm tra độc lập trên thiết bị.
- Mã đã qua `node --check`; thử URL OAuth bằng thư viện và cấu hình giả xác nhận ba tham số Picker được giữ. Route chưa đăng nhập và state sai bị từ chối ở kiểm tra cục bộ.
- Chưa thử riêng trường hợp chọn thư mục không thuộc sở hữu hoặc ngoài quyền trên iPhone. Backend dùng lại hàm kiểm tra loại, quyền thêm tệp và chủ sở hữu của luồng Picker nhúng.
