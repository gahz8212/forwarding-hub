import React, { useEffect } from "react";
import axios from "axios";
import { Ship, Globe, Key, Clock } from "lucide-react";

export default function SchedulePage() {
  const [scheduleQuery, setScheduleQuery] = React.useState({
    pol: "KRPUS", // 출발항 기본값
    pod: "",
    cbm: "",
    weight: "",
  });
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
        }
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
        { schedule },
        { withCredentials: true }
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
        <h2 className="text-2xl font-black mb-2 relative z-10">
          미래 선박 스케줄 검색
        </h2>
       

        <form
          onSubmit={handleScheduleSearch}
          className="grid grid-cols-1 md:grid-cols-5 gap-4 relative z-10"
        >
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
              onChange={(e) =>
                setScheduleQuery({
                  ...scheduleQuery,
                  pol: e.target.value,
                })
              }
              required
            />
            <datalist id="search-pol-list">
              <option value="KRPUS">BUSAN (KRPUS)</option>
              <option value="KRINC">INCHEON (KRINC)</option>
              <option value="CNSHA">SHANGHAI (CNSHA)</option>
            </datalist>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['KRPUS', 'KRINC', 'CNSHA'].map(port => (
                <button
                  key={port}
                  type="button"
                  onClick={() => setScheduleQuery(prev => ({ ...prev, pol: port }))}
                  className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-2 py-0.5 rounded transition"
                >
                  {port === 'KRPUS' ? '부산' : port === 'KRINC' ? '인천' : '상하이'}
                </button>
              ))}
            </div>
          </div>
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
              onChange={(e) =>
                setScheduleQuery({
                  ...scheduleQuery,
                  pod: e.target.value,
                })
              }
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
              {['USLGB', 'USLAX', 'USSEA'].map(port => (
                <button
                  key={port}
                  type="button"
                  onClick={() => setScheduleQuery(prev => ({ ...prev, pod: port }))}
                  className="text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-2 py-0.5 rounded transition"
                >
                  {port === 'USLGB' ? '롱비치' : port === 'USLAX' ? 'LA' : '시애틀'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              필요 부피 (CBM)
            </label>
            <input
              type="number"
              placeholder="예: 20"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400 transition"
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
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              필요 무게 (kg)
            </label>
            <input
              type="number"
              placeholder="예: 10000"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-400 transition"
              value={scheduleQuery.weight}
              onChange={(e) =>
                setScheduleQuery({
                  ...scheduleQuery,
                  weight: e.target.value,
                })
              }
            />
          </div>
          <div>
            <label className="block text-xs mb-1.5 select-none opacity-0">검색</label>
            <button
              type="submit"
              disabled={scheduleLoading}
              className="w-full bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-500 transition shadow-sm disabled:opacity-50"
            >
              {scheduleLoading ? "검색 중..." : "스케줄 추천받기"}
            </button>
          </div>
        </form>
      </div>

      {/* Schedule Results */}
      {schedules.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden flex flex-col">
            <div className="p-6 border-b bg-slate-50 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <span>추천 선박 스케줄 목록</span>
                <span className="text-sm bg-blue-50 text-blue-700 px-4 py-1.5 rounded-xl border border-blue-200 font-extrabold ml-3">
                  {(schedules[0]?.pol || "").split(",")[0] || "BUSAN"} ➔ {(schedules[0]?.pod || "").split(",")[0] || "LONG BEACH"}
                </span>
              </h3>
            </div>
            <div className="overflow-x-auto min-h-[500px]">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="p-4 font-bold text-center">LINE</th>
                    <th className="p-4 font-bold">VESSEL/VOY</th>
                    <th className="p-4 font-bold">ETD</th>
                    <th className="p-4 font-bold">ETA</th>
                    <th className="p-4 font-bold text-center text-slate-700">마감일정</th>
                    <th className="p-4 font-bold text-center">SPACE (CBM/kg)</th>
                    <th className="p-4 font-bold text-center">동작</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-slate-100">
                {schedules.map((sch, idx) => {
                  const formatDateTime = (dtVal: any) => {
                    if (!dtVal) return "-";
                    const cleanVal = typeof dtVal === 'string' 
                      ? dtVal.replace(/(\d+)(st|nd|rd|th)/gi, '$1') 
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
                      return typeof sch.metadata === 'string' ? JSON.parse(sch.metadata) : sch.metadata;
                    } catch (e) {
                      return null;
                    }
                  })();

                  return (
                    <tr key={idx} className="hover:bg-blue-50 transition text-sm relative group hover:z-50">
                      <td className="p-4 text-center">
                        <span className="inline-block px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-bold">
                          {sch.line || "-"}
                        </span>
                      </td>
                      <td className="p-4 text-slate-800">
                        <div className="font-bold flex items-center gap-1.5">
                          <Ship size={14} className="text-slate-400" />
                          <span>{sch.vessel_name} / {sch.voyage || "V001"}</span>
                        </div>
                        {sch.vessel_imo && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5" title="Vessel IMO Code">
                            IMO: {sch.vessel_imo}
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-semibold text-slate-800">
                        {sch.etd && typeof sch.etd === "string" ? sch.etd.split("T")[0] : "-"}
                      </td>
                      <td className="p-4 font-semibold text-slate-800">
                        {sch.eta && typeof sch.eta === "string" ? sch.eta.split("T")[0] : "-"}
                      </td>
                      <td className="p-4 text-center bg-slate-50/50 relative">
                        <div className="flex items-center justify-center">
                          <Clock size={18} className="text-red-500 hover:scale-110 transition-transform" />
                        </div>
                        
                        {/* 통합 마감 상세 툴팁 (1, 2번째 행은 아래로 열리고, 3번째 행부터는 위로 열림) */}
                        <div className={`absolute z-20 hidden group-hover:block left-1/2 transform -translate-x-1/2 w-60 bg-slate-950 text-white text-[11px] rounded-xl p-3 shadow-xl border border-slate-800 text-left leading-relaxed ${
                          idx < 2 ? "top-full mt-2" : "bottom-full mb-2"
                        }`}>
                          <div className="font-bold text-blue-400 mb-2 border-b border-slate-800 pb-1">⏰ 상세 마감일정 정보</div>
                          
                          <div className="space-y-1.5">
                            <div className="flex justify-between gap-2">
                              <span className="text-slate-400">서류(SI) 마감:</span>
                              <span className="font-semibold text-red-400">{formatDateTime(parsedMeta?.siCutOff || sch.doc_closing_date)}</span>
                            </div>
                            
                            {parsedMeta?.vgmCutOff && (
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-400">VGM 서류 마감:</span>
                                <span className="font-semibold text-purple-400">{formatDateTime(parsedMeta.vgmCutOff)}</span>
                              </div>
                            )}

                            <div className="flex justify-between gap-2 border-t border-slate-900 pt-1.5 mt-1.5">
                              <span className="text-slate-400">CY 반입 마감:</span>
                              <span className="font-semibold text-amber-400">{formatDateTime(parsedMeta?.cyCutOff || sch.cargo_closing_date)}</span>
                            </div>

                            {parsedMeta?.dangerousCutOff && (
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-400">위험물 반입 마감:</span>
                                <span className="font-semibold text-rose-400">{formatDateTime(parsedMeta.dangerousCutOff)}</span>
                              </div>
                            )}

                            {parsedMeta?.reeferCutOff && (
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-400">냉동(리퍼) 마감:</span>
                                <span className="font-semibold text-blue-400">{formatDateTime(parsedMeta.reeferCutOff)}</span>
                              </div>
                            )}
                          </div>
                          
                          {/* 말풍선 꼬리 날개 (방향 동적 변환) */}
                          <div className={`absolute left-1/2 transform -translate-x-1/2 border-4 border-transparent ${
                            idx < 2 ? "bottom-full border-b-slate-950" : "top-full border-t-slate-950"
                          }`}></div>
                        </div>
                      </td>
                      <td className="p-4 text-center text-slate-600 text-xs font-semibold">
                        {Number(sch.available_cbm).toFixed(0)} CBM / {Number(sch.available_weight).toLocaleString()} kg
                      </td>
                      <td className="p-4 text-center">
                        <button
                          onClick={() => handleBookingRequest(sch)}
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition shadow-sm"
                        >
                          부킹 요청
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
