import React, { useEffect, useState } from "react";
import axios from "axios";
import { Clock, CheckCircle2, AlertCircle, MessageSquare } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import BookingChatDrawer from "../../components/chat/BookingChatDrawer";
import { useSearchParams, useNavigate } from "react-router-dom";
import { io } from "socket.io-client";

export default function BookingListPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 채팅방 서랍장 상태
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  // 쿼리 매개변수 확인용 (채팅 알림 등에서 바로 열기용)
  const [searchParams, setSearchParams] = useSearchParams();
  const openChatId = searchParams.get("openChat");

  // 로그인한 화주 정보
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get("http://localhost:5000/api/schedules/bookings", { withCredentials: true })
      .then((res) => {
        if (res.data.success) {
          setBookings(res.data.data);
        }
      })
      .catch((err) => {
        console.error("부킹 내역 조회 실패:", err);
        setError(`예약 내역을 불러오는 중 오류가 발생했습니다. (${err.response?.data?.message || err.message})`);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // 실시간 부킹 반려(삭제) 소켓 수신 처리
  useEffect(() => {
    const socket = io("http://localhost:5000");

    socket.on("connect", () => {
      console.log("BookingListPage socket connected");
    });

    socket.on("booking_rejected", (data) => {
      console.log("실시간 부킹 반려 감지 ➔ 목록에서 즉시 제거:", data);
      setBookings((prev) => prev.filter((b) => b.id !== data.bookingId));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // 쿼리 파라미터(openChat) 감지하여 특정 대화방 바로 열기
  useEffect(() => {
    if (openChatId && bookings.length > 0) {
      const bk = bookings.find((b) => b.id === Number(openChatId));
      if (bk) {
        setSelectedBooking(bk);
        setIsChatOpen(true);
        // 처리 후 주소창 쿼리스트링 비워주기
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("openChat");
        setSearchParams(newParams, { replace: true });
      }
    }
  }, [openChatId, bookings]);

  const handleOpenChat = (bk: any) => {
    setSelectedBooking(bk);
    setIsChatOpen(true);
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <p className="text-slate-500 text-sm">
          화물 예약 요청 후 담당 오퍼레이터가 확인을 완료하면 예약 상태가 <strong className="text-blue-600 font-bold">확정(Confirmed)</strong>으로 변경되며, 새로운 B/L이 발행됩니다.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">최근 부킹 요청 내역</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500">불러오는 중...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : bookings.length === 0 ? (
            <div className="p-8 text-center text-slate-500">요청한 부킹 내역이 없습니다. 스케줄 메뉴에서 예약을 신청해 주세요.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="p-4 font-bold">예약 번호</th>
                  <th className="p-4 font-bold">요청 일자</th>
                  <th className="p-4 font-bold">선박명</th>
                  <th className="p-4 font-bold">구간 (POL ➔ POD)</th>
                  <th className="p-4 font-bold text-center">선적 조건</th>
                  <th className="p-4 font-bold text-center">진행 상태</th>
                  <th className="p-4 font-bold text-center">대화/문의</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((bk) => (
                  <tr 
                    key={bk.id} 
                    className={`hover:bg-slate-50 transition ${bk.status === "Confirmed" && bk.bl_number ? "cursor-pointer" : ""}`}
                    onClick={() => {
                      if (bk.status === "Confirmed" && bk.bl_number) {
                        navigate(`/?bl=${bk.bl_number}`);
                      }
                    }}
                  >
                    <td className="p-4 font-bold text-slate-800 align-top">
                      <div>BK-{bk.id.toString().padStart(5, "0")}</div>
                      {bk.status === "Confirmed" && bk.bl_number && (
                        <div className="mt-1">
                          <span 
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(bk.bl_number);
                              alert(`B/L 번호 (${bk.bl_number})가 복사되었습니다. 메인 대시보드의 트래킹 창에 붙여넣어 단계를 모니터링할 수 있습니다.`);
                            }}
                            className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 transition px-1.5 py-0.5 rounded cursor-pointer"
                            title="클릭하여 복사"
                          >
                            B/L: {bk.bl_number} (복사)
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="p-4 text-slate-600 text-sm align-top">
                      {bk.created_at ? new Date(bk.created_at).toLocaleDateString("ko-KR") : "-"}
                    </td>
                    <td className="p-4 text-slate-800 font-semibold align-top">{bk.vessel_name || "-"}</td>
                    <td className="p-4 text-slate-600 text-sm align-top">
                      {(bk.pol || "").split(",")[0] || "-"} ➔ {(bk.pod || "").split(",")[0] || "-"}
                    </td>
                    <td className="p-4 text-slate-600 text-sm text-center align-top">
                      ETD: {bk.etd && typeof bk.etd === "string" ? bk.etd.split("T")[0] : "-"} <br /> ETA: {bk.eta && typeof bk.eta === "string" ? bk.eta.split("T")[0] : "-"}
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex items-center justify-center">
                        {bk.status === "Confirmed" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                            <CheckCircle2 size={14} />
                            예약 확정
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                            <Clock size={14} />
                            승인 대기
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 align-top text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenChat(bk);
                        }}
                        className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition flex items-center justify-center gap-1 mx-auto text-xs font-bold shadow-xs"
                      >
                        <MessageSquare size={14} />
                        포워더 문의
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Booking 전용 업무 대화방 서랍장 */}
      {selectedBooking && user && (
        <BookingChatDrawer
          bookingId={selectedBooking.id}
          isOpen={isChatOpen}
          onClose={() => {
            setIsChatOpen(false);
            setSelectedBooking(null);
          }}
          vesselName={selectedBooking.vessel_name}
          pol={selectedBooking.pol}
          pod={selectedBooking.pod}
          currentUser={{
            username: user.username,
            role: user.role
          }}
        />
      )}
    </div>
  );
}
