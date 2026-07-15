import api, { API_BASE_URL } from '../../api/axios';
import React, { useEffect, useState, useRef } from "react";
import { Link, useLocation, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/useAuthStore";
import { useTrackingStore } from "../../store/useTrackingStore";
import { useNotificationStore } from "../../store/useNotificationStore";
import { io } from "socket.io-client";
import {
  LayoutDashboard, Calendar, FileText,
  CreditCard, FolderOpen, LogOut, Bell, Anchor, Ship, BellRing, X, Truck,
  User, ChevronDown, Menu, MessageSquare
} from "lucide-react";
import BookingChatDrawer from "../chat/BookingChatDrawer";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, setUser } = useAuthStore();
  const { clearData } = useTrackingStore();
  const currentPath = location.pathname;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const { alerts, addAlert, removeAlert, missedAlerts, setMissedAlerts, showWindowsAlertDrawer, setShowWindowsAlertDrawer, setActiveDashboardShipment } = useNotificationStore();

  const [isHeaderChatOpen, setIsHeaderChatOpen] = useState(false);
  const [latestBooking, setLatestBooking] = useState<any>(null);

  const handleHeaderChatClick = async () => {
    if (!user) return;
    try {
      const path = user.role === "admin" 
        ? "/api/schedules/admin/bookings"
        : "/api/schedules/bookings";
      const res = await api.get(path);
      if (res.data.success && res.data.data && res.data.data.length > 0) {
        setLatestBooking(res.data.data[0]); // get the latest booking
        setIsHeaderChatOpen(true);
      } else {
        alert("대화 가능한 예약 내역이 없습니다. 먼저 부킹 요청을 생성해 주세요.");
      }
    } catch (err) {
      console.error("최근 대화방 조회 실패:", err);
      alert("대화방을 열 수 없습니다.");
    }
  };

  // 외부 클릭 시 프로필 드롭다운 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = io(API_BASE_URL);

    socket.on("connect", () => {
      console.log(`Socket connected in layout for user: ${user.username} (${user.role})`);
      if (user.role === "admin") {
        socket.emit("join", { role: "admin" });
      } else if (user.role === "client") {
        socket.emit("join", { role: "client", clientId: user.id });
      }
    });

    if (user.role === "admin") {
      socket.on("new_booking_alert", (data) => {
        const requestTime = new Date().toLocaleString("ko-KR", {
          year: "numeric", month: "2-digit", day: "2-digit",
          hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
        });
        addAlert({ type: "booking", title: "🚨 새로운 부킹요청", meta: { ...data, requestTime } });
      });

      socket.on("shipment_status_changed", (data) => {
        if (data.status === "Documents Uploaded") {
          const requestTime = new Date().toLocaleString("ko-KR", {
            year: "numeric", month: "2-digit", day: "2-digit",
            hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
          });
          addAlert({ type: "document", title: "📄 서류 업로드 완료", meta: { ...data, requestTime } });
        }
      });
    }

    socket.on("booking_message_notification", (data) => {
      const isAdmin = user.role === "admin";
      const isClient = user.role === "client";
      let shouldAlert = false;
      if (isAdmin && data.senderRole === "client") shouldAlert = true;
      else if (isClient && user.id === data.shipperId && data.senderRole === "admin" && data.isPrivate === 0) shouldAlert = true;

      if (shouldAlert) {
        const timeStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        addAlert({ type: "chat", title: "💬 새로운 업무 메시지", message: data.message, meta: { ...data, requestTime: timeStr } });
      }
    });

    if (user.role === "client") {
      socket.on("pdf_generated_alert", (data) => {
        const timeStr = new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        addAlert({ type: "pdf", title: "📄 서류 발행 완료", message: data.message, meta: { ...data, requestTime: timeStr } });
      });
    }

    return () => { socket.disconnect(); };
  }, [user, addAlert]);

  // 알림 토스트 자동 소멸 및 미확인 보관함(missedAlerts) 이동 처리
  useEffect(() => {
    if (alerts.length === 0) return;

    // 최신 알림들 중 타이머가 등록되지 않은 건들에 대해 타이머 등록
    const timers: any[] = [];
    
    alerts.forEach((alert) => {
      const timer = setTimeout(() => {
        // 토스트창에서 지우기
        removeAlert(alert.id);
        
        // 미확인 알림창(missedAlerts)에 추가
        setMissedAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev;
          return [
            ...prev,
            {
              id: alert.id,
              type: alert.type,
              title: alert.title,
              message: alert.message,
              time: alert.time,
              timestamp: alert.time,
              meta: alert.meta
            }
          ];
        });
      }, 15000); // 15초 후 자동 이동

      timers.push(timer);
    });

    return () => {
      timers.forEach((t) => clearTimeout(t));
    };
  }, [alerts, removeAlert, setMissedAlerts]);

  const clientMenus = [
    { name: "대시보드", path: "/", icon: <LayoutDashboard size={20} />, mobileIcon: <LayoutDashboard size={22} /> },
    { name: "스케줄/부킹", path: "/schedules", icon: <Calendar size={20} />, mobileIcon: <Calendar size={22} /> },
    { name: "예약 현황", path: "/bookings", icon: <FileText size={20} />, mobileIcon: <FileText size={22} /> },
    { name: "정산/인보이스", path: "/invoices", icon: <CreditCard size={20} />, mobileIcon: <CreditCard size={22} /> },
    { name: "서류 보관함", path: "/documents", icon: <FolderOpen size={20} />, mobileIcon: <FolderOpen size={22} /> },
  ];

  const adminMenus = [
    { name: "부킹 승인", path: "/admin/bookings", icon: <FileText size={20} />, mobileIcon: <FileText size={22} /> },
    { name: "화물/선적", path: "/admin/shipments", icon: <Ship size={20} />, mobileIcon: <Ship size={22} /> },
    { name: "내륙 배차", path: "/admin/dispatches", icon: <Truck size={20} />, mobileIcon: <Truck size={22} /> },
    { name: "데빗노트", path: "/invoices", icon: <FileText size={20} />, mobileIcon: <FileText size={22} /> },
    { name: "정산/단가", path: "/admin/billing", icon: <CreditCard size={20} />, mobileIcon: <CreditCard size={22} /> },
    { name: "스케줄 관리", path: "/admin/schedules", icon: <Calendar size={20} />, mobileIcon: <Calendar size={22} /> },
  ];

  const activeMenus = user?.role === "client" ? clientMenus : adminMenus;

  const handleLogout = async () => {
    try {
      await api.post("/api/auth/logout", {}, { withCredentials: true });
      setUser(null);
      clearData();
      navigate("/login");
    } catch (err) {
      console.error("로그아웃 실패:", err);
    }
  };

  const getPageTitle = () => {
    const allMenus = [...clientMenus, ...adminMenus];
    const matched = allMenus.find((m) => m.path === currentPath);
    if (matched) return matched.name;
    if (currentPath.startsWith("/tracking")) return "화물 트래킹 상세";
    return "Forwarding Hub";
  };

  const isActive = (path: string) => currentPath === path;

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 font-sans text-slate-800 print:block print:h-auto">

      {/* ============================================================
          TOP NAVIGATION BAR (데스크탑 + 모바일 공용 상단바)
      ============================================================ */}
      <header className="sticky top-0 z-50 bg-slate-900 text-white shadow-lg print:hidden">

        {/* ── 1행: 로고(좌) + 알림·프로필(우) ── */}
        <div className="max-w-screen-2xl mx-auto px-4 h-12 flex items-center justify-between border-b border-white/5">

          {/* 로고 */}
          <Link to="/" className="flex items-center gap-2 shrink-0 group">
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
              <Anchor size={16} className="text-blue-400" />
            </div>
            <span className="text-sm font-black tracking-tight text-white hidden sm:block">
              Forwarding Hub
            </span>
            <span className="text-sm font-black tracking-tight text-white sm:hidden">
              FHub
            </span>
          </Link>

          {/* 우측 영역: 알림 + 프로필 + (모바일)햄버거 */}
          <div className="flex items-center gap-1 shrink-0">

            {/* 알림 벨 */}
            <div className="relative">
              <style>{`
                @keyframes layout-bell-wiggle {
                  0%, 100% { transform: rotate(0deg); }
                  10%, 30%, 50%, 70%, 90% { transform: rotate(-10deg); }
                  20%, 40%, 60%, 80% { transform: rotate(10deg); }
                }
                .animate-layout-bell-wiggle { animation: layout-bell-wiggle 1.5s ease-in-out infinite; }
              `}</style>
              <button
                onClick={() => setShowWindowsAlertDrawer(!showWindowsAlertDrawer)}
                className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              >
                <Bell size={20} className={missedAlerts.length > 0 ? "animate-layout-bell-wiggle text-blue-400" : ""} />
                {missedAlerts.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white font-mono text-[8px] font-black h-4 w-4 flex items-center justify-center rounded-full border border-slate-900 animate-pulse">
                    {missedAlerts.length}
                  </span>
                )}
                {!(missedAlerts.length > 0) && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-red-500 rounded-full" />
                )}
              </button>

              {/* 알림 드로어 */}
              {showWindowsAlertDrawer && (
                <div className="absolute right-0 top-12 z-[120] w-80 max-h-[480px] bg-slate-800/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                    <span className="text-sm font-bold text-white">알림센터</span>
                    <button onClick={() => setShowWindowsAlertDrawer(false)} className="text-slate-400 hover:text-white">
                      <X size={16} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2">
                    {missedAlerts.length > 0 ? (
                      missedAlerts.map((alert) => {
                        const isChat = alert.type === 'chat';
                        const timeStr = alert.timestamp || alert.time;
                        
                        return (
                          <div key={alert.id} className="p-3 bg-slate-700/60 border border-slate-600 rounded-xl flex flex-col gap-2">
                            <div>
                              <div className="flex justify-between items-start">
                                <span className="text-[10px] font-bold text-slate-400">{timeStr}</span>
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${
                                  isChat ? 'bg-blue-900/60 text-blue-300' :
                                  alert.type === 'booking' ? 'bg-red-900/60 text-red-300' :
                                  alert.type === 'document' ? 'bg-emerald-900/60 text-emerald-300' :
                                  alert.type === 'pdf' ? 'bg-indigo-900/60 text-indigo-300' : 'bg-slate-900/60 text-slate-300'
                                }`}>
                                  {isChat ? '메시지' :
                                   alert.type === 'booking' ? '부킹' :
                                   alert.type === 'document' ? '서류' :
                                   alert.type === 'pdf' ? '인보이스' : '일반'}
                                </span>
                              </div>
                              
                              <h5 className="text-xs font-bold text-white mt-1">{alert.title}</h5>
                              
                              {/* Content based on type */}
                              {alert.type === 'booking' && (
                                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                                  화주: {alert.meta?.username} 님
                                </p>
                              )}
                              {alert.type === 'document' && (
                                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                                  B/L 번호: {alert.meta?.blNumber}
                                </p>
                              )}
                              {alert.type === 'chat' && (
                                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed italic bg-white/5 p-1.5 rounded text-xs break-all">
                                  "{alert.message && alert.message.length > 30 ? alert.message.slice(0, 30) + "..." : alert.message}"
                                </p>
                              )}
                              {alert.type === 'pdf' && (
                                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed italic bg-white/5 p-1.5 rounded text-xs">
                                  {alert.message}
                                </p>
                              )}
                              {alert.type === 'shipper_docs' && (
                                <>
                                  <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                                    {alert.photoType === 'docs'
                                      ? <><span className="text-blue-400">@{alert.shipperName || '화주'}</span>로부터 말소증/차대각인사진이 도착</>
                                      : <><span className="text-blue-400">@{alert.shipperName || '화주'}</span>로부터 차량 외관 사진 도착</>
                                    }
                                  </p>
                                  <p className="text-[9px] text-slate-400 font-mono">B/L: {alert.blNumber}</p>
                                </>
                              )}
                            </div>
                            
                            <div className="flex gap-1.5 mt-1">
                              <button
                                onClick={() => {
                                  setMissedAlerts(prev => prev.filter(a => a.id !== alert.id));
                                  setShowWindowsAlertDrawer(false);
                                  
                                  if (alert.type === 'booking') {
                                    navigate("/admin/bookings");
                                  } else if (alert.type === 'document') {
                                    navigate("/admin/shipments");
                                  } else if (alert.type === 'chat') {
                                    navigate(`${user?.role === "admin" ? "/admin/bookings" : "/bookings"}?openChat=${alert.meta?.bookingId}`);
                                  } else if (alert.type === 'pdf') {
                                    navigate("/documents");
                                  } else if (alert.type === 'shipper_docs') {
                                    setActiveDashboardShipment({ id: alert.shipmentId, blNumber: alert.blNumber });
                                    navigate("/admin/shipments");
                                  }
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold py-1.5 rounded-lg transition"
                              >
                                확인하러가기
                              </button>
                              <button
                                onClick={() => setMissedAlerts(prev => prev.filter(a => a.id !== alert.id))}
                                className="px-2.5 bg-slate-650 hover:bg-slate-600 text-slate-200 text-[11px] font-bold py-1.5 rounded-lg transition"
                              >
                                확인
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500 py-10">
                        <BellRing size={26} className="mb-2 opacity-30 animate-bounce" />
                        <span className="text-xs font-bold">새로운 알림이 없습니다.</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 포워더 문의 말풍선 버튼 */}
            <button
              onClick={handleHeaderChatClick}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
              title="포워더 문의 대화방"
            >
              <MessageSquare size={20} />
            </button>

            {/* 프로필 드롭다운 (데스크탑) */}
            <div className="relative hidden md:block" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/10 transition"
              >
                <div className="w-7 h-7 rounded-full bg-blue-500/30 border border-blue-500/50 flex items-center justify-center text-blue-300 font-black text-xs">
                  {user?.username?.[0]?.toUpperCase()}
                </div>
                <span className="text-sm font-semibold text-slate-200 max-w-[80px] truncate">{user?.username}</span>
                <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-700">
                    <p className="text-xs text-slate-400">로그인 계정</p>
                    <p className="text-sm font-bold text-white truncate">{user?.username}</p>
                    <span className="inline-block mt-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {user?.role === "admin" ? "포워더" : "화주"}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm font-semibold text-rose-400 hover:bg-white/5 transition"
                  >
                    <LogOut size={16} />
                    로그아웃
                  </button>
                </div>
              )}
            </div>

            {/* 모바일 햄버거 (프로필/로그아웃용, md 미만) */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* ── 2행: 데스크탑 네비게이션 (정중앙, md 이상) ── */}
        <div className="hidden md:block border-t border-white/5">
          <nav className="max-w-screen-2xl mx-auto px-4 flex items-center justify-center gap-1 h-10">
            {activeMenus.map((menu) => {
              const active = isActive(menu.path);
              return (
                <Link
                  key={menu.path}
                  to={menu.path}
                  className={`relative flex items-center gap-1.5 px-4 h-full text-xs font-semibold transition-all duration-200 group ${
                    active ? "text-white" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {/* 액티브 하단 인디케이터 */}
                  <span
                    className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-t-full transition-all duration-300 ${
                      active ? "bg-blue-400 opacity-100" : "bg-white/0 opacity-0 group-hover:opacity-30 group-hover:bg-white/40"
                    }`}
                  />
                  {menu.icon}
                  <span>{menu.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* 모바일 드롭다운 메뉴 (프로필/로그아웃) */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900 px-4 py-3 space-y-1 animate-fade-in-up">
            <div className="flex items-center gap-3 px-3 py-2 mb-2">
              <div className="w-9 h-9 rounded-full bg-blue-500/30 border border-blue-500/50 flex items-center justify-center text-blue-300 font-black text-sm">
                {user?.username?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="text-xs text-slate-400">로그인 계정</p>
                <p className="text-sm font-bold text-white">{user?.username}</p>
              </div>
              <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {user?.role === "admin" ? "포워더" : "화주"}
              </span>
            </div>
            <button
              onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-rose-400 hover:bg-white/5 transition"
            >
              <LogOut size={16} />
              로그아웃
            </button>
          </div>
        )}
      </header>

      {/* ============================================================
          MAIN CONTENT
      ============================================================ */}
      <main className="flex-1 overflow-y-auto pb-24 md:pb-8 print:p-0 print:overflow-visible">
        <div className="px-4 md:px-8 py-5 max-w-screen-2xl mx-auto print:p-0">
          <Outlet />
        </div>
      </main>

      {/* ============================================================
          MOBILE BOTTOM TAB BAR (모바일 하단 탭바 — md 미만에서만 표시)
      ============================================================ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 print:hidden">
        {/* 배경: 유리형 블러 */}
        <div className="bg-white/90 backdrop-blur-xl border-t border-slate-200/80 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
          <div className="flex items-stretch h-16">
            {activeMenus.map((menu) => {
              const active = isActive(menu.path);
              return (
                <Link
                  key={menu.path}
                  to={menu.path}
                  className="flex-1 flex flex-col items-center justify-center gap-0.5 relative group transition-all"
                >
                  {/* 액티브 인디케이터 (상단 선) */}
                  <span
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-b-full transition-all duration-300 ${
                      active ? "w-8 bg-blue-500" : "w-0 bg-transparent"
                    }`}
                  />
                  {/* 아이콘 + pill 배경 */}
                  <span
                    className={`flex items-center justify-center w-10 h-6 rounded-full transition-all duration-300 ${
                      active
                        ? "bg-blue-100 text-blue-600 scale-110"
                        : "text-slate-400 group-hover:text-slate-600 group-hover:bg-slate-100"
                    }`}
                  >
                    {menu.mobileIcon}
                  </span>
                  {/* 라벨 */}
                  <span
                    className={`text-[10px] font-bold leading-none transition-colors duration-200 ${
                      active ? "text-blue-600" : "text-slate-400"
                    }`}
                  >
                    {menu.name}
                  </span>
                </Link>
              );
            })}
          </div>
          {/* Safe Area (아이폰 홈버튼 없는 모델) */}
          <div className="h-safe-area-inset-bottom bg-white/90" style={{ height: "env(safe-area-inset-bottom)" }} />
        </div>
      </nav>

      {/* ============================================================
          TOAST 알림 (공용)
      ============================================================ */}
      {alerts.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-50 flex flex-col gap-3 max-h-[75vh] overflow-y-auto w-72 md:w-80 p-1 scrollbar-thin print:hidden">
          {alerts.map((alert) => {
            const isChat = alert.type === 'chat';
            return (
              <div
                key={alert.id}
                className={`p-4 rounded-2xl shadow-2xl animate-alarm-shake transition-all duration-300 border-2 ${
                  isChat
                    ? "bg-slate-900 border-blue-500 text-white"
                    : alert.type === 'booking'
                    ? "bg-white border-red-500 text-slate-800"
                    : alert.type === 'document'
                    ? "bg-white border-green-500 text-slate-800"
                    : "bg-white border-blue-500 text-slate-800"
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className={`text-sm font-black ${
                    isChat ? "text-blue-400" :
                    alert.type === 'booking' ? "text-red-600" :
                    alert.type === 'document' ? "text-green-600" : "text-blue-600"
                  }`}>{alert.title}</h4>
                  <button onClick={() => removeAlert(alert.id)} className="text-slate-400 hover:text-slate-600 transition ml-2">
                    <X size={14} />
                  </button>
                </div>

                {alert.type === 'booking' && (
                  <>
                    <p className="text-slate-800 text-xs font-bold mt-1">화주: {alert.meta?.username} 님</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">요청일시: {alert.meta?.requestTime || alert.time}</p>
                    <button onClick={() => { removeAlert(alert.id); navigate("/admin/bookings"); }}
                      className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-bold text-xs transition">
                      부킹 요청 확인하러 가기
                    </button>
                  </>
                )}

                {alert.type === 'document' && (
                  <>
                    <p className="text-slate-800 text-xs font-bold mt-1">B/L 번호: {alert.meta?.blNumber}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">업로드 시각: {alert.meta?.requestTime || alert.time}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => { removeAlert(alert.id); navigate("/admin/shipments"); }}
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-bold text-xs transition">확인하러 가기</button>
                      <button onClick={() => removeAlert(alert.id)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs transition">닫기</button>
                    </div>
                  </>
                )}

                {alert.type === 'chat' && (
                  <>
                    <p className="text-slate-300 text-xs mt-1 font-bold">보낸 사람: {alert.meta?.senderName}</p>
                    <p className="text-slate-300 text-[11px] mt-1 bg-white/10 p-2 rounded-lg italic break-all">
                      "{alert.message && alert.message.length > 40 ? alert.message.slice(0, 40) + "..." : alert.message}"
                    </p>
                    <p className="text-slate-500 text-[10px] mt-1">수신일시: {alert.meta?.requestTime || alert.time}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => { removeAlert(alert.id); navigate(`${user?.role === "admin" ? "/admin/bookings" : "/bookings"}?openChat=${alert.meta?.bookingId}`); }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-xs transition">확인하러 가기</button>
                      <button onClick={() => removeAlert(alert.id)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg font-bold text-xs transition">닫기</button>
                    </div>
                  </>
                )}

                {alert.type === 'pdf' && (
                  <>
                    <p className="text-slate-800 text-xs font-bold mt-1">B/L 번호: {alert.meta?.blNumber}</p>
                    <p className="text-slate-500 text-[10px] mt-0.5">발행 시간: {alert.meta?.requestTime || alert.time}</p>
                    <p className="text-slate-600 text-[11px] mt-1.5 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">{alert.message}</p>
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => { removeAlert(alert.id); navigate("/client/documents"); }}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-xs transition">확인하러 가기</button>
                      <button onClick={() => removeAlert(alert.id)}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg font-bold text-xs transition">닫기</button>
                    </div>
                  </>
                )}

                {alert.type === 'general' && (
                  <>
                    <p className="text-slate-700 text-xs mt-1.5 leading-relaxed">{alert.message}</p>
                    <button onClick={() => removeAlert(alert.id)}
                      className="w-full mt-3 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-bold text-xs transition">확인</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 글로벌 업무 대화방 서랍장 */}
      {isHeaderChatOpen && latestBooking && (
        <BookingChatDrawer
          bookingId={latestBooking.id}
          isOpen={isHeaderChatOpen}
          onClose={() => {
            setIsHeaderChatOpen(false);
            setLatestBooking(null);
          }}
          vesselName={latestBooking.vessel_name}
          pol={latestBooking.pol}
          pod={latestBooking.pod}
          currentUser={{
            username: user?.username || "",
            role: user?.role || ""
          }}
        />
      )}
    </div>
  );
}
