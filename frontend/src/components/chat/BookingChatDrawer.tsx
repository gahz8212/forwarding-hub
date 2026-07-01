import React, { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { X, Send, Lock, Globe, MessageSquare, ShieldAlert } from "lucide-react";

interface BookingChatDrawerProps {
  bookingId: number;
  isOpen: boolean;
  onClose: () => void;
  shipperName?: string;
  vesselName?: string;
  pol?: string;
  pod?: string;
  currentUser: { username: string; role: string };
}

export default function BookingChatDrawer({
  bookingId,
  isOpen,
  onClose,
  shipperName,
  vesselName,
  pol,
  pod,
  currentUser
}: BookingChatDrawerProps) {
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<any>(null);

  // 대화 목록 가져오기
  const fetchMessages = () => {
    setLoading(true);
    axios
      .get(`http://localhost:5000/api/schedules/bookings/${bookingId}/messages`, {
        withCredentials: true
      })
      .then((res) => {
        if (res.data.success) {
          setMessages(res.data.data);
        }
      })
      .catch((err) => console.error("메시지 조회 실패:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!isOpen) return;

    fetchMessages();

    // 소켓 실시간 연동
    const socket = io("http://localhost:5000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(`채팅방 입장 - Booking ID: ${bookingId}`);
      socket.emit("join_booking_chat", { bookingId });
    });

    socket.on("new_booking_message", (msg: any) => {
      if (msg.booking_id === bookingId) {
        setMessages((prev) => {
          // 중복 메시지 방지
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
    });

    return () => {
      if (socket) {
        socket.emit("leave_booking_chat", { bookingId });
        socket.disconnect();
      }
    };
  }, [bookingId, isOpen]);

  // 자동 스크롤 하단 이동
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const payload = {
      message: inputText.trim(),
      isPrivate: currentUser.role === "admin" ? isPrivate : false
    };

    try {
      const res = await axios.post(
        `http://localhost:5000/api/schedules/bookings/${bookingId}/messages`,
        payload,
        { withCredentials: true }
      );
      if (res.data.success) {
        setInputText("");
        // 내 메시지는 소켓을 통해 브로드캐스트되지만, 혹시 모를 대기를 위해 로컬 추가
        setMessages((prev) => {
          if (prev.some((m) => m.id === res.data.data.id)) return prev;
          return [...prev, res.data.data];
        });
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "메시지 발송 실패");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Background Overlay */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity" 
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col z-10 animate-slide-in-right">
        {/* Drawer Header */}
        <div className="p-6 border-b bg-slate-900 text-white flex justify-between items-center">
          <div className="space-y-1">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <MessageSquare size={20} className="text-blue-400" />
              업무 대화방 (BK-{bookingId.toString().padStart(5, "0")})
            </h3>
            <p className="text-xs text-slate-300">
              {vesselName} / {pol?.split(",")[0]} ➔ {pod?.split(",")[0]}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/10 rounded-lg text-slate-300 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Info Banner for internal memos */}
        {currentUser.role === "admin" && (
          <div className="bg-amber-50 border-b border-amber-100 p-3 px-6 flex items-center gap-2 text-xs text-amber-800 font-medium">
            <ShieldAlert size={14} className="shrink-0" />
            <span>비밀 메모는 오직 <strong>포워더(어드민) 동료들</strong>에게만 보입니다.</span>
          </div>
        )}

        {/* Message Log */}
        <div className="flex-1 p-6 overflow-y-auto bg-slate-50 space-y-4">
          {loading && messages.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-10">메시지 로딩 중...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-xs text-slate-400 py-10">
              업무 조율을 위한 첫 메시지를 남겨보세요!
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_name === currentUser.username;
              const isAdmin = msg.sender_role === "admin";
              const isPrivateMemo = msg.is_private === 1 || msg.is_private === true;

              return (
                <div 
                  key={msg.id} 
                  className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                >
                  {/* Sender Info */}
                  <span className="text-[10px] text-slate-400 font-bold mb-1.5 flex items-center gap-1">
                    {msg.sender_name}
                    <span className={`px-1 rounded-[3px] text-[8px] font-extrabold ${
                      isAdmin ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"
                    }`}>
                      {isAdmin ? "포워더" : "화주"}
                    </span>
                    {isPrivateMemo && (
                      <span className="bg-amber-100 text-amber-800 px-1 rounded-[3px] text-[8px] font-extrabold flex items-center gap-0.5">
                        <Lock size={8} /> 사내 메모
                      </span>
                    )}
                  </span>

                  {/* Message Bubble */}
                  <div 
                    className={`max-w-[85%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                      isPrivateMemo
                        ? "bg-amber-100 border border-amber-200 text-slate-800 rounded-tl-none font-medium"
                        : isMe
                          ? "bg-blue-600 text-white rounded-tr-none"
                          : "bg-white border border-slate-200 text-slate-800 rounded-tl-none"
                    }`}
                  >
                    {msg.message}
                  </div>

                  {/* Timestamp */}
                  <span className="text-[9px] text-slate-400 mt-1 font-mono">
                    {new Date(msg.created_at).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit"
                    })}
                  </span>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat Input Panel */}
        <form onSubmit={handleSend} className="p-4 border-t bg-white">
          {/* Toggle button for Admin Internal Memo */}
          {currentUser.role === "admin" && (
            <div className="flex items-center justify-between mb-3 bg-slate-50 border p-2 rounded-xl">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                {isPrivate ? (
                  <Lock size={14} className="text-amber-500" />
                ) : (
                  <Globe size={14} className="text-blue-500" />
                )}
                <span>작성 모드:</span>
                <span className={isPrivate ? "text-amber-600" : "text-blue-600"}>
                  {isPrivate ? "🔒 사내 비밀 메모" : "🌎 화주 공개 대화"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPrivate(!isPrivate)}
                className={`text-[10px] font-black px-2.5 py-1 rounded-lg transition border ${
                  isPrivate
                    ? "bg-amber-500 text-white border-amber-600 hover:bg-amber-600"
                    : "bg-white text-blue-600 border-blue-200 hover:bg-blue-50"
                }`}
              >
                {isPrivate ? "공개 대화로 변경" : "비밀 메모로 변경"}
              </button>
            </div>
          )}

          {/* Text Input Row */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={
                isPrivate 
                  ? "포워더끼리 공유할 비밀 업무 메모를 작성하세요..." 
                  : "화주와 조율할 메시지를 입력해 주세요..."
              }
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className={`flex-1 px-4 py-2.5 border rounded-xl focus:outline-none focus:ring-2 text-xs shadow-xs text-slate-800 transition ${
                isPrivate 
                  ? "border-amber-400 focus:ring-amber-500 focus:border-transparent bg-amber-50/20" 
                  : "border-slate-300 focus:ring-blue-500 focus:border-transparent"
              }`}
            />
            <button
              type="submit"
              disabled={!inputText.trim()}
              className={`p-2.5 rounded-xl transition text-white shrink-0 disabled:opacity-40 ${
                isPrivate ? "bg-amber-500 hover:bg-amber-600" : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
