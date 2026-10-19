# 0005 — Tải bài đang nghe và bài kế tiếp

Trạng thái: Done — đã triển khai và thử hàng chờ trên danh sách quét ở Edge và iPhone ngày 19/10/2026. Playlist lưu PostgreSQL, nhập bài và migration vẫn thuộc giai đoạn sau. Yêu cầu này thay thế các đề xuất trước về tải đoạn đầu của toàn playlist và giữ đoạn đầu của mọi bài đã nghe.
Ngày: 19/10/2026.

## Quy tắc người dùng vừa chọn

- Khi bấm một bài, bắt đầu yêu cầu bài đó ngay, phát ngay khi trình duyệt có đủ dữ liệu hợp lệ và tiếp tục tải khi nghe.
- **Bài đang nghe là ưu tiên số 1** về băng thông, yêu cầu Drive và khả năng phát liên tục. Khi bài hiện tại đã đệm đủ để nghe ổn định, cố gắng chuẩn bị ít nhất 2 và mục tiêu 3 bài tiếp theo; không chờ tệp hiện tại tải đủ 100%. Nếu bài hiện tại thiếu đệm, tạm dừng/hạ ưu tiên tải trước. Người dùng duyệt quy tắc này ngày 19/10/2026.
- Bộ đệm tải trước/tái sử dụng tối đa 50 MiB, không giới hạn kích thước bài đang phát trực tiếp từ Drive. Tải đủ bài kế tiếp trước nếu bài đó vừa ngân sách; dùng phần còn lại cho đoạn đầu của tối đa 2 bài sau, rồi tải tiếp khi có chỗ. Nếu bài kế tiếp lớn hơn 50 MiB, tải một phần trong ngân sách và tiếp tục theo luồng lúc chuyển bài. Khi các bài đã nghe chiếm quá mức này, xóa dữ liệu bài cũ để dành cho bài sắp tới. Nếu Back vào bài đã bị xóa, tải lại và chấp nhận chờ vài giây. Người dùng duyệt ưu tiên/trần này ngày 19/10/2026.
- Bộ đệm chỉ phục vụ phiên nghe hiện tại, không tải nhạc để dùng ngoại tuyến hoặc giữ qua lần đóng/mở lại.
- Đổi ít yêu cầu Drive/ít lưu lượng tải trước hơn để giảm áp lực server. Dữ liệu âm thanh gốc vẫn trên Drive của người dùng.

## Hiện trạng và ràng buộc

Lát cắt Next.js hiện có scan và phát một bài qua HTTP Range; chưa có playlist, hàng chờ hoặc cache chủ động. Khi bấm, client gán src rồi gọi play() ngay; route xác minh tệp còn trong root được cấp phép rồi stream từ Drive. ADR 0001 yêu cầu xác minh đường dẫn hiện tại trước mỗi yêu cầu media tới server. Dữ liệu đã cấp cho trình duyệt trong phiên có thể còn phát từ Blob sau khi quyền Drive thay đổi; phép thử không thể thu hồi tức thời byte đã gửi tới trình duyệt. Không dùng lại Blob qua phiên mới.

Người dùng đã gặp trường hợp Edge ngừng tải MP3 8,5 MB trước cuối bài khi trình duyệt cho rằng đã đệm đủ. Sau đó preload=auto giúp tệp này tải hết trong phép thử, nhưng không bảo đảm mọi tệp/mọi trình duyệt đều tải 100% sớm. Tệp MP3/M4A lớn hơn 50 MiB vẫn phải phát được theo phạm vi sản phẩm đã chốt trước đây.

## Hướng triển khai đề xuất

1. Giữ phát bài được bấm bằng audio element và HTTP Range, không chờ tải toàn bộ trước khi phát.
2. Dùng hàng chờ riêng để chuẩn bị ít nhất 2, mục tiêu 3 bài tiếp theo theo thứ tự playlist khi còn bài và mạng/dung lượng cho phép. Bắt đầu khi vùng đệm của bài hiện tại đủ an toàn để nghe liên tục; bài đang phát luôn được ưu tiên và có thể tạm dừng tải trước khi mạng chậm. Nếu 50 MiB không đủ cho nhiều bài trọn vẹn, ưu tiên tải đủ bài gần nhất và phần đầu của các bài sau. Trường hợp trình duyệt tạm dừng tải phải có xử lý để bài gần nhất vẫn sẵn sàng trước khi chuyển nếu mạng cho phép.
3. 50 MiB là ngân sách cache cho bài đã qua và bài kế tiếp, không phải giới hạn độ lớn của bài đang stream. Khi cần chỗ, loại bài đã qua lâu nhất; Back vào bài bị loại thì dùng đường phát trực tiếp. Không giữ bắt buộc prefix của mọi bài đã qua — đây là thay đổi rõ so với đề xuất trước.
4. Giới hạn số yêu cầu Drive đồng thời trên mỗi phiên và toàn server. Phép thử hiện xếp hàng tải trước tuần tự trong tab và còn dùng rate limit audio theo user; bộ giới hạn đồng thời toàn server chưa triển khai, cần bổ sung trước khi mở nhiều người dùng. Không lưu cả bài trong RAM server; kiểm tra quyền và phiên bản trước mỗi yêu cầu tải Drive. Cache của phiên này chỉ ở tab hiện tại.
5. Đo thời gian bắt đầu, tải tiếp, chuyển bài, Back và tiêu thụ bộ nhớ trên Edge; thử riêng iPhone Safari/Home Screen khi khóa màn hình. Không cam kết độ trễ trước khi đo.

## Phép thử trên danh sách quét đã được duyệt

- Dùng thứ tự danh sách quét làm hàng chờ tạm. Người dùng bấm một bài để bắt đầu; các bài sau trong danh sách là bài tiếp theo. Không lưu thứ tự hoặc playlist vào DB. Giữ trang thử riêng để player hiện tại vẫn có thể so sánh.
- Bài đang nghe stream trực tiếp và được ưu tiên. Khi phần tử audio báo đủ dữ liệu (`HAVE_ENOUGH_DATA`) và đã đệm trước khoảng 12 giây (hoặc đến cuối tệp), tải đầy đủ bài gần nhất vào Blob nếu vừa ngân sách; gắn vào phần tử audio chờ và chỉ báo sẵn sàng sau `canplay`. Nếu phần đệm giảm dưới khoảng 4 giây, hủy yêu cầu tải trước đang chạy và nối tiếp về sau. Dùng hai phần tử audio luân phiên như prototype iPhone đã đạt.
- Hai bài xa hơn chỉ tải đoạn đầu có giới hạn trong bộ nhớ trình duyệt. Giữ chỗ tối đa 512 KiB cho mỗi bài này trước khi quyết định tải đủ bài gần nhất, để một bài sát trần 50 MiB không chiếm hết ngân sách. Khi bài đó trở thành bài gần nhất, tải phần còn lại nếu ngân sách cho phép và phiên bản tệp không đổi; nếu không thì dùng stream trực tiếp. Đoạn đầu chưa hoàn chỉnh không được đưa trực tiếp vào audio element như thể đó là cả bài.
- Cache trong tab tối đa 50 MiB cho bài không đang phát; loại bài cũ xa nhất khi cần chỗ. Bài đang phát trực tiếp không chịu hạn mức này. Abort tải trước khi bài hiện tại `waiting`/`stalled`, khi đổi lựa chọn hoặc rời trang; sau khi ổn định thì thử lại.
- 50 MiB là tổng byte âm thanh do ứng dụng chủ động giữ, không phải cam kết mức RAM của cả tab: Blob, bộ giải mã và phần đệm riêng của trình duyệt có thể dùng thêm bộ nhớ. Đo trên iPhone trước khi chọn giới hạn sản phẩm.
- Mỗi yêu cầu prefetch vẫn qua route audio đã xác thực và kiểm tra vị trí Drive hiện tại. Thêm thông tin phiên bản tệp từ danh sách Drive để từ chối ghép prefix với phần còn lại của phiên bản khác. Không log tên, ID, URL hay token trong chẩn đoán.
- Chẩn đoán ghi mốc bấm tới `playing`, trạng thái cache, chuyển bài và Back. Người dùng thử Edge trước, sau đó iPhone qua HTTPS ở Safari và biểu tượng Home Screen, kể cả khóa màn hình.

## Giới hạn phép thử

- Ba bài sắp tới có thể không tải đầy đủ nếu tổng vượt 50 MiB; bài gần nhất được ưu tiên, các bài còn lại chỉ có prefix hoặc chưa chuẩn bị. Không tuyên bố chuyển bài liền mạch nếu phần tử chờ chưa `canplay`.
- Bài đầu được bấm phát trực tiếp; browser giữ đệm của nó bên ngoài cache chủ động của phép thử. Vì vậy Back về bài đầu có thể cần tải lại dù bộ đệm chủ động chưa đạt 50 MiB. Cần thiết kế khác nếu muốn bảo đảm tái sử dụng byte của bài đang stream mà không tải trùng.
- Playlist bền vững, import, tìm kiếm, yêu thích và giao diện sản phẩm thuộc giai đoạn 3–5, cần kế hoạch riêng. Phép thử này không chứng minh iOS hoạt động khi mạng yếu hay với mọi MP3/M4A.

Không thêm dependency hoặc migration, không ghi/di chuyển tệp Drive, không sửa luồng phát hiện tại ở trang chính.

## Trạng thái thực thi

- Done — Trang thử `/queue-spike` dùng danh sách quét làm hàng chờ tạm, hai audio element, tải bài đang nghe trực tiếp và tải trước ba vị trí kế tiếp trong giới hạn 50 MiB.
- Done — Route media xác minh lại thư mục và MD5 cho từng yêu cầu tải trước; dữ liệu phiên được hủy khi dừng, rời trang hoặc đăng xuất qua thông báo cùng trình duyệt.
- Done — Người dùng đã gửi nhật ký Edge và xác nhận âm thanh đúng như log ngày 19/10/2026. Bài đầu phát sau 4.289 ms; các lần chuyển sang phần tử chờ đã sẵn sàng phát sau 4–9 ms; các lần mở lại bản đầy đủ còn trong cache phát sau 14–28 ms; một lần mở bài chưa có bản đầy đủ mất 3.522 ms. Nhật ký cũng có một lần chuyển sang luồng trực tiếp rồi người dùng chuyển tiếp trước khi bài đó kịp phát.
- Done — iPhone đã bộc lộ lỗi khi chạy nền: lúc `ended`, phần tử chờ hai lần có `currentTime=131,2` và `126,8` giây dù khi chuẩn bị ở 0; ở cuối log phần tử chờ báo `paused=false`. Cũng có lần bài đang phát từ 14,5 nhảy lên 166,5 giây sau khi người dùng mở lại app. Đã thêm kiểm tra/tạm dừng/đặt lại phần tử chờ và đồng bộ Media Session từ phần tử đang phát, cùng nhật ký `seek`/ẩn-hiện/bước nhảy vị trí. Người dùng xác nhận lần thử lại trong web app mở từ biểu tượng đã ổn, gồm chuyển bài, mở lại và Dynamic Island. Safari ban đầu kẹt “Loading…”; sau khi mở trang gốc, vượt cảnh báo ngrok và tải lại, người dùng đã vào được ứng dụng. Lần thử Safari không tua, chờ thông báo bài sau đã sẵn sàng rồi khóa màn hình, cho kết quả bài sau phát từ đầu và liên tục. Một lần thành công ở mỗi chế độ chưa chứng minh độ ổn định dài hạn.
- Pending — Giới hạn đồng thời toàn server và playlist bền vững thuộc kế hoạch triển khai sản phẩm sau phép thử này.

### Quan sát Safari sau lần thử đầu

Người dùng đã tua bài đang nghe tới 142 giây qua Media Session khi bài kế tiếp chưa có `standby ready`. Ở `ended`, trang chuyển sang HTTP stream trực tiếp; Safari phát sự kiện `playing` lúc `t=0` khi trang ẩn nhưng thời gian không tiến trong hơn 12 giây dù bộ đệm tăng. Đây là nhánh dự phòng chưa bảo đảm phát nền trên Safari. Trang thử đã bổ sung trạng thái sẵn sàng rõ trên giao diện và log tải trước bắt đầu/hủy. Lần thử tiếp theo chờ thông báo “Bài kế tiếp đã sẵn sàng” và không tua: người dùng xác nhận bài sau phát đúng từ đầu, liên tục khi khóa màn hình. Đường dự phòng khi chưa sẵn sàng vẫn là giới hạn cần xử lý trước khi dùng làm player sản phẩm.
