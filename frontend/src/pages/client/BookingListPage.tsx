import api, { API_BASE_URL } from '../../api/axios';
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
    api.get("/api/schedules/bookings", { withCredentials: true })
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
    const socket = io(API_BASE_URL);

    socket.on("connect", () => {
      console.log("BookingListPage socket connected");
    });

    socket.on("booking_rejected", (data) => {
      console.log("실시간 부킹 반려 감지 ➔ 목록에서 즉시 제거:", data);
      setBookings((prev) => prev.filter((b) => b.id !== data.bookingId));
    });

    socket.on("booking_approved", (data) => {
      console.log("실시간 부킹 승인 감지 ➔ 상태 업데이트 및 B/L 부여:", data);
      setBookings((prev) =>
        prev.map((b) => {
          if (b.id === data.bookingId) {
            return { ...b, status: data.status, bl_number: data.blNumber };
          }
          return b;
        })
      );
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
        <div>
          {loading ? (
            <div className="p-8 text-center text-slate-500">불러오는 중...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : bookings.length === 0 ? (
            <div className="p-8 text-center text-slate-500">요청한 부킹 내역이 없습니다. 스케줄 메뉴에서 예약을 신청해 주세요.</div>
          ) : (
            <>
              {/* 모바일 카드 뷰 */}
              <div className="block md:hidden space-y-4 p-4 bg-slate-50/30">
                {bookings.map((bk) => {
                  const formatDateTime = (dtVal: any) => {
                    if (!dtVal) return "-";
                    const cleanVal =
                      typeof dtVal === "string"
                        ? dtVal.replace(/(\d+)(st|nd|rd|th)/gi, "$1")
                        : dtVal;
                    const d = new Date(cleanVal);
                    if (isNaN(d.getTime())) return "-";
                    const month = d.getMonth() + 1;
                    const date = d.getDate().toString().padStart(2, "0");
                    const hours = d.getHours().toString().padStart(2, "0");
                    const minutes = d.getMinutes().toString().padStart(2, "0");
                    return `${month}/${date} ${hours}:${minutes}`;
                  };

                  const parsedMeta = (() => {
                    if (!bk.metadata) return null;
                    try {
                      return typeof bk.metadata === "string"
                        ? JSON.parse(bk.metadata)
                        : bk.metadata;
                    } catch (e) {
                      return null;
                    }
                  })();

                  return (
                    <div 
                      key={bk.id} 
                      className={`p-4 bg-white rounded-xl border border-slate-100 shadow-sm space-y-3 transition ${bk.status === "Confirmed" && bk.bl_number ? "cursor-pointer hover:border-blue-200" : ""}`}
                      onClick={() => {
                        if (bk.status === "Confirmed" && bk.bl_number) {
                          navigate(`/?bl=${bk.bl_number}`);
                        }
                      }}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="font-bold text-slate-800 text-sm truncate w-full">
                          BK-{bk.id.toString().padStart(5, "0")}
                          <span className="ml-2 font-normal text-slate-500 text-xs truncate">({bk.vessel_name || "-"})</span>
                        </div>
                        <div className="shrink-0">
                          {bk.status === "Confirmed" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
                              <CheckCircle2 size={12} />
                              예약 확정
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                              <Clock size={12} />
                              승인 대기
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <div className="bg-slate-100 px-2 py-1 rounded">
                          {(bk.pol || "").split(",")[0] || "-"} ➔ {(bk.pod || "").split(",")[0] || "-"}
                        </div>
                        <div className="bg-slate-100 px-2 py-1 rounded">
                          요청일: {bk.created_at ? new Date(bk.created_at).toLocaleDateString("ko-KR") : "-"}
                        </div>
                        <div className="bg-slate-100 px-2 py-1 rounded">
                          ETD: {bk.etd && typeof bk.etd === "string" ? bk.etd.split("T")[0] : "-"}
                        </div>
                      </div>

                      {/* 마감 일정 (2열 그리드 레이아웃) */}
                      <div className="pt-2 border-t border-slate-100 mt-2 text-[11px] grid grid-cols-2 gap-x-4 gap-y-2">
                        {/* SI 마감 | VGM 마감 */}
                        <div className="flex justify-between items-center border-r border-slate-100 pr-2">
                          <span className="text-slate-400">SI 마감</span>
                          <span className="font-semibold text-red-500 tabular-nums">
                            {formatDateTime(parsedMeta?.siCutOff || bk.doc_closing_date)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pl-2">
                          <span className="text-slate-400">VGM 마감</span>
                          <span className="font-semibold text-purple-500 tabular-nums">
                            {parsedMeta?.vgmCutOff ? formatDateTime(parsedMeta.vgmCutOff) : "-"}
                          </span>
                        </div>

                        {/* CY 입고 | 위험물 서류 */}
                        <div className="flex justify-between items-center border-r border-slate-100 pr-2 border-t border-slate-100/50 pt-1.5">
                          <span className="text-slate-400">CY 입고</span>
                          <span className="font-semibold text-amber-600 tabular-nums">
                            {formatDateTime(parsedMeta?.cyCutOff || bk.cargo_closing_date)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pl-2 border-t border-slate-100/50 pt-1.5">
                          <span className="text-slate-400">위험물 서류</span>
                          <span className="font-semibold text-rose-500 tabular-nums">
                            {parsedMeta?.dangerousCutOff ? formatDateTime(parsedMeta.dangerousCutOff) : "-"}
                          </span>
                        </div>

                        {/* 리퍼 마감 (있을 때만 노출) */}
                        {parsedMeta?.reeferCutOff ? (
                          <>
                            <div className="flex justify-between items-center border-r border-slate-100 pr-2 border-t border-slate-100/50 pt-1.5">
                              <span className="text-slate-400">리퍼 마감</span>
                              <span className="font-semibold text-blue-500 tabular-nums">
                                {formatDateTime(parsedMeta.reeferCutOff)}
                              </span>
                            </div>
                            <div className="border-t border-slate-100/50 pt-1.5 pl-2" />
                          </>
                        ) : null}
                      </div>

                    </div>
                  );
                })}
              </div>

              {/* 데스크탑 테이블 뷰 */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
                    <tr>
                      <th className="p-4 font-bold">예약 번호</th>
                      <th className="p-4 font-bold">요청 일자</th>
                      <th className="p-4 font-bold">선박명</th>
                      <th className="p-4 font-bold">구간 (POL ➔ POD)</th>
                      <th className="p-4 font-bold text-center">선적 조건</th>
                      <th className="p-4 font-bold text-center">진행 상태</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
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
