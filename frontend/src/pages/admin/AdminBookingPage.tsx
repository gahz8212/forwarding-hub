import React, { useEffect, useState } from "react";
import axios from "axios";
import { Check, X, Clock, AlertCircle, Share2, MessageSquare } from "lucide-react";
import { useAuthStore } from "../../store/useAuthStore";
import BookingChatDrawer from "../../components/chat/BookingChatDrawer";
import { io } from "socket.io-client";
import { useSearchParams } from "react-router-dom";

export default function AdminBookingPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  // 채팅 서랍장 상태
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  // 쿼리 매개변수 확인용 (채팅 알림 등에서 바로 열기용)
  const [searchParams, setSearchParams] = useSearchParams();
  const openChatId = searchParams.get("openChat");

  // 현재 사용자 정보
  const { user } = useAuthStore();

  const fetchBookings = () => {
    setLoading(true);
    axios
      .get("http://localhost:5000/api/schedules/admin/bookings", { withCredentials: true })
      .then((res) => {
        if (res.data.success) {
          setBookings(res.data.data);
        }
      })
      .catch((err) => {
        console.error("전체 부킹 내역 조회 실패:", err);
        setError("부킹 내역을 불러오는 중 오류가 발생했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchBookings();

    // 실시간 소켓 연결 (신규 부킹 발생 시 목록 자동 갱신용)
    const socket = io("http://localhost:5000");
    socket.on("connect", () => {
      console.log("AdminBookingPage socket connected");
      socket.emit("join", { role: "admin" });
    });

    socket.on("new_booking_alert", () => {
      console.log("실시간 신규 부킹 요청 감지 ➔ 목록 갱신");
      fetchBookings();
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

  const handleApprove = async (bk: any) => {
    setProcessingId(bk.id);
    try {
      const res = await axios.post(
        "http://localhost:5000/api/schedules/approve",
        { bookingDetails: bk },
        { withCredentials: true }
      );
      if (res.data.success) {
        alert(res.data.message);
        // 상태를 Confirmed로 로컬 업데이트
        setBookings((prev) =>
          prev.map((b) => (b.id === bk.id ? { ...b, status: "Confirmed" } : b))
        );
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "승인 처리 중 오류가 발생했습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: number) => {
    const bk = bookings.find((b) => b.id === id);
    if (!bk) return;

    // 반려 의사 재확인 창
    if (!confirm(`정말로 BK-${id.toString().padStart(5, "0")} 부킹 요청을 반려하시겠습니까?\n반려 시 해당 요청 내역은 데이터베이스에서 즉시 완전히 삭제됩니다.`)) {
      return;
    }

    const reason = prompt("부킹 반려 사유를 입력해 주세요 (카카오톡 알림으로 전송됩니다):");
    if (reason === null) return; // 취소 클릭 시 중단
    if (!reason.trim()) {
      alert("반려 사유는 필수 입력 항목입니다.");
      return;
    }

    setProcessingId(id);
    try {
      const res = await axios.post(
        "http://localhost:5000/api/schedules/reject",
        {
          bookingId: id,
          reason: reason.trim(),
          bookingDetails: bk
        },
        { withCredentials: true }
      );

      if (res.data.success) {
        alert(res.data.message);
        // 반려 완료된 항목을 목록에서 실시간 제외
        setBookings((prev) => prev.filter((b) => b.id !== id));
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "반려 처리 중 오류가 발생했습니다.");
    } finally {
      setProcessingId(null);
    }
  };

  // 네이트온 전송용 텍스트 복사 핸들러
  const handleNateOnShare = (bk: any) => {
    const polShort = bk.pol.split(",")[0];
    const podShort = bk.pod.split(",")[0];
    const etdShort = bk.etd ? bk.etd.split("T")[0] : "";
    const etaShort = bk.eta ? bk.eta.split("T")[0] : "";

    const template = `[Forwarding Hub] 신규 부킹 요청 공유
- 예약번호: BK-${bk.id.toString().padStart(5, "0")}
- 화주명: ${bk.shipper || "일반 화주"}
- 선박/구간: ${bk.vessel_name} (${polShort} ➔ ${podShort})
- 일정: ${etdShort} ~ ${etaShort}
- 확인 링크: http://localhost:5173/admin/bookings`;

    navigator.clipboard.writeText(template)
      .then(() => {
        alert("네이트온 공유용 메세지 템플릿이 복사되었습니다!\n네이트온 대화방에 Ctrl+V로 붙여넣어 팀원들과 빠르게 업무 상황을 공유해 보세요.");
      })
      .catch((err) => {
        console.error("클립보드 복사 실패:", err);
      });
  };

  const handleOpenChat = (bk: any) => {
    setSelectedBooking(bk);
    setIsChatOpen(true);
  };

  const pendingBookings = bookings.filter((b) => b.status === "Pending");
  const confirmedBookings = bookings.filter((b) => b.status === "Confirmed");

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center">
        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">부킹 승인 및 업무 현황판</h3>
          <p className="text-slate-500 text-sm">
            화주가 신청한 선박 예약 요청 리스트입니다. 승인 버튼 클릭 시 선사 스케줄이 확정(Confirmed) 상태로 DB에 저장되며 화주에게 카카오 알림톡이 자동 발송됩니다.
          </p>
        </div>
      </div>

      {/* 미처리 부킹 요청 내역 */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">미처리 부킹 요청 내역 ({pendingBookings.length}건)</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500">불러오는 중...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : pendingBookings.length === 0 ? (
            <div className="p-8 text-center text-slate-500">대기 중인 새로운 부킹 요청 건이 없습니다.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="p-4 font-bold">예약 번호</th>
                  <th className="p-4 font-bold">요청 화주</th>
                  <th className="p-4 font-bold">선박명</th>
                  <th className="p-4 font-bold">구간 (POL ➔ POD)</th>
                  <th className="p-4 font-bold text-center">선박 일정 (ETD ➔ ETA)</th>
                  <th className="p-4 font-bold text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pendingBookings.map((bk) => (
                  <tr key={bk.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 font-bold text-slate-800">
                      BK-{bk.id.toString().padStart(5, "0")}
                    </td>
                    <td className="p-4 text-slate-700 text-sm font-semibold">{bk.shipper}</td>
                    <td className="p-4 text-slate-800 font-semibold">{bk.vessel_name}</td>
                    <td className="p-4 text-slate-600 text-sm">
                      {bk.pol.split(",")[0]} ➔ {bk.pod.split(",")[0]}
                    </td>
                    <td className="p-4 text-slate-600 text-sm text-center">
                      {bk.etd ? bk.etd.split("T")[0] : ""} ➔ {bk.eta ? bk.eta.split("T")[0] : ""}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleNateOnShare(bk)}
                          title="네이트온 공유 텍스트 복사"
                          className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenChat(bk)}
                          title="부킹별 개별 대화 및 메모 열기"
                          className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition flex items-center gap-1 text-xs font-bold"
                        >
                          <MessageSquare size={14} />
                          대화/메모
                        </button>
                        <button
                          onClick={() => handleApprove(bk)}
                          disabled={processingId === bk.id}
                          className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm disabled:opacity-50"
                        >
                          <Check size={14} />
                          {processingId === bk.id ? "승인 중" : "승인"}
                        </button>
                        <button
                          onClick={() => handleReject(bk.id)}
                          disabled={processingId === bk.id}
                          className="bg-red-50 hover:bg-red-100 text-red-600 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition border border-red-200 disabled:opacity-50"
                        >
                          <X size={14} />
                          반려
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 처리 완료된 부킹 요청 내역 */}
      {confirmedBookings.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="p-6 border-b bg-slate-50">
            <h3 className="text-lg font-bold text-slate-800">승인 완료된 부킹 내역 ({confirmedBookings.length}건)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="p-4 font-bold">예약 번호</th>
                  <th className="p-4 font-bold">요청 화주</th>
                  <th className="p-4 font-bold">선박명</th>
                  <th className="p-4 font-bold">구간 (POL ➔ POD)</th>
                  <th className="p-4 font-bold">발행 B/L</th>
                  <th className="p-4 font-bold text-center">선적 일정 (ETD ➔ ETA)</th>
                  <th className="p-4 font-bold text-center">작업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {confirmedBookings.map((bk) => (
                  <tr key={bk.id} className="hover:bg-slate-50 transition text-sm">
                    <td className="p-4 font-bold text-slate-800">
                      BK-{bk.id.toString().padStart(5, "0")}
                    </td>
                    <td className="p-4 text-slate-700 font-semibold">{bk.shipper}</td>
                    <td className="p-4 text-slate-800 font-semibold">{bk.vessel_name}</td>
                    <td className="p-4 text-slate-600">
                      {bk.pol.split(",")[0]} ➔ {bk.pod.split(",")[0]}
                    </td>
                    <td className="p-4 text-blue-600 font-bold">
                      {bk.bl_number || "-"}
                    </td>
                    <td className="p-4 text-slate-600 text-center">
                      {bk.etd ? bk.etd.split("T")[0] : ""} ➔ {bk.eta ? bk.eta.split("T")[0] : ""}
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => handleNateOnShare(bk)}
                          title="네이트온 공유 텍스트 복사"
                          className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition"
                        >
                          <Share2 size={14} />
                        </button>
                        <button
                          onClick={() => handleOpenChat(bk)}
                          title="대화 및 메모"
                          className="p-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition flex items-center gap-1 text-xs font-bold"
                        >
                          <MessageSquare size={14} />
                          대화/메모
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Booking 전용 업무 대화방 서랍장 */}
      {selectedBooking && user && (
        <BookingChatDrawer
          bookingId={selectedBooking.id}
          isOpen={isChatOpen}
          onClose={() => {
            setIsChatOpen(false);
            setSelectedBooking(null);
          }}
          shipperName={selectedBooking.shipper}
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
