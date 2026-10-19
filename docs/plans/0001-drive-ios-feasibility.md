# 0001 — Kiểm chứng Drive và phát nền iPhone

Trạng thái: Done — phép thử bổ sung 0003 đạt có điều kiện
Được duyệt: 19/10/2026

## Mục tiêu

Kiểm chứng hai điều kiện bắt buộc trước khi chọn stack sản phẩm: (1) ứng dụng chỉ có quyền đọc/ghi trong thư mục My Drive của từng người dùng Gmail cá nhân; (2) web app phát nhạc liên tục trên iPhone khi khóa màn hình, kể cả chuyển bài.

## Yêu cầu và phạm vi đã duyệt

- Người dùng đăng nhập Google, chọn một thư mục Drive và cấp Editor cho tài khoản dịch vụ chỉ trên thư mục đó.
- Người dùng có thể thả nhạc vào `incoming/`, phát trước khi nhập, rồi xác nhận chuyển bài được chọn vào thư viện; tệp chưa chọn giữ nguyên.
- Tải lên và tạo tệp/thư mục trong My Drive phải dùng danh tính của người dùng, không dùng tài khoản dịch vụ làm chủ sở hữu.
- Kiểm tra quyền đọc tệp ở ngoài thư mục được chia sẻ phải thất bại.
- Kiểm tra phát, tua, chuyển bài trong Safari và web app được thêm vào màn hình chính trên iPhone thật, cả khi khóa màn hình.
- Chỉ tạo prototype kiểm chứng, tài liệu cấu hình và kết quả thử. Chưa xây UI sản phẩm, cơ sở dữ liệu, playlist hoặc chọn stack chính thức.

## Hiện trạng

- Repository mới, đã có prototype kiểm chứng trong `spikes/drive-ios`; chưa có ứng dụng sản phẩm hoặc cơ sở dữ liệu.
- Node.js có sẵn; chưa có Google Cloud SDK.
- Người dùng có Google Cloud project và sẽ cấu hình thông tin xác thực cục bộ. Không đưa khóa hoặc client secret vào Git/chat.

## Phương án kiểm chứng

1. Dùng một máy chủ Node.js nhỏ chỉ cho prototype. Tài khoản dịch vụ và OAuth token chỉ nằm ở phía server, trừ access token ngắn hạn cần thiết cho Google Picker.
2. Chọn thư mục bằng Google Picker với quyền `drive.file`; người dùng cấp quyền Editor cho tài khoản dịch vụ. Không yêu cầu scope đọc toàn bộ Drive cho người dùng.
3. Dùng tài khoản dịch vụ để liệt kê thư mục và đọc tệp; dùng OAuth người dùng để tạo `incoming/` và `songs/`, thử tải lên; chỉ di chuyển tệp sau thao tác xác nhận.
4. Phát qua endpoint có xác thực, kiểm tra tệp thuộc thư mục đã chọn, truyền byte range từ Drive để iPhone có thể tua. Không trả service account token hoặc khóa cho trình duyệt.
5. Ghi bằng chứng từng trường hợp và rủi ro còn lại. Nếu một điều kiện bắt buộc thất bại, dừng trước khi dựng kiến trúc MVP và trình bày lựa chọn cho người dùng.

## Phương án khác đã cân nhắc

- OAuth với scope đọc toàn Drive: trái yêu cầu bảo mật, loại bỏ.
- Chỉ dùng tài khoản dịch vụ để tạo tệp trong My Drive cá nhân: không phù hợp giới hạn sở hữu tệp của Google, loại bỏ.
- Chọn stack sản phẩm trước khi thử Drive/iPhone: có nguy cơ phải làm lại, hoãn.

## Bảo mật và dữ liệu

- Mỗi request phải gắn với thư mục đã chọn; từ chối file ID không nằm trong cây thư mục đó.
- Không log token, service account key, nội dung nhạc hoặc lời bài hát.
- Secret chỉ lấy từ biến môi trường/đường dẫn ngoài repository; `.gitignore` chặn tệp cấu hình cục bộ.
- Prototype chỉ dành cho thử nghiệm, không triển khai công khai như dịch vụ đa người dùng.
- Tệp mẫu và thư mục thử nghiệm do người dùng chọn; không xóa hoặc ghi đè tệp có sẵn.

## Các bước và trạng thái

| Bước | Trạng thái |
| --- | --- |
| Kiểm tra tài liệu API và điều kiện truy cập | Done |
| Tạo prototype và hướng dẫn cấu hình an toàn | Done |
| Kiểm tra OAuth, cấp quyền, liệt kê, đọc, tạo, di chuyển và chặn truy cập ngoài thư mục | Done — theo kết quả prototype, xem RESULTS.md |
| Chuẩn bị HTTPS tunnel ngrok cho iPhone | Done |
| Kiểm tra phát/tua/chuyển bài trên iPhone Safari và Home Screen | Done — Safari trực tiếp đạt; hai kiểu biểu tượng chưa đạt phát liên tục |
| Chẩn đoán lỗi chuyển bài ở Home Screen | Done — có nhật ký media cho web app độc lập, chưa xác nhận nguyên nhân tuyệt đối |
| Tổng hợp kết quả và lựa chọn hướng sản phẩm | Done — dừng trước khi chốt stack/MVP vì điều kiện bắt buộc chưa đạt |

## Điều kiện hoàn thành

- Có kết quả đạt/chưa đạt cho từng luồng Drive, kèm mã lỗi khi thất bại.
- Có kết quả thực tế trên iPhone cho Safari và Home Screen, gồm phát khi khóa màn hình và chuyển bài.
- Có kết luận khả thi hoặc phương án thay thế cho mọi điều kiện bắt buộc.
- Không có secret trong repository; không có tệp người dùng bị đổi nếu chưa xác nhận.

## Phụ thuộc và rủi ro

- Cần Google Cloud OAuth web client, API key, project number, service account và quyền truy cập iPhone thật.
- Cần URL HTTPS để thử trên iPhone; địa chỉ triển khai tạm và callback OAuth sẽ được cấu hình sau.
- Google Drive có thể hạn chế tạo tệp với `drive.file` trong thư mục người dùng chọn; phải kiểm tra thực tế.
- iOS có thể thay đổi hành vi phát nền giữa Safari và Home Screen; không suy luận thành công từ tài liệu trình duyệt.
- Phát nhạc qua máy chủ làm tăng băng thông và yêu cầu bảo vệ endpoint; chi phí và kiến trúc vận hành sẽ đánh giá sau prototype.

## HTTPS tạm để thử iPhone — đã duyệt

Người dùng chưa có tên miền riêng và đã duyệt dùng ngrok ngày 19/10/2026. Dùng một ngrok dev domain tĩnh và HTTPS tunnel tới `127.0.0.1:8765`, chỉ trong thời gian thử với Gmail và thư mục Drive thử nghiệm. ngrok 3.39.11 đã được cài; tài khoản/token và dev domain do người dùng tự cấu hình cục bộ. Đặt `BASE_URL` bằng HTTPS URL được cấp, bổ sung origin/callback tương ứng trong Google OAuth client và domain đó trong giới hạn website của Picker API key. Sau khi thử Safari và Home Screen, dừng tunnel và đổi cấu hình local về `http://localhost:8765`.

Dev domain đã nhận: `dexterous-each-yodel.ngrok-free.dev`. Người dùng xác nhận đã cấu hình authtoken và các URL Google Cloud. Bản ngrok Microsoft Store xác nhận cấu hình hợp lệ; tunnel đã được bật. URL HTTPS trả HTTP 200, chuyển tiếp đến `localhost:8765`; OAuth redirect từ prototype trỏ đúng `https://dexterous-each-yodel.ngrok-free.dev/oauth/callback`. Người dùng đã đăng nhập và phát nhạc trên iPhone; kết quả chi tiết, gồm lỗi chuyển bài khi web app chạy nền, nằm trong `spikes/drive-ios/RESULTS.md`.

Trong thời gian thử, tunnel đưa prototype cục bộ ra Internet qua bên thứ ba, bao gồm luồng OAuth, cookie phiên và âm thanh mẫu. Tunnel đã dừng sau phép thử; `BASE_URL` đã trả về localhost như phạm vi đã duyệt.

## Kết quả cuối phép thử 19/10/2026

- Chọn folder trên iPhone đã dùng được qua Picker chuyển hướng với bộ lọc MIME thư mục; xác nhận Editor, quét và phát bài thành công theo báo cáo người dùng. Picker nhúng vẫn có lúc báo không truy cập được Google Account. Xem [kế hoạch Picker 0002](0002-picker-redirect-fallback.md) và `spikes/drive-ios/RESULTS.md`.
- Safari mở trực tiếp phát, tua và tự chuyển bài khi khóa màn hình. Web app độc lập từ biểu tượng chuyển metadata nhưng bài sau im lặng cho tới khi mở lại. Biểu tượng mở trong Safari có khoảng 5 giây im lặng rồi bài sau bắt đầu lại từ 0. Do đó trải nghiệm mở từ biểu tượng chưa đáp ứng điều kiện phát liên tục.
- Ngrok tunnel và server prototype đã dừng; `BASE_URL` cục bộ đã trả về `http://localhost:8765`. Đã kiểm tra không còn listener trên 8765/4040. Không có thay đổi nào lên tệp Drive do bước dọn dẹp này.
- Sau kết quả ban đầu, người dùng duyệt phép thử bổ sung [0003](0003-ios-background-next-track.md): hai phần tử audio và tải sẵn toàn bộ một bài kế tiếp dưới 25 MiB. Người dùng xác nhận hai lần chuyển liên tục trong cả web app độc lập và biểu tượng mở Safari, điều khiển màn hình khóa hoạt động. Điều kiện phát nền đã **đạt trong phép thử giới hạn**; chưa đủ bằng chứng cho thư viện lớn, nhiều định dạng và mạng yếu.
- Chưa chốt stack hoặc dựng MVP. Cần đưa giải pháp tải trước có giới hạn bộ nhớ/dữ liệu vào thiết kế sản phẩm, có trạng thái dự phòng khi bài sau chưa tải xong.
