import React, { useEffect, useState } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";
import { useTrackingStore } from "../../store/useTrackingStore";
import { useNotificationStore } from "../../store/useNotificationStore";
import axios from "axios";
import { io } from "socket.io-client";
import {
  LayoutDashboard, Search, Calendar, FileText,
  CreditCard, FolderOpen, LogOut, Bell, Anchor, Ship, BellRing, X
} from "lucide-react";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { clearData } = useTrackingStore();
  const currentPath = location.pathname;

  const { alerts, addAlert, removeAlert } = useNotificationStore();

  useEffect(() => {
    if (!user) return;

    const socket = io("http://localhost:5000");

    socket.on("connect", () => {
      console.log(`Socket connected in layout for user: ${user.username} (${user.role})`);
      if (user.role === "admin") {
        socket.emit("join", { role: "admin" });
      } else if (user.role === "client") {
        socket.emit("join", { role: "client", clientId: user.id });
      }
    });

    // 신규 부킹 요청 및 서류 업로드 알람 리스너 (어드민 전용)
    if (user.role === "admin") {
      socket.on("new_booking_alert", (data) => {
        const requestTime = new Date().toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false
        });
        addAlert({
          type: "booking",
          title: "🚨 새로운 부킹요청",
          meta: { ...data, requestTime }
        });
      });

      socket.on("shipment_status_changed", (data) => {
        if (data.status === "Documents Uploaded") {
          const requestTime = new Date().toLocaleString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          });
          addAlert({
            type: "document",
            title: "📄 서류 업로드 완료",
            meta: { ...data, requestTime }
          });
        }
      });
    }

    // 신규 채팅 메시지 실시간 알람 리스너 (어드민/화주 공용)
    socket.on("booking_message_notification", (data) => {
      console.log("실시간 채팅 메시지 알림 감지:", data);
      const isAdmin = user.role === "admin";
      const isClient = user.role === "client";

      let shouldAlert = false;
      // 1) 어드민인 경우: 화주(client)가 보낸 대화글 감지
      if (isAdmin && data.senderRole === "client") {
        shouldAlert = true;
      }
      // 2) 화주인 경우: 본인의 부킹 건이고 어드민이 보낸 비공개가 아닌 대화글 감지
      else if (
        isClient &&
        user.id === data.shipperId &&
        data.senderRole === "admin" &&
        data.isPrivate === 0
      ) {
        shouldAlert = true;
      }

      if (shouldAlert) {
        const timeStr = new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
        addAlert({
          type: "chat",
          title: "💬 새로운 업무 메시지",
          message: data.message,
          meta: { ...data, requestTime: timeStr }
        });
      }
    });

    // PDF 발행 실시간 알림 리스너 (화주 전용)
    if (user.role === "client") {
      socket.on("pdf_generated_alert", (data) => {
        console.log("실시간 PDF 발행 알림 감지:", data);
        const timeStr = new Date().toLocaleTimeString("ko-KR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });
        addAlert({
          type: "pdf",
          title: "📄 서류 발행 완료",
          message: data.message,
          meta: { ...data, requestTime: timeStr }
        });
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [user, addAlert]);



  const clientMenus = [
    { name: "내 화물 대시보드", path: "/", icon: <LayoutDashboard size={20} /> },
    { name: "선박 스케줄/부킹", path: "/schedules", icon: <Calendar size={20} /> },
    { name: "예약 현황", path: "/bookings", icon: <FileText size={20} /> },
    { name: "정산 & 인보이스", path: "/invoices", icon: <CreditCard size={20} /> },
    { name: "서류 보관함", path: "/documents", icon: <FolderOpen size={20} /> },
  ];

  const adminMenus = [
    { name: "부킹 요청 승인", path: "/admin/bookings", icon: <FileText size={20} /> },
    { name: "전체 화물/선적 관리", path: "/admin/shipments", icon: <Ship size={20} /> },
    { name: "선박 스케줄 관리", path: "/admin/schedules", icon: <Calendar size={20} /> },
  ];

  const handleLogout = async () => {
    try {
      await axios.post(
        "http://localhost:5000/api/auth/logout",
        {},
        { withCredentials: true }
      );
      setUser(null);
      clearData();
      navigate("/login");
    } catch (err) {
      console.error("로그아웃 실패:", err);
    }
  };

  // 현재 경로명 매칭
  const getPageTitle = () => {
    const allMenus = [...clientMenus, ...adminMenus];
    const matched = allMenus.find((m) => m.path === currentPath);
    if (matched) return matched.name;
    if (currentPath.startsWith("/tracking")) return "화물 트래킹 상세";
    return "Forwarding Hub";
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* 1. Sidebar (Desktop) */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between z-20 shrink-0">
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center gap-2 px-6 border-b border-slate-800 bg-slate-950">
            <Anchor size={24} className="text-blue-400" />
            <span className="text-lg font-black tracking-tight text-white">Forwarding Hub</span>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1">
            {/* 화주 전용 메뉴 (client) */}
            {user?.role === "client" && (
              <>
                <p className="text-xs font-semibold text-slate-500 px-3 uppercase tracking-wider mb-2">
                  화주 메뉴
                </p>
                {clientMenus.map((menu) => (
                  <Link
                    key={menu.path}
                    to={menu.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${currentPath === menu.path
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                  >
                    {menu.icon}
                    {menu.name}
                  </Link>
                ))}
              </>
            )}

            {/* 포워더 전용 메뉴 (admin) */}
            {user?.role === "admin" && (
              <>
                <p className="text-xs font-semibold text-slate-500 px-3 uppercase tracking-wider mb-2">
                  포워더 메뉴
                </p>
                {adminMenus.map((menu) => (
                  <Link
                    key={menu.path}
                    to={menu.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${currentPath === menu.path
                        ? "bg-blue-600 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`}
                  >
                    {menu.icon}
                    {menu.name}
                  </Link>
                ))}
              </>
            )}
          </nav>
        </div>

        {/* User profile & Logout */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="px-3 py-2 bg-slate-950/40 rounded-lg flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
              {user?.username?.[0]?.toUpperCase()}
            </div>
            <div className="truncate">
              <p className="text-xs text-slate-400">환영합니다</p>
              <p className="text-sm font-bold text-white truncate">{user?.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-semibold text-rose-400 hover:bg-slate-800 transition"
          >
            <LogOut size={18} />
            로그아웃
          </button>
        </div>
      </aside>

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b flex items-center justify-between px-8 z-10 shrink-0 shadow-sm">
          <h2 className="text-lg font-black text-slate-800">{getPageTitle()}</h2>
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <button className="text-slate-500 hover:text-slate-800 relative p-1.5 rounded-full hover:bg-slate-100 transition">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
          </div>
        </header>

        {/* Dynamic Route View */}
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>

      {/* Unified Real-time Toast Notifications Container */}
      {alerts.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-4 max-h-[85vh] overflow-y-auto w-80 p-2 scrollbar-thin">
          {alerts.map((alert) => {
            const isChat = alert.type === 'chat';
            return (
              <div
                key={alert.id}
                className={`p-6 rounded-2xl shadow-2xl animate-alarm-shake transition-all duration-300 border-2 ${
                  isChat 
                    ? "bg-slate-900 border-blue-500 text-white" 
                    : alert.type === 'booking'
                    ? "bg-white border-red-500 text-slate-800"
                    : alert.type === 'document'
                    ? "bg-white border-green-500 text-slate-800"
                    : "bg-white border-blue-500 text-slate-800"
                }`}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-2">
                  <h4 className={`text-base font-black ${
                    isChat 
                      ? "text-blue-400" 
                      : alert.type === 'booking'
                      ? "text-red-600"
                      : alert.type === 'document'
                      ? "text-green-600"
                      : "text-blue-600"
                  }`}>
                    {alert.title}
                  </h4>
                  <button 
                    onClick={() => removeAlert(alert.id)} 
                    className="text-slate-400 hover:text-slate-600 transition"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Content Body based on type */}
                {alert.type === 'booking' && (
                  <>
                    <p className="text-slate-800 text-sm font-bold mt-2">화주: {alert.meta?.username} 님</p>
                    <p className="text-slate-500 text-xs mt-1">요청일시: {alert.meta?.requestTime || alert.time}</p>
                    <div className="mt-4">
                      <button
                        onClick={() => {
                          removeAlert(alert.id);
                          navigate("/admin/bookings");
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg font-bold text-xs shadow-sm transition"
                      >
                        부킹 요청 확인하러 가기
                      </button>
                    </div>
                  </>
                )}

                {alert.type === 'document' && (
                  <>
                    <p className="text-slate-800 text-sm font-bold mt-2">B/L 번호: {alert.meta?.blNumber}</p>
                    <p className="text-slate-500 text-xs mt-1">업로드 시각: {alert.meta?.requestTime || alert.time}</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => {
                          removeAlert(alert.id);
                          navigate("/admin/shipments");
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold text-xs shadow-sm transition"
                      >
                        확인하러 가기
                      </button>
                      <button
                        onClick={() => removeAlert(alert.id)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs transition"
                      >
                        닫기
                      </button>
                    </div>
                  </>
                )}

                {alert.type === 'chat' && (
                  <>
                    <p className="text-slate-350 text-sm mt-2 font-bold">보낸 사람: {alert.meta?.senderName}</p>
                    <p className="text-slate-300 text-xs mt-1 bg-white/10 p-2.5 rounded-lg italic break-all">
                      "{alert.message && alert.message.length > 40 ? alert.message.slice(0, 40) + "..." : alert.message}"
                    </p>
                    <p className="text-slate-500 text-[10px] mt-2">수신일시: {alert.meta?.requestTime || alert.time}</p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => {
                          removeAlert(alert.id);
                          const targetPath = user?.role === "admin" ? "/admin/bookings" : "/bookings";
                          navigate(`${targetPath}?openChat=${alert.meta?.bookingId}`);
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-xs shadow-sm transition"
                      >
                        확인하러 가기
                      </button>
                      <button
                        onClick={() => removeAlert(alert.id)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg font-bold text-xs transition"
                      >
                        닫기
                      </button>
                    </div>
                  </>
                )}

                {alert.type === 'pdf' && (
                  <>
                    <p className="text-slate-800 text-sm font-bold mt-2">B/L 번호: {alert.meta?.blNumber}</p>
                    <p className="text-slate-500 text-xs mt-1">발행 시간: {alert.meta?.requestTime || alert.time}</p>
                    <p className="text-slate-600 text-xs mt-2 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100 italic">
                      {alert.message}
                    </p>
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => {
                          removeAlert(alert.id);
                          navigate("/client/documents");
                        }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-xs shadow-sm transition"
                      >
                        확인하러 가기
                      </button>
                      <button
                        onClick={() => removeAlert(alert.id)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs transition"
                      >
                        닫기
                      </button>
                    </div>
                  </>
                )}

                {alert.type === 'general' && (
                  <>
                    <p className="text-slate-700 text-xs mt-2 leading-relaxed">
                      {alert.message}
                    </p>
                    <div className="mt-4">
                      <button
                        onClick={() => removeAlert(alert.id)}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-xs shadow-sm transition"
                      >
                        확인
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
