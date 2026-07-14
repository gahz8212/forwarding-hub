import React, { useEffect } from "react";
import axios from "axios";
import { Ship } from "lucide-react";

export default function SchedulePage() {
  const [scheduleQuery, setScheduleQuery] = React.useState({
    pol: "KRPUS", // 출발항 기본값
    pod: "",
    cbm: "",
    weight: "",
  });
  const [incoterms, setIncoterms] = React.useState("FOB/FCA (F조건)");
  const [schedules, setSchedules] = React.useState<any[]>([]);
  const [availablePods, setAvailablePods] = React.useState<string[]>([]);
  const [scheduleLoading, setScheduleLoading] = React.useState(false);

  const fetchPodsList = async () => {
    try {
      const res = await axios.get("http://localhost:5000/api/schedules/pods", {
        withCredentials: true,
      });
      if (res.data.success) {
        setAvailablePods(res.data.data);
        if (res.data.data.length > 0 && !scheduleQuery.pod) {
          setScheduleQuery((prev) => ({ ...prev, pod: res.data.data[0] }));
        }
      }
    } catch (err) {
      console.error("POD 가져오기 실패:", err);
    }
  };

  useEffect(() => {
    fetchPodsList();
  }, []);

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

  const handleBookingRequest = async (schedule: any) => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/schedules/book",
        { schedule, incoterms },
        { withCredentials: true },
      );
      if (res.data.success) {
        alert(res.data.message);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "부킹 요청 실패");
    }
  };

  return (
    <div className="animate-fade-in-up space-y-8">
      {/* DB 스케줄 검색 */}
      <div className="bg-slate-900 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10">
          <Ship size={200} />
        </div>
        <h2 className="text-2xl font-black mb-2 relative z-10">스케줄 검색</h2>

        <form
          onSubmit={handleScheduleSearch}
          className="space-y-4 relative z-10"
        >
          {/* ── 1행: 출발항 → 도착항 + Incoterms ── */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_1fr] gap-3 items-start">

            {/* 출발항 (POL) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                출발항 (POL)
              </label>
              <input
                type="text"
                list="search-pol-list"
                placeholder="예: KRPUS"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400 transition uppercase"
                value={scheduleQuery.pol}
                onChange={(e) => setScheduleQuery({ ...scheduleQuery, pol: e.target.value })}
                required
              />
              <datalist id="search-pol-list">
                <option value="KRPUS">BUSAN (KRPUS)</option>
                <option value="KRINC">INCHEON (KRINC)</option>
                <option value="CNSHA">SHANGHAI (CNSHA)</option>
              </datalist>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {["KRPUS", "KRINC", "CNSHA"].map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => setScheduleQuery((prev) => ({ ...prev, pol: port }))}
                    className={`text-[10px] border px-2.5 py-0.5 rounded-full transition font-semibold ${
                      scheduleQuery.pol === port
                        ? "bg-blue-500/30 border-blue-400 text-blue-300"
                        : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-400"
                    }`}
                  >
                    {port === "KRPUS" ? "부산" : port === "KRINC" ? "인천" : "상하이"}
                  </button>
                ))}
              </div>
            </div>

            {/* 화살표 구분자 */}
            <div className="hidden md:flex items-center justify-center pt-9 text-blue-400 text-lg font-black select-none">
              →
            </div>

            {/* 도착항 (POD) */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                도착항 (POD)
              </label>
              <input
                type="text"
                list="search-pod-list"
                placeholder="예: USLGB"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400 transition uppercase"
                value={scheduleQuery.pod}
                onChange={(e) => setScheduleQuery({ ...scheduleQuery, pod: e.target.value })}
                required
              />
              <datalist id="search-pod-list">
                {availablePods.map((pod) => (
                  <option key={pod} value={pod} />
                ))}
                <option value="USLGB">LONG BEACH (USLGB)</option>
                <option value="USLAX">LOS ANGELES (USLAX)</option>
                <option value="USSEA">SEATTLE (USSEA)</option>
                <option value="NLRTM">ROTTERDAM (NLRTM)</option>
              </datalist>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {["USLGB", "USLAX", "USSEA"].map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => setScheduleQuery((prev) => ({ ...prev, pod: port }))}
                    className={`text-[10px] border px-2.5 py-0.5 rounded-full transition font-semibold ${
                      scheduleQuery.pod === port
                        ? "bg-blue-500/30 border-blue-400 text-blue-300"
                        : "bg-white/5 hover:bg-white/10 border-white/10 text-slate-400"
                    }`}
                  >
                    {port === "USLGB" ? "롱비치" : port === "USLAX" ? "LA" : "시애틀"}
                  </button>
                ))}
              </div>
            </div>

            {/* Incoterms */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                거래 조건 (Incoterms)
              </label>
              <select
                className="w-full px-4 py-3 bg-slate-800 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white transition"
                value={incoterms}
                onChange={(e) => setIncoterms(e.target.value)}
              >
                <option value="EXW (E조건)">EXW (E조건)</option>
                <option value="FOB/FCA (F조건)">FOB/FCA (F조건)</option>
                <option value="CFR/CIF (C조건)">CFR/CIF (C조건)</option>
                <option value="DAP/DDP (D조건)">DAP/DDP (D조건)</option>
              </select>
            </div>
          </div>

          {/* ── 2행: CBM + 무게 + 검색 버튼 ── */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">

            {/* CBM */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">
                필요 부피 <span className="text-slate-500 font-normal">(CBM · 선택)</span>
              </label>
              <input
                type="number"
                placeholder="예: 20"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500 transition"
                value={scheduleQuery.cbm}
                onChange={(e) => setScheduleQuery({ ...scheduleQuery, cbm: e.target.value })}
              />
            </div>

            {/* 무게 */}
            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">
                필요 무게 <span className="text-slate-500 font-normal">(kg · 선택)</span>
              </label>
              <input
                type="number"
                placeholder="예: 10000"
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500 transition"
                value={scheduleQuery.weight}
                onChange={(e) => setScheduleQuery({ ...scheduleQuery, weight: e.target.value })}
              />
            </div>

            {/* 검색 버튼 */}
            <button
              type="submit"
              disabled={scheduleLoading}
              className="w-full md:w-auto md:min-w-[148px] px-10 py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl shadow-lg shadow-blue-900/40 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {scheduleLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  검색 중...
                </span>
              ) : "🔍 스케줄 검색"}
            </button>
          </div>
        </form>
      </div>

      {/* Schedule Results */}
      {schedules.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col">
          <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 flex items-center">
              <span>스케줄 목록</span>
              <span className="text-sm bg-blue-50 text-blue-700 px-4 py-1.5 rounded-xl border border-blue-200 font-extrabold ml-3">
                {(schedules[0]?.pol || "").split(",")[0] || "BUSAN"} ➔{" "}
                {(schedules[0]?.pod || "").split(",")[0] || "LONG BEACH"}
              </span>
            </h3>
          </div>
          <div className="min-h-[500px]">
            {/* 모바일 카드 뷰 */}
            <div className="block md:hidden divide-y divide-slate-100">
              {schedules.map((sch, idx) => {
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
                  if (!sch.metadata) return null;
                  try {
                    return typeof sch.metadata === "string"
                      ? JSON.parse(sch.metadata)
                      : sch.metadata;
                  } catch (e) {
                    return null;
                  }
                })();

                const handleRowClick = () => {
                  const confirmed = window.confirm(
                    `[${sch.vessel_name} / ${sch.voyage || "V001"}]\n\nETD: ${sch.etd?.split("T")[0] ?? "-"}  →  ETA: ${sch.eta?.split("T")[0] ?? "-"}\n\n이 스케줄로 부킹 요청하시겠습니까?`
                  );
                  if (confirmed) handleBookingRequest(sch);
                };

                return (
                  <div
                    key={idx}
                    onClick={handleRowClick}
                    className="p-4 space-y-3 bg-white hover:bg-slate-50 transition cursor-pointer"
                  >
                    {/* 카드 헤더: 선사(LINE) 배지 + 선박명 / VOY */}
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="shrink-0 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold">
                          {sch.line || "-"}
                        </span>
                        <div className="font-bold text-slate-800 text-sm truncate flex items-center gap-1 min-w-0">
                          <Ship size={14} className="text-slate-400 shrink-0" />
                          <span className="truncate">{sch.vessel_name}</span>
                        </div>
                      </div>
                      <div className="shrink-0 font-bold text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                        {sch.voyage || "V001"}
                      </div>
                    </div>

                    {/* 선박 세부정보 (IMO) */}
                    {sch.vessel_imo && (
                      <div className="text-[10px] text-slate-400 font-mono pl-6">
                        IMO: {sch.vessel_imo}
                      </div>
                    )}

                    {/* ETD / ETA 일정 */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-2.5 rounded-lg text-xs">
                      <div>
                        <div className="text-slate-400 text-[9px] font-bold">ETD (출발)</div>
                        <div className="font-semibold text-slate-800 mt-0.5">
                          {sch.etd && typeof sch.etd === "string" ? sch.etd.split("T")[0] : "-"}
                        </div>
                      </div>
                      <div>
                        <div className="text-blue-400 text-[9px] font-bold">ETA (도착)</div>
                        <div className="font-semibold text-blue-700 mt-0.5">
                          {sch.eta && typeof sch.eta === "string" ? sch.eta.split("T")[0] : "-"}
                        </div>
                      </div>
                    </div>

                    {/* 마감 일정 (2열 그리드 레이아웃) */}
                    <div className="pt-2 border-t border-slate-100 mt-2 text-[11px] grid grid-cols-2 gap-x-4 gap-y-2">
                      {/* SI 마감 | VGM 마감 */}
                      <div className="flex justify-between items-center border-r border-slate-100 pr-2">
                        <span className="text-slate-400">SI 마감</span>
                        <span className="font-semibold text-red-500 tabular-nums">
                          {formatDateTime(parsedMeta?.siCutOff || sch.doc_closing_date)}
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
                          {formatDateTime(parsedMeta?.cyCutOff || sch.cargo_closing_date)}
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
              <table className="table-fixed w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-0.5 py-2 font-bold text-center w-1/4">LINE</th>
                    <th className="px-0.5 py-2 font-bold w-1/4">VESSEL / VOY</th>
                    <th className="px-0.5 py-2 font-bold w-1/4">ETD / ETA</th>
                    <th className="px-0.5 py-2 font-bold w-1/4">마감일정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {schedules.map((sch, idx) => {
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
                      if (!sch.metadata) return null;
                      try {
                        return typeof sch.metadata === "string"
                          ? JSON.parse(sch.metadata)
                          : sch.metadata;
                      } catch (e) {
                        return null;
                      }
                    })();

                    const handleRowClick = () => {
                      const confirmed = window.confirm(
                        `[${sch.vessel_name} / ${sch.voyage || "V001"}]\n\nETD: ${sch.etd?.split("T")[0] ?? "-"}  →  ETA: ${sch.eta?.split("T")[0] ?? "-"}\n\n이 스케줄로 부킹 요청하시겠습니까?`
                      );
                      if (confirmed) handleBookingRequest(sch);
                    };

                    return (
                      <tr
                        key={idx}
                        onClick={handleRowClick}
                        className="hover:bg-blue-50 transition text-sm relative group hover:z-50 cursor-pointer"
                      >
                        {/* LINE */}
                        <td className="px-0.5 py-2 text-center">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-xs font-bold">
                            {sch.line || "-"}
                          </span>
                        </td>

                        {/* VESSEL / VOY — 2단 */}
                        <td className="px-0.5 py-2 text-slate-800">
                          <div className="flex items-center gap-1 font-bold text-xs">
                            <Ship size={12} className="text-slate-400 shrink-0" />
                            <span className="truncate" title={sch.vessel_name}>{sch.vessel_name}</span>
                          </div>
                          <div className="text-xs text-slate-800 font-bold mt-0.5 pl-4 truncate" title={sch.voyage || "V001"}>
                            {sch.voyage || "V001"}
                          </div>
                          {sch.vessel_imo && (
                            <div className="text-[10px] text-slate-400 font-mono mt-0.5 pl-4 truncate" title={`IMO: ${sch.vessel_imo}`}>
                              IMO: {sch.vessel_imo}
                            </div>
                          )}
                        </td>

                        {/* ETD / ETA — 2단 */}
                        <td className="px-0.5 py-2">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black text-slate-400 w-6">ETD</span>
                              <span className="text-xs font-semibold text-slate-800">
                                {sch.etd && typeof sch.etd === "string" ? sch.etd.split("T")[0] : "-"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] font-black text-blue-400 w-6">ETA</span>
                              <span className="text-xs font-semibold text-blue-700">
                                {sch.eta && typeof sch.eta === "string" ? sch.eta.split("T")[0] : "-"}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 마감일정 — 상시 인라인 표시 */}
                        <td className="px-0.5 py-2">
                          <div className="flex flex-col gap-px text-[11px]">
                            <div className="flex items-center justify-start gap-2">
                              <span className="text-slate-400 shrink-0 w-12">SI</span>
                              <span className="font-semibold text-red-500 tabular-nums">
                                {formatDateTime(parsedMeta?.siCutOff || sch.doc_closing_date)}
                              </span>
                            </div>
                            {parsedMeta?.vgmCutOff && (
                              <div className="flex items-center justify-start gap-2">
                                <span className="text-slate-400 shrink-0 w-12">VGM</span>
                                <span className="font-semibold text-purple-500 tabular-nums">
                                  {formatDateTime(parsedMeta.vgmCutOff)}
                                </span>
                              </div>
                            )}
                            <div className="flex items-center justify-start gap-2 border-t border-slate-100 pt-px mt-px">
                              <span className="text-slate-400 shrink-0 w-12">CY</span>
                              <span className="font-semibold text-amber-600 tabular-nums">
                                {formatDateTime(parsedMeta?.cyCutOff || sch.cargo_closing_date)}
                              </span>
                            </div>
                            {parsedMeta?.dangerousCutOff && (
                              <div className="flex items-center justify-start gap-2">
                                <span className="text-slate-400 shrink-0 w-12">위험물</span>
                                <span className="font-semibold text-rose-500 tabular-nums">
                                  {formatDateTime(parsedMeta.dangerousCutOff)}
                                </span>
                              </div>
                            )}
                            {parsedMeta?.reeferCutOff && (
                              <div className="flex items-center justify-start gap-2">
                                <span className="text-slate-400 shrink-0 w-12">리퍼</span>
                                <span className="font-semibold text-blue-500 tabular-nums">
                                  {formatDateTime(parsedMeta.reeferCutOff)}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      ) : (
        <div className="text-center py-16 bg-white rounded-xl border border-dashed border-slate-300">
          <Ship size={48} className="mx-auto text-slate-300 mb-4" />
          <p className="text-slate-500 font-medium">
            검색 조건에 맞는 스케줄이 여기에 표시됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
