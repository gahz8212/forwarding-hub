import React, { useEffect } from "react";
import axios from "axios";
import { Ship } from "lucide-react";

export default function SchedulePage() {
  const [scheduleQuery, setScheduleQuery] = React.useState({
    pod: "",
    cbm: "",
    weight: "",
  });
  const [schedules, setSchedules] = React.useState<any[]>([]);
  const [availablePods, setAvailablePods] = React.useState<string[]>([]);
  const [scheduleLoading, setScheduleLoading] = React.useState(false);

  useEffect(() => {
    // 도착항 목록 가져오기
    axios
      .get("http://localhost:5000/api/schedules/pods", {
        withCredentials: true,
      })
      .then((res) => {
        if (res.data.success) {
          setAvailablePods(res.data.data);
          if (res.data.data.length > 0) {
            setScheduleQuery((prev) => ({ ...prev, pod: res.data.data[0] }));
          }
        }
      })
      .catch((err) => console.error("POD 가져오기 실패:", err));
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
      <div className="bg-slate-900 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10">
          <Ship size={200} />
        </div>
        <h2 className="text-2xl font-black mb-2 relative z-10">
          미래 선박 스케줄 검색
        </h2>
        <p className="text-slate-300 mb-6 relative z-10 text-sm">
          보내실 화물의 조건(목적지, 부피, 무게)을 입력하시면 예약 가능한 선박을 최대 5개까지 추천해 드립니다.
        </p>

        <form
          onSubmit={handleScheduleSearch}
          className="grid grid-cols-1 md:grid-cols-4 gap-4 relative z-10"
        >
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              도착항 (POD)
            </label>
            <select
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white appearance-none transition"
              value={scheduleQuery.pod}
              onChange={(e) =>
                setScheduleQuery({
                  ...scheduleQuery,
                  pod: e.target.value,
                })
              }
            >
              {availablePods.map((pod) => (
                <option key={pod} value={pod} className="text-slate-800">
                  {pod}
                </option>
              ))}
            </select>
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
          <div className="flex items-end">
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
        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
          <div className="p-6 border-b bg-slate-50">
            <h3 className="text-lg font-bold text-slate-800">추천 선박 스케줄 목록</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1000px]">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="p-4 font-bold text-center">LINE</th>
                  <th className="p-4 font-bold">VESSEL</th>
                  <th className="p-4 font-bold text-center">VOY</th>
                  <th className="p-4 font-bold text-center text-red-600">DOC CLS</th>
                  <th className="p-4 font-bold text-center text-amber-600">CGO CLS</th>
                  <th className="p-4 font-bold">POL (출발)</th>
                  <th className="p-4 font-bold">ETD</th>
                  <th className="p-4 font-bold">POD (도착)</th>
                  <th className="p-4 font-bold">ETA</th>
                  <th className="p-4 font-bold text-center">SPACE (CBM/kg)</th>
                  <th className="p-4 font-bold text-center">동작</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {schedules.map((sch, idx) => {
                  const formatDateTime = (dtStr: string) => {
                    if (!dtStr) return "-";
                    const d = new Date(dtStr);
                    // Format: 06/02 09:00
                    const month = d.getMonth() + 1;
                    const date = d.getDate().toString().padStart(2, "0");
                    const hours = d.getHours().toString().padStart(2, "0");
                    const minutes = d.getMinutes().toString().padStart(2, "0");
                    return `${month}/${date} ${hours}:${minutes}`;
                  };

                  return (
                    <tr key={idx} className="hover:bg-blue-50 transition text-sm">
                      <td className="p-4 text-center">
                        <span className="inline-block px-2.5 py-1 rounded bg-slate-100 text-slate-700 text-xs font-bold">
                          {sch.line || "-"}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-slate-800">
                        <div className="flex items-center gap-1.5">
                          <Ship size={14} className="text-slate-400" />
                          {sch.vessel_name}
                        </div>
                      </td>
                      <td className="p-4 text-center text-slate-600 font-semibold">
                        {sch.voyage || "-"}
                      </td>
                      <td className="p-4 text-center font-bold text-red-600 bg-red-50/30">
                        {formatDateTime(sch.doc_closing_date)}
                      </td>
                      <td className="p-4 text-center font-bold text-amber-600 bg-amber-50/30">
                        {formatDateTime(sch.cargo_closing_date)}
                      </td>
                      <td className="p-4 text-slate-600 font-medium">
                        {sch.pol.split(",")[0]}
                      </td>
                      <td className="p-4 font-semibold text-slate-800">
                        {sch.etd ? sch.etd.split("T")[0] : ""}
                      </td>
                      <td className="p-4 text-slate-600 font-medium">
                        {sch.pod.split(",")[0]}
                      </td>
                      <td className="p-4 font-semibold text-slate-800">
                        {sch.eta ? sch.eta.split("T")[0] : ""}
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
