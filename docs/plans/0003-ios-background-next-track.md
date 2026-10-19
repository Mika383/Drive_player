# 0003 — Thử phát bài kế tiếp khi web app iPhone ở nền

Trạng thái: Accepted — Done
Ngày: 19/10/2026
Được duyệt: 19/10/2026, bổ sung yêu cầu tải sẵn bài kế tiếp trong lúc bài cũ đang phát.

## Mục tiêu

Kiểm tra liệu chuẩn bị sẵn bài kế tiếp trong một phần tử `<audio>` thứ hai trước khi khóa màn hình có tránh được đoạn im lặng khi tự chuyển bài trên iPhone. Đây là phép thử kỹ thuật có giới hạn, không phải thiết kế player sản phẩm.

## Bằng chứng hiện có

- Prototype hiện thay `src` của cùng một `<audio>` khi nhận `ended`. Trong Home Screen web app, bài kế tiếp không phát âm thanh cho tới khi app hiện lại; nhật ký cho thấy `canplay`/`playing` chỉ xuất hiện lúc trang hiện lại. Biểu tượng mở trong Safari có khoảng 5 giây im lặng rồi bài mới bắt đầu lại từ 0. Safari mở trực tiếp chuyển bài bình thường. Xem `spikes/drive-ios/RESULTS.md`.
- [WebKit bug 261858](https://bugs.webkit.org/show_bug.cgi?id=261858) mô tả hiện tượng tương tự ở standalone, nhưng chưa chứng minh đây là cùng nguyên nhân trên iOS của người dùng. [WebKit](https://webkit.org/blog/6784/new-video-policies-for-ios/) ghi nhận giới hạn thao tác phát có tiếng nếu không bắt đầu từ cử chỉ người dùng; `preload` không bảo đảm bài tiếp theo được phép phát trong nền.

## Phương án đề xuất

1. Thêm trang chẩn đoán riêng trong prototype, giữ player hiện tại để so sánh. Trang dùng phiên đăng nhập và endpoint `/audio/:id` hiện có; chỉ liệt kê bài thuộc thư mục đã xác nhận. Người dùng chọn hai bài thử phù hợp.
2. Khi người dùng bấm Phát, dùng hai phần tử `<audio>` luân phiên. Trong lúc bài hiện tại phát, tải **toàn bộ** bài kế tiếp từ endpoint đã xác thực vào bộ nhớ trình duyệt (tối đa 25 MiB), gắn Blob URL vào phần tử audio còn lại và đợi phần tử đó báo có dữ liệu phát. Giao diện chỉ báo “Sẵn sàng thử” khi tải xong và có dữ liệu; nếu không đạt trước khi bài đầu hết, lần thử là không hợp lệ, không được kết luận iOS chặn chuyển bài.
3. Khi `ended`, gọi `play()` trên phần tử đã chuẩn bị; ghi thời điểm tải xong, `loadedmetadata`, `canplay`, `ended`, `play()` resolved/rejected, `playing`, `currentTime`, `visibilityState` và `readyState`. Nhật ký không chứa tên bài, file ID, URL, token hoặc cookie. Blob URL cũ được thu hồi khi không còn dùng; không lưu âm thanh vào localStorage/IndexedDB.
4. Chỉ tải trước một bài, áp giới hạn kích thước ngay cả khi server không gửi `Content-Length`, và giữ kiểm tra quyền `/audio/:id` hiện có. Không tải tệp về máy chủ, không chuyển mã, không thêm package, không sửa tệp trên Drive. Nếu bài thử lớn hơn 25 MiB, chọn bài nhỏ hơn; giới hạn này chỉ phục vụ phép thử, chưa phải giới hạn sản phẩm.
5. Bật lại HTTPS tunnel tạm, người dùng thử ít nhất hai lần chuyển bài sau khi khóa màn hình trong Home Screen web app và biểu tượng mở Safari; so sánh với kết quả player cũ. Sau khi thử, dừng tunnel, tắt server và trả `BASE_URL` về localhost.

## Điều kiện đạt

Bài kế tiếp đã tải xong và sẵn dữ liệu trước khi bài cũ kết thúc; sau đó có âm thanh liên tục khi tự chuyển, không tua lại 0, không cần đưa app ra tiền cảnh, và điều khiển màn hình khóa vẫn dùng được trong cả hai kiểu biểu tượng. Kết quả phải được người dùng thử trên iPhone thật; kiểm tra desktop không thay thế được.

## Rủi ro và điểm dừng

- Hai phần tử audio có thể bị iOS xem là hai lần phát riêng; `play()` của bài sau có thể bị chặn dù đã tải trước. Tải sớm nguyên bài tăng sử dụng mạng và bộ nhớ, nên chỉ dùng cho phép thử có giới hạn; đây chưa phải lựa chọn kiến trúc sản phẩm.
- Nếu không đạt, lưu nhật ký và dừng; không mở rộng sang HLS, chuyển mã, Media Source hoặc ứng dụng gốc trong kế hoạch này. Các hướng đó thay đổi đáng kể kiến trúc, chi phí và hỗ trợ định dạng, cần đánh giá/duyệt riêng.
- Nếu đạt, vẫn cần thiết kế player sản phẩm và thử với nhiều định dạng, mạng yếu, danh sách dài trước khi cam kết hỗ trợ chính thức.

## Hoàn tác

Trang chẩn đoán và route tĩnh có thể gỡ độc lập; player hiện tại không đổi. Không có migration hoặc dữ liệu Drive phải hoàn tác.

## Kết quả 19/10/2026

- Người dùng thử trên iPhone iOS 26.6.2. Sau khi trang báo bài kế tiếp đã tải xong và sẵn dữ liệu, Home Screen web app tự chuyển hai lần liên tiếp với âm thanh liền mạch; điều khiển phát/tạm dừng trên màn hình khóa hoạt động.
- Biểu tượng Màn hình chính mở trong Safari cũng tự chuyển hai lần liên tiếp và điều khiển màn hình khóa hoạt động; không còn thấy đoạn im lặng/tua về 0 của player cũ trong lần thử này.
- Chỉ có báo cáo thực tế từ người dùng, chưa có nhật ký media của các lần chuyển hoặc kiểm chứng độc lập trên thiết bị. Chưa chứng minh tải sẵn toàn bộ bài là giải pháp sản phẩm; điều kiện thử giới hạn ở hai bài nhỏ và mạng đang dùng.
- Nhánh chẩn đoán giữ riêng để so sánh. Player gốc chưa thay đổi. Tunnel và server đã dừng sau khi thử; cấu hình cục bộ trả về localhost.
