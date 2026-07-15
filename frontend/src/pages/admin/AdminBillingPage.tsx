import api, { API_BASE_URL } from '../../api/axios';
import React, { useState, useEffect } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { 
  Settings, 
  DollarSign, 
  Percent, 
  Plus, 
  Save, 
  Users, 
  Database,
  CheckCircle,
  AlertTriangle,
  RefreshCw
} from "lucide-react";

interface Client {
  client_id: string;
  client_name: string;
  margin_type: "PERCENTAGE" | "FIXED";
  ocean_margin_rate: number;
  local_margin_rate: number;
  fixed_margin_per_unit: number;
}

interface CostRate {
  cargo_type: "SEDAN" | "SUV" | "TRUCK" | "BUS";
  ocean_cost_usd: number;
  lashing_cost_krw: number;
  thc_cost_krw: number;
  wharfage_cost_krw: number;
  bl_fee_krw: number;
  customs_cost_krw: number;
}

export default function AdminBillingPage() {
  const [activeTab, setActiveTab] = useState<"margins" | "costs">("margins");
  const [clients, setClients] = useState<Client[]>([]);
  const [costRates, setCostRates] = useState<CostRate[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Client form modal state
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({
    client_id: "",
    client_name: "",
    margin_type: "PERCENTAGE" as "PERCENTAGE" | "FIXED",
    ocean_margin_rate: 0,
    local_margin_rate: 0,
    fixed_margin_per_unit: 0,
  });

  // Fetch initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [clientsRes, costsRes] = await Promise.all([
        api.get("/api/billing/clients", { withCredentials: true }),
        api.get("/api/billing/costs", { withCredentials: true })
      ]);
      if (clientsRes.data.success) setClients(clientsRes.data.clients);
      if (costsRes.data.success) setCostRates(costsRes.data.costRates);
    } catch (err) {
      console.error("Billing data fetch error:", err);
      showFeedback("error", "데이터를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 1. 실시간 소켓 업데이트 연동 (관리자 채널)
    const socket = io(API_BASE_URL);
    socket.emit("join", { role: "admin" });

    // 소켓이 연결되거나 재연결(connect)될 때 최신 데이터 자동 동기화
    socket.on("connect", () => {
      console.log("소켓 연결/재연결 성공: 데이터 동기화");
      fetchData();
    });

    socket.on("billing_settings_changed", (data) => {
      console.log("실시간 정산/단가 변동 수신:", data);
      fetchData();
    });

    // 2. 화면 복귀(탭 포커스) 시 자동 데이터 갱신
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        console.log("화면 복귀 감지: 데이터 동기화");
        fetchData();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      socket.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const showFeedback = (type: "success" | "error", text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // Save client margin configuration
  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.client_id || !clientForm.client_name) {
      showFeedback("error", "화주 코드와 화주명을 입력해 주세요.");
      return;
    }

    try {
      const res = await api.post("/api/billing/clients",
        clientForm,
        { withCredentials: true }
      );
      if (res.data.success) {
        showFeedback("success", res.data.message || "마진 설정이 성공적으로 저장되었습니다.");
        setShowClientModal(false);
        fetchData();
      }
    } catch (err) {
      console.error("Save client error:", err);
      showFeedback("error", "화주 설정을 저장하지 못했습니다.");
    }
  };

  // Open client modal for editing
  const openEditClient = (client: Client) => {
    setEditingClient(client);
    setClientForm({
      client_id: client.client_id,
      client_name: client.client_name,
      margin_type: client.margin_type,
      ocean_margin_rate: Number(client.ocean_margin_rate),
      local_margin_rate: Number(client.local_margin_rate),
      fixed_margin_per_unit: Number(client.fixed_margin_per_unit),
    });
    setShowClientModal(true);
  };

  // Open client modal for creating
  const openCreateClient = () => {
    setEditingClient(null);
    setClientForm({
      client_id: "",
      client_name: "",
      margin_type: "PERCENTAGE",
      ocean_margin_rate: 0,
      local_margin_rate: 0,
      fixed_margin_per_unit: 0,
    });
    setShowClientModal(true);
  };

  // Cost rate field change handler
  const handleCostFieldChange = (
    index: number,
    field: keyof CostRate,
    value: string
  ) => {
    const updated = [...costRates];
    const numVal = parseFloat(value) || 0;
    updated[index] = {
      ...updated[index],
      [field]: numVal
    };
    setCostRates(updated);
  };

  // Save all cost rates
  const handleSaveCosts = async () => {
    try {
      setLoading(true);
      const res = await api.post("/api/billing/costs",
        { rates: costRates },
        { withCredentials: true }
      );
      if (res.data.success) {
        showFeedback("success", "선사 원가 기준표가 성공적으로 업데이트되었습니다.");
        fetchData();
      }
    } catch (err) {
      console.error("Save cost rates error:", err);
      showFeedback("error", "원가 설정을 저장하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Page Title & Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 md:p-8 rounded-3xl shadow-xl text-white">
        <div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight">정산 & 단가 관리 시스템</h2>
          <p className="text-slate-300 text-sm mt-2">
            화주별 마진율 설정 및 선사 매입 원가를 관리하여 정확한 데빗노트(Debit Note)를 산출합니다.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "margins" && (
            <button
              onClick={openCreateClient}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition rounded-xl font-bold shadow-lg shadow-indigo-600/30"
            >
              <Plus size={18} />
              신규 화주 마진 추가
            </button>
          )}
        </div>
      </div>

      {/* Toast Alert */}
      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 shadow-md border animate-bounce ${
          message.type === "success" 
            ? "bg-green-50 text-green-800 border-green-200" 
            : "bg-red-50 text-red-800 border-red-200"
        }`}>
          {message.type === "success" ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
          <span className="font-bold text-sm">{message.text}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab("margins")}
          className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition ${
            activeTab === "margins"
              ? "border-indigo-600 text-indigo-600 bg-indigo-50/20"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users size={18} />
          화주별 마진(Markup) 관리
        </button>
        <button
          onClick={() => setActiveTab("costs")}
          className={`flex items-center gap-2 px-6 py-3 font-bold text-sm border-b-2 transition ${
            activeTab === "costs"
              ? "border-indigo-600 text-indigo-600 bg-indigo-50/20"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Database size={18} />
          선사 매입 원가(Cost) 기준표
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "margins" ? (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800">화주 목록 및 마진 테이블</h3>
            <span className="text-xs text-slate-400 font-medium">총 {clients.length}개 업체</span>
          </div>

          {clients.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-bold text-sm bg-white dark:bg-slate-900 border-t">
              등록된 화주 마진 설정이 없습니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-6 bg-slate-50/30 dark:bg-slate-900/10 border-t">
              {clients.map((c) => (
                <div 
                  key={c.client_id}
                  className="p-5 border border-slate-200 dark:border-slate-800 rounded-2xl bg-white dark:bg-slate-900 shadow-3xs hover:shadow-2xs hover:border-slate-350 dark:hover:border-slate-700 transition flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-100 dark:border-slate-850">
                      <div>
                        <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">{c.client_name}</h4>
                        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 font-bold">{c.client_id}</span>
                      </div>
                      {c.margin_type === "PERCENTAGE" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/50">
                          <Percent size={11} /> 정률 마진
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-blue-50 text-blue-700 border border-blue-100 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50">
                          <DollarSign size={11} /> 정액 마진
                        </span>
                      )}
                    </div>

                    {/* Details */}
                    <div className="space-y-2 text-xs font-bold text-slate-600 dark:text-slate-400 mb-4">
                      <div className="flex justify-between pb-1.5 border-b border-slate-50 dark:border-slate-850/50">
                        <span className="text-slate-400 font-medium">해상 운임 마진 (Ocean):</span>
                        <span className="text-slate-700 dark:text-slate-350">{c.margin_type === "PERCENTAGE" ? `${c.ocean_margin_rate}%` : "-"}</span>
                      </div>
                      <div className="flex justify-between pb-1.5 border-b border-slate-50 dark:border-slate-850/50">
                        <span className="text-slate-400 font-medium">로컬 비용 마진 (Local):</span>
                        <span className="text-slate-700 dark:text-slate-350">{c.margin_type === "PERCENTAGE" ? `${c.local_margin_rate}%` : "-"}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400 font-medium">대당 고정 마진 (Fixed):</span>
                        <span className="text-slate-750 dark:text-slate-300">{c.margin_type === "FIXED" ? `$${Number(c.fixed_margin_per_unit).toLocaleString()}` : "-"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Edit Button */}
                  <button
                    type="button"
                    onClick={() => openEditClient(c)}
                    className="w-full h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-750 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition rounded-lg font-bold text-xs cursor-pointer mt-auto border border-slate-200 dark:border-slate-700/50"
                  >
                    마진 정보 수정
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden space-y-6 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-800">선사 매입 원가 매트릭스</h3>
              <p className="text-sm text-slate-400 mt-1">
                기본 선사 원가를 입력해 두면, 정산 시 화주 마진율과 자동 병합하여 최종 청구 단가를 계산합니다.
              </p>
            </div>
            <button
              onClick={handleSaveCosts}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 transition rounded-xl font-bold text-white shadow-lg shadow-indigo-600/30"
            >
              <Save size={18} />
              원가 변동사항 저장
            </button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {costRates.map((rate, index) => (
              <div 
                key={rate.cargo_type}
                className="p-5 border border-slate-100 rounded-2xl bg-slate-50/50 hover:border-indigo-100 transition shadow-sm"
              >
                <div className="flex items-center gap-2 border-b pb-3 mb-4">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                  <h4 className="font-extrabold text-slate-800">{rate.cargo_type} 단가 구성</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      해상운임 (Ocean, USD)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">$</div>
                      <input
                        type="number"
                        value={rate.ocean_cost_usd}
                        onChange={(e) => handleCostFieldChange(index, "ocean_cost_usd", e.target.value)}
                        className="pl-7 pr-3 py-2 w-full border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition bg-white text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      고박료 (Lashing, KRW)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">₩</div>
                      <input
                        type="number"
                        value={rate.lashing_cost_krw}
                        onChange={(e) => handleCostFieldChange(index, "lashing_cost_krw", e.target.value)}
                        className="pl-7 pr-3 py-2 w-full border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition bg-white text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      터미널이용료 (THC, KRW)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">₩</div>
                      <input
                        type="number"
                        value={rate.thc_cost_krw}
                        onChange={(e) => handleCostFieldChange(index, "thc_cost_krw", e.target.value)}
                        className="pl-7 pr-3 py-2 w-full border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition bg-white text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      부두사용료 (Wharfage, KRW)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">₩</div>
                      <input
                        type="number"
                        value={rate.wharfage_cost_krw}
                        onChange={(e) => handleCostFieldChange(index, "wharfage_cost_krw", e.target.value)}
                        className="pl-7 pr-3 py-2 w-full border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition bg-white text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      서류비 (B/L Fee, KRW)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">₩</div>
                      <input
                        type="number"
                        value={rate.bl_fee_krw}
                        onChange={(e) => handleCostFieldChange(index, "bl_fee_krw", e.target.value)}
                        className="pl-7 pr-3 py-2 w-full border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition bg-white text-sm font-semibold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                      관세사수수료 (Customs, KRW)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 text-sm">₩</div>
                      <input
                        type="number"
                        value={rate.customs_cost_krw}
                        onChange={(e) => handleCostFieldChange(index, "customs_cost_krw", e.target.value)}
                        className="pl-7 pr-3 py-2 w-full border border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition bg-white text-sm font-semibold"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Client Modal */}
      {showClientModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-100 transform transition-all duration-350 scale-100">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <h3 className="font-bold text-lg">
                {editingClient ? "화주 마진 설정 수정" : "신규 화주 마진 설정"}
              </h3>
              <button 
                onClick={() => setShowClientModal(false)}
                className="text-white/60 hover:text-white transition font-bold"
              >
                닫기
              </button>
            </div>

            <form onSubmit={handleSaveClient} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">화주 코드 (Client ID)</label>
                <input
                  type="text"
                  value={clientForm.client_id}
                  disabled={!!editingClient}
                  placeholder="예: DONG_A_TRADE"
                  onChange={(e) => setClientForm({ ...clientForm, client_id: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold disabled:bg-slate-50 disabled:text-slate-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">화주 회사명</label>
                <input
                  type="text"
                  value={clientForm.client_name}
                  placeholder="예: (주)대동자동차무역"
                  onChange={(e) => setClientForm({ ...clientForm, client_name: e.target.value })}
                  className="w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">마진 적용 방식</label>
                <select
                  value={clientForm.margin_type}
                  onChange={(e) => setClientForm({ ...clientForm, margin_type: e.target.value as "PERCENTAGE" | "FIXED" })}
                  className="w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold"
                >
                  <option value="PERCENTAGE">정률 마진 (Percentage %)</option>
                  <option value="FIXED">정액 마진 (Fixed Cost $)</option>
                </select>
              </div>

              {clientForm.margin_type === "PERCENTAGE" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">해상 운임 마진율 (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={clientForm.ocean_margin_rate}
                      onChange={(e) => setClientForm({ ...clientForm, ocean_margin_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">로컬 비용 마진율 (%)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={clientForm.local_margin_rate}
                      onChange={(e) => setClientForm({ ...clientForm, local_margin_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">차량 대당 고정 마진액 (USD)</label>
                  <input
                    type="number"
                    value={clientForm.fixed_margin_per_unit}
                    onChange={(e) => setClientForm({ ...clientForm, fixed_margin_per_unit: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2.5 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold"
                  />
                </div>
              )}

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowClientModal(false)}
                  className="flex-1 px-4 py-2.5 border rounded-xl hover:bg-slate-50 font-bold text-sm text-slate-600 transition"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition"
                >
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
