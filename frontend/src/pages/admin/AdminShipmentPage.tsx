import React, { useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { Edit2, ShieldAlert, FileText, Check, Truck, ArrowRight, RefreshCw } from "lucide-react";

export default function AdminShipmentPage() {
  const [shipments, setShipments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 트럭 배정 입력 폼 상태
  const [activeAssignBl, setActiveAssignBl] = useState<string | null>(null);
  const [truckDate, setTruckDate] = useState("");
  const [truckPlate, setTruckPlate] = useState("");
  const [truckPhone, setTruckPhone] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fetchShipments = () => {
    setLoading(true);
    axios
      .get("http://localhost:5000/api/tracking/all", { withCredentials: true })
      .then((res) => {
        if (res.data.success) {
          setShipments(res.data.data);
        }
      })
      .catch((err) => {
        console.error("전체 선적 내역 조회 실패:", err);
        setError("선적 목록을 불러오는 중 오류가 발생했습니다.");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchShipments();

    // 실시간 소켓 업데이트 연동 (어드민 채널)
    const socket = io("http://localhost:5000");

    socket.on("connect", () => {
      console.log("어드민 선적 관리 소켓 연결 완료");
      socket.emit("join", { role: "admin" });
    });

    socket.on("shipment_status_changed", (data: any) => {
      console.log("실시간 선적 상태 변동 감지 (어드민):", data);
      // 작업 중인 화면이 깜빡이지 않도록 백그라운드에서 조용히 리스트 갱신
      axios
        .get("http://localhost:5000/api/tracking/all", { withCredentials: true })
        .then((res) => {
          if (res.data.success) {
            setShipments(res.data.data);
          }
        })
        .catch((err) => console.error("실시간 선적 갱신 실패:", err));
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // 1. 서류 승인 처리
  const handleVerifyDocs = async (blNumber: string) => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/tracking/verify-docs",
        { blNumber },
        { withCredentials: true }
      );
      if (res.data.success) {
        alert(res.data.message);
        fetchShipments();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "서류 검증 처리 실패");
    }
  };

  // 2. 트럭 배정 등록
  const handleAssignTruckSubmit = async (e: React.FormEvent, blNumber: string) => {
    e.preventDefault();
    if (!truckDate || !truckPlate || !truckPhone) {
      alert("모든 배정 정보(방문일, 차량번호, 기사 연락처)를 입력해 주세요.");
      return;
    }

    setAssigning(true);
    try {
      const res = await axios.post(
        "http://localhost:5000/api/tracking/assign-truck",
        {
          blNumber,
          truckDate,
          truckPlateNumber: truckPlate,
          truckDriverPhone: truckPhone,
        },
        { withCredentials: true }
      );
      if (res.data.success) {
        alert(res.data.message);
        setActiveAssignBl(null);
        setTruckDate("");
        setTruckPlate("");
        setTruckPhone("");
        fetchShipments();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "트럭 배정 처리 실패");
    } finally {
      setAssigning(false);
    }
  };

  // 3. 선적 진행 단계 수동 제어 (Gate In ➔ Loaded ➔ In Transit ➔ Delivered)
  const handleStatusChange = async (blNumber: string, newStatus: string) => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/tracking/update-status",
        { blNumber, status: newStatus },
        { withCredentials: true }
      );
      if (res.data.success) {
        alert(res.data.message);
        fetchShipments();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "상태 변경 실패");
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">선적 상태 통합 제어</h3>
            <p className="text-slate-500 text-sm mt-0.5">
              이곳에서 포워더 오퍼레이터는 화주가 올린 서류를 검토하거나, 트럭을 배정하고, 선적 진행 상황을 수동으로 변경할 수 있습니다.
            </p>
          </div>
        </div>
        <button
          onClick={fetchShipments}
          className="p-2 border rounded-xl hover:bg-slate-50 text-slate-600 transition flex items-center gap-1 text-sm font-bold shadow-sm"
        >
          <RefreshCw size={16} /> 새로고침
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">전체 등록된 화물 목록 ({shipments.length}건)</h3>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-8 text-center text-slate-500">불러오는 중...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-500">{error}</div>
          ) : shipments.length === 0 ? (
            <div className="p-8 text-center text-slate-500">등록된 선적 내역이 없습니다.</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="p-4 font-bold">B/L 번호</th>
                  <th className="p-4 font-bold">소속 화주</th>
                  <th className="p-4 font-bold">선박/구간</th>
                  <th className="p-4 font-bold text-center">진행 단계</th>
                  <th className="p-4 font-bold">제어 & 액션 패널</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shipments.map((s) => (
                  <tr key={s.bl_number} className="hover:bg-slate-50/50 transition text-sm">
                    <td className="p-4 font-bold text-blue-600 align-top">
                      {s.bl_number}
                    </td>
                    <td className="p-4 text-slate-700 font-semibold align-top">
                      {s.shipper}
                    </td>
                    <td className="p-4 align-top">
                      <div className="font-bold text-slate-800">{s.vessel_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {s.pol.split(",")[0]} ➔ {s.pod.split(",")[0]}
                      </div>
                    </td>
                    <td className="p-4 text-center align-top">
                      <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${
                        s.status === "Delivered" 
                          ? "bg-slate-100 text-slate-600" 
                          : s.status === "Pending Documents"
                          ? "bg-red-50 text-red-600 border border-red-100"
                          : s.status === "Documents Uploaded"
                          ? "bg-amber-50 text-amber-600 border border-amber-100 animate-pulse"
                          : "bg-blue-100 text-blue-700"
                      }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-4 align-top">
                      {/* 상태별 제어 컴포넌트 분기 */}
                      
                      {/* 1단계: 서류 업로드 대기 */}
                      {s.status === "Pending Documents" && (
                        <span className="text-xs text-slate-400 font-medium italic">화주의 인보이스/패킹리스트 제출을 대기하고 있습니다.</span>
                      )}

                      {/* 2단계: 화주가 서류 제출 완료 ➔ 어드민이 확인 후 검증 승인 */}
                      {s.status === "Documents Uploaded" && (
                        <div className="space-y-2">
                          <div className="flex gap-4">
                            <a
                              href={`http://localhost:5000${s.invoice_file_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <FileText size={14} /> 인보이스 다운로드
                            </a>
                            <a
                              href={`http://localhost:5000${s.packing_list_file_path}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <FileText size={14} /> 패킹리스트 다운로드
                            </a>
                          </div>
                          <button
                            onClick={() => handleVerifyDocs(s.bl_number)}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm"
                          >
                            <Check size={14} /> 서류 검증 완료 처리
                          </button>
                        </div>
                      )}

                      {/* 3단계: 서류 확인 완료 ➔ 트럭 운송 수동 배정 */}
                      {s.status === "Documents Verified" && (
                        <div className="space-y-3">
                          {activeAssignBl !== s.bl_number ? (
                            <button
                              onClick={() => {
                                setActiveAssignBl(s.bl_number);
                                setTruckDate("");
                                setTruckPlate("");
                                setTruckPhone("");
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm"
                            >
                              <Truck size={14} /> 내륙 운송 트럭 배정
                            </button>
                          ) : (
                            <form 
                              onSubmit={(e) => handleAssignTruckSubmit(e, s.bl_number)}
                              className="bg-slate-50 border p-4 rounded-xl space-y-3 text-xs max-w-sm"
                            >
                              <div className="font-bold text-slate-700">트럭 및 기사 매핑 설정</div>
                              <div>
                                <label className="block text-slate-500 font-bold mb-1">방문/운송일자</label>
                                <input 
                                  type="date" 
                                  className="w-full border p-1.5 rounded"
                                  value={truckDate}
                                  onChange={(e) => setTruckDate(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-slate-500 font-bold mb-1">차량 번호 (예: 경기99바1234)</label>
                                <input 
                                  type="text" 
                                  placeholder="차량번호 입력"
                                  className="w-full border p-1.5 rounded"
                                  value={truckPlate}
                                  onChange={(e) => setTruckPlate(e.target.value)}
                                />
                              </div>
                              <div>
                                <label className="block text-slate-500 font-bold mb-1">기사 연락처 (예: 010-9999-1234)</label>
                                <input 
                                  type="text" 
                                  placeholder="기사 연락처 입력"
                                  className="w-full border p-1.5 rounded"
                                  value={truckPhone}
                                  onChange={(e) => setTruckPhone(e.target.value)}
                                />
                              </div>
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => setActiveAssignBl(null)}
                                  className="bg-white border text-slate-600 px-3 py-1 rounded font-bold"
                                >
                                  취소
                                </button>
                                <button
                                  type="submit"
                                  disabled={assigning}
                                  className="bg-blue-600 text-white px-3 py-1 rounded font-bold hover:bg-blue-700 transition disabled:opacity-50"
                                >
                                  배정 등록
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      )}

                      {/* 4단계 및 이후 단계: 트럭 정보 표시 및 진행 단계 수동 제어(드롭다운) */}
                      {["Trucking", "Gate In", "Loaded on Vessel", "In Transit", "Delivered"].includes(s.status) && (
                        <div className="space-y-3">
                          {/* 트럭 정보 */}
                          <div className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs space-y-1 max-w-sm">
                            <div className="text-slate-500 font-bold flex items-center gap-1"><Truck size={12} /> 트럭 운송 매핑 정보</div>
                            <div className="text-slate-700 font-semibold">운송일: {s.truck_date ? s.truck_date.split("T")[0] : "-"}</div>
                            <div className="text-slate-700 font-semibold">차량: {s.truck_plate_number || "-"} | 기사: {s.truck_driver_phone || "-"}</div>
                          </div>

                          {/* 상태 전이 수동 변경 셀렉트박스 */}
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">운송 단계 제어:</span>
                            <select
                              value={s.status}
                              onChange={(e) => handleStatusChange(s.bl_number, e.target.value)}
                              className="border rounded px-2.5 py-1 text-xs bg-white font-bold text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                            >
                              <option value="Trucking">Trucking (트럭 운송 중)</option>
                              <option value="Gate In">Gate In (CY 입고완료)</option>
                              <option value="Loaded on Vessel">Loaded on Vessel (선적 완료)</option>
                              <option value="In Transit">In Transit (해상 운송 중)</option>
                              <option value="Delivered">Delivered (배달 완료)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
