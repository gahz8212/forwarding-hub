import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import axios from "axios";
import { useAuthStore } from "./store/useAuthStore";
import { useTrackingStore } from "./store/useTrackingStore";
import { Search, Ship, MapPin, Calendar, Clock, Anchor } from "lucide-react";

// 임시 로그인 컴포넌트
const Login = () => {
  const [username, setUsername] = React.useState("admin");
  const [password, setPassword] = React.useState("admin123");
  const { setUser } = useAuthStore();
  const [error, setError] = React.useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post(
        "http://localhost:5000/api/auth/login",
        {
          username,
          password,
        },
        { withCredentials: true },
      );

      if (response.data.success) {
        setUser(response.data.user);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "로그인 실패");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form
        onSubmit={handleLogin}
        className="bg-white p-8 rounded-xl shadow-lg w-96"
      >
        <h2 className="text-2xl font-bold text-center mb-6 text-brand-dark">
          Forwarding Hub
        </h2>
        {error && (
          <p className="text-red-500 mb-4 text-sm text-center">{error}</p>
        )}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Username
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            type="password"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-brand-blue text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
        >
          Login
        </button>
      </form>
    </div>
  );
};

// 임시 대시보드 컴포넌트
const Dashboard = () => {
  const { user, setUser } = useAuthStore();
  const {
    data: trackingData,
    shipments,
    loading,
    error,
    fetchTracking,
    fetchAllShipments,
    clearData,
  } = useTrackingStore();
  const [blInput, setBlInput] = React.useState("");

  // 탭 상태 (Tracking vs Schedule)
  const [activeTab, setActiveTab] = React.useState<"tracking" | "schedule">(
    "tracking",
  );

  // 스케줄 검색 상태
  const [scheduleQuery, setScheduleQuery] = React.useState({
    pod: "",
    cbm: "",
    weight: "",
  });
  const [schedules, setSchedules] = React.useState<any[]>([]);
  const [availablePods, setAvailablePods] = React.useState<string[]>([]);
  const [scheduleLoading, setScheduleLoading] = React.useState(false);

  React.useEffect(() => {
    fetchAllShipments();

    // 도착항 목록 가져오기
    axios
      .get("http://localhost:5000/api/schedules/pods", { withCredentials: true })
      .then((res) => {
        if (res.data.success) {
          setAvailablePods(res.data.data);
          if (res.data.data.length > 0) {
            setScheduleQuery((prev) => ({ ...prev, pod: res.data.data[0] }));
          }
        }
      })
      .catch((err) => console.error("POD 가져오기 실패:", err));
  }, [fetchAllShipments]);

  const handleLogout = async () => {
    try {
      await axios.post(
        "http://localhost:5000/api/auth/logout",
        {},
        { withCredentials: true },
      );
      setUser(null);
      clearData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (blInput.trim()) {
      fetchTracking(blInput.trim());
    }
  };

  const handleScheduleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setScheduleLoading(true);
    try {
      const res = await axios.get(
        "http://localhost:5000/api/schedules/search",
        {
          params: scheduleQuery,
          withCredentials: true,
        },
      );
      if (res.data.success) {
        setSchedules(res.data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScheduleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-light font-sans text-brand-dark pb-16">
      {/* Header */}
      <header className="bg-white shadow-sm border-b px-8 py-4 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-brand-blue mr-4">
            <Anchor size={28} />
            <h1 className="text-2xl font-black tracking-tight">
              Forwarding Hub
            </h1>
          </div>
          <button
            className={`font-bold pb-1 border-b-2 transition ${activeTab === "tracking" ? "border-brand-blue text-brand-blue" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            onClick={() => setActiveTab("tracking")}
          >
            내 화물 대시보드
          </button>
          <button
            className={`font-bold pb-1 border-b-2 transition ${activeTab === "schedule" ? "border-brand-blue text-brand-blue" : "border-transparent text-gray-500 hover:text-gray-800"}`}
            onClick={() => setActiveTab("schedule")}
          >
            선박 스케줄 조회
          </button>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm font-medium text-gray-500">
            환영합니다,{" "}
            <span className="font-bold text-brand-dark">{user?.username}</span>
            님
          </p>
          <button
            onClick={handleLogout}
            className="text-sm font-medium bg-gray-100 text-gray-700 px-4 py-2 rounded-full hover:bg-gray-200 transition"
          >
            로그아웃
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto p-8">
        {/* --- TRACKING TAB --- */}
        {activeTab === "tracking" && (
          <div className="animate-fade-in-up">
            {/* Search Section */}
            <div className="bg-white rounded-2xl shadow-sm border p-8 mb-8">
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Search className="text-brand-blue" />내 화물 B/L 트래킹
              </h2>
              <form onSubmit={handleSearch} className="flex gap-4">
                <input
                  type="text"
                  placeholder="B/L 번호를 입력하세요 (예: KMTC1234)"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue focus:border-transparent text-lg shadow-sm"
                  value={blInput}
                  onChange={(e) => setBlInput(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-brand-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-sm disabled:opacity-50"
                >
                  {loading ? "조회 중..." : "상세조회"}
                </button>
              </form>
              {error && (
                <p className="text-red-500 mt-4 text-sm font-medium">{error}</p>
              )}
            </div>

            {/* Tracking Result Section */}
            {trackingData && (
              <div className="bg-white rounded-2xl shadow-sm border p-8 mb-8">
                <div className="flex justify-between items-start mb-6 pb-6 border-b">
                  <div>
                    <h3 className="text-3xl font-black mb-2 text-brand-dark">
                      {trackingData.bl_number}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold ${trackingData.status === "Delivered" ? "bg-gray-100 text-gray-700" : "bg-green-100 text-green-700"}`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${trackingData.status === "Delivered" ? "bg-gray-500" : "bg-green-500"}`}
                      ></span>
                      {trackingData.status}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end text-gray-600 mb-1">
                      <Ship size={18} />
                      <span className="font-semibold text-lg">
                        {trackingData.vessel_name}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">
                      마지막 업데이트:{" "}
                      {new Date(trackingData.last_updated).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-8 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-100">
                  <div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                      출발 (POL)
                    </p>
                    <p className="text-lg font-bold flex items-center gap-2 mb-1">
                      <MapPin size={18} className="text-brand-blue" />
                      {trackingData.pol}
                    </p>
                    <p className="text-gray-500 flex items-center gap-2">
                      <Calendar size={16} /> ETD: {trackingData.etd}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                      도착 (POD)
                    </p>
                    <p className="text-lg font-bold flex items-center gap-2 mb-1">
                      <MapPin size={18} className="text-red-500" />
                      {trackingData.pod}
                    </p>
                    <p className="text-gray-500 flex items-center gap-2">
                      <Calendar size={16} /> ETA: {trackingData.eta}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* All Shipments Table Section */}
            <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
              <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <h3 className="text-lg font-bold text-brand-dark flex items-center gap-2">
                  <Ship className="text-brand-blue" />
                  진행중/완료 내 화물 목록 (100건)
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left border-collapse relative">
                  <thead className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider sticky top-0 shadow-sm z-10">
                    <tr>
                      <th className="p-4 border-b font-semibold">B/L 번호</th>
                      <th className="p-4 border-b font-semibold">선박명</th>
                      <th className="p-4 border-b font-semibold">상태</th>
                      <th className="p-4 border-b font-semibold">
                        구간 (POL -&gt; POD)
                      </th>
                      <th className="p-4 border-b font-semibold">ETA</th>
                      <th className="p-4 border-b font-semibold text-right">
                        청구 금액
                      </th>
                      <th className="p-4 border-b font-semibold text-center">
                        결제상태
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shipments.map((shipment: any, idx) => (
                      <tr
                        key={idx}
                        className="hover:bg-blue-50 transition cursor-pointer"
                        onClick={() => fetchTracking(shipment.bl_number)}
                      >
                        <td className="p-4 font-bold text-brand-blue">
                          {shipment.bl_number}
                        </td>
                        <td className="p-4 text-gray-800 font-medium">
                          {shipment.vessel_name}
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${shipment.status === "Delivered" ? "bg-gray-100 text-gray-600" : "bg-blue-100 text-blue-700"}`}
                          >
                            {shipment.status}
                          </span>
                        </td>
                        <td className="p-4 text-gray-600 text-sm">
                          {shipment.pol.split(",")[0]} ➔{" "}
                          {shipment.pod.split(",")[0]}
                        </td>
                        <td className="p-4 text-gray-800 text-sm">
                          {shipment.eta}
                        </td>
                        <td className="p-4 text-gray-800 text-sm font-semibold text-right text-red-600">
                          ${Number(shipment.invoice_amount).toLocaleString()}
                        </td>
                        <td className="p-4 text-center">
                          {shipment.is_paid ? (
                            <span className="text-green-500 text-sm font-bold bg-green-50 px-2 py-1 rounded">
                              완료
                            </span>
                          ) : (
                            <span className="text-red-500 text-sm font-bold bg-red-50 px-2 py-1 rounded">
                              미납
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* --- SCHEDULE TAB --- */}
        {activeTab === "schedule" && (
          <div className="animate-fade-in-up">
            <div className="bg-brand-dark rounded-2xl shadow-lg p-8 mb-8 text-white relative overflow-hidden">
              <div className="absolute right-0 top-0 opacity-10">
                <Ship size={200} />
              </div>
              <h2 className="text-2xl font-black mb-2 relative z-10">
                미래 선박 스케줄 검색
              </h2>
              <p className="text-gray-300 mb-6 relative z-10">
                보내실 화물의 조건(목적지, 부피, 무게)을 입력하시면 예약 가능한
                선박을 최대 5개까지 추천해 드립니다.
              </p>

              <form
                onSubmit={handleScheduleSearch}
                className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10"
              >
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1">
                    도착항 (POD)
                  </label>
                  <select
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue text-white appearance-none"
                    value={scheduleQuery.pod}
                    onChange={(e) =>
                      setScheduleQuery({ ...scheduleQuery, pod: e.target.value })
                    }
                  >
                    {availablePods.map((pod) => (
                      <option key={pod} value={pod} className="text-gray-800">
                        {pod}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1">
                    필요 부피 (CBM)
                  </label>
                  <input
                    type="number"
                    placeholder="예: 20"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue text-white placeholder-gray-400"
                    value={scheduleQuery.cbm}
                    onChange={(e) =>
                      setScheduleQuery({
                        ...scheduleQuery,
                        cbm: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-300 mb-1">
                    필요 무게 (kg)
                  </label>
                  <input
                    type="number"
                    placeholder="예: 10000"
                    className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue text-white placeholder-gray-400"
                    value={scheduleQuery.weight}
                    onChange={(e) =>
                      setScheduleQuery({
                        ...scheduleQuery,
                        weight: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={scheduleLoading}
                    className="w-full bg-brand-blue text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-600 transition shadow-sm disabled:opacity-50"
                  >
                    {scheduleLoading ? "검색 중..." : "스케줄 추천받기"}
                  </button>
                </div>
              </form>
            </div>

            {/* Schedule Results */}
            {schedules.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {schedules.map((sch, idx) => (
                  <div
                    key={idx}
                    className="bg-white border rounded-xl p-6 shadow-sm flex items-center justify-between hover:border-brand-blue transition"
                  >
                    <div className="flex gap-8">
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">
                          선박명
                        </p>
                        <p className="text-lg font-black text-brand-dark flex items-center gap-2">
                          <Ship size={16} className="text-brand-blue" />
                          {sch.vessel_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">
                          경로
                        </p>
                        <p className="font-bold text-gray-700">
                          {sch.pol.split(",")[0]}{" "}
                          <span className="text-brand-blue mx-1">➔</span>{" "}
                          {sch.pod.split(",")[0]}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">
                          일정
                        </p>
                        <p className="font-bold text-gray-700">
                          {sch.etd.split("T")[0]} ~ {sch.eta.split("T")[0]}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">
                          가용 공간 (CBM)
                        </p>
                        <p className="font-black text-green-600">
                          {Number(sch.available_cbm).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">
                          가용 무게 (kg)
                        </p>
                        <p className="font-black text-green-600">
                          {Number(sch.available_weight).toLocaleString()}
                        </p>
                      </div>
                      <button className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-6 py-2 rounded-lg font-bold text-sm transition">
                        부킹 요청
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300">
                <Ship size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">
                  검색 조건에 맞는 스케줄이 여기에 표시됩니다.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

function App() {
  const { isAuthenticated, checkAuth } = useAuthStore();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    checkAuth().finally(() => setLoading(false));
  }, [checkAuth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to="/" /> : <Login />}
        />
        <Route
          path="/"
          element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />}
        />
      </Routes>
    </Router>
  );
}

export default App;
