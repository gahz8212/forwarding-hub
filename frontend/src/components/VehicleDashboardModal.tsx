import React, { useState, useEffect, useRef } from "react";
import { X, Camera, CheckCircle, Truck, Ship, AlertTriangle, Upload, FileImage, Loader2 } from "lucide-react";

interface Vehicle {
  id: number;
  vin: string;
  make: string;
  model: string;
  year: number;
  drivability: string;
  status: string;
  condition_photo_url: string | null;
  customs_cleared: boolean;
}

interface Props {
  shipmentId: number;
  blNumber: string;
  onClose: () => void;
}

export default function VehicleDashboardModal({ shipmentId, blNumber, onClose }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("shipmentId", shipmentId.toString());
    
    // 최대 20장 업로드 (예시)
    Array.from(files).slice(0, 20).forEach(file => {
      formData.append("photos", file);
    });

    try {
      // 나중에 실제 API 엔드포인트 도메인으로 변경될 수 있습니다.
      const response = await fetch("http://localhost:5000/api/files/upload-vehicle-photos", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      
      if (data.success) {
        alert(`업로드 완료! 총 \${data.data.length}장의 사진이 처리되었습니다.\n(성공 및 수동분류 결과는 개발자 콘솔에서 확인 가능합니다.)`);
        console.log("OCR 처리 결과:", data.data);
        // 실제 운영 환경에서는 여기서 차량 목록(setVehicles)을 백엔드에서 다시 불러옵니다.
      } else {
        alert("업로드 실패: " + data.message);
      }
    } catch (error) {
      console.error("업로드 에러:", error);
      alert("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Mock data for demonstration until backend API is fully wired
  useEffect(() => {
    setLoading(true);
    setTimeout(() => {
      setVehicles([
        { id: 1, vin: "KNDJB8123M109283", make: "Kia", model: "Sportage", year: 2021, drivability: "Running", status: "Yard In", condition_photo_url: null, customs_cleared: true },
        { id: 2, vin: "KMHGN4123L109111", make: "Hyundai", model: "Tucson", year: 2020, drivability: "Towing", status: "Pending", condition_photo_url: null, customs_cleared: false },
        { id: 3, vin: "JHMZC4123K108444", make: "Honda", model: "CR-V", year: 2019, drivability: "Running", status: "Loaded", condition_photo_url: "dummy.jpg", customs_cleared: true },
      ]);
      setLoading(false);
    }, 500);
  }, [shipmentId]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Loaded": return <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded text-xs font-bold">선적 완료</span>;
      case "Yard In": return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-bold">야드 반입</span>;
      case "Pending": return <span className="bg-slate-100 text-slate-800 px-2 py-0.5 rounded text-xs font-bold">대기중</span>;
      default: return <span className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded text-xs font-bold">{status}</span>;
    }
  };

  const getDrivabilityIcon = (drivability: string) => {
    switch (drivability) {
      case "Running": return <span className="text-emerald-600 flex items-center text-xs"><CheckCircle size={12} className="mr-1"/> Running</span>;
      case "Towing": return <span className="text-amber-600 flex items-center text-xs"><Truck size={12} className="mr-1"/> Towing</span>;
      case "Forklift": return <span className="text-rose-600 flex items-center text-xs"><AlertTriangle size={12} className="mr-1"/> Forklift</span>;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
              <Ship className="mr-2 text-blue-600" size={20} />
              로로선 차량 관리 대시보드
            </h2>
            <p className="text-sm text-slate-500 mt-1">B/L 번호: <span className="font-mono font-bold text-blue-600">{blNumber}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              multiple 
              accept="image/*,.zip" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <FileImage size={16} />}
              {uploading ? "OCR 분석 중..." : "차량 사진 일괄 업로드"}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 bg-slate-50 dark:bg-slate-950/50">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="p-3 font-bold">차대번호 (VIN)</th>
                    <th className="p-3 font-bold">제원 (Make/Model)</th>
                    <th className="p-3 font-bold">상태/통관</th>
                    <th className="p-3 font-bold">구동 여부</th>
                    <th className="p-3 font-bold text-center">데미지 리포트 (사진)</th>
                    <th className="p-3 font-bold text-center">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {vehicles.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-200">{v.vin}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800 dark:text-white">{v.make} {v.model}</div>
                        <div className="text-xs text-slate-500">{v.year}년식</div>
                      </td>
                      <td className="p-3">
                        <div className="mb-1">{getStatusBadge(v.status)}</div>
                        {v.customs_cleared ? (
                          <span className="text-xs text-blue-600 font-semibold border border-blue-200 bg-blue-50 px-1.5 py-0.5 rounded">통관필</span>
                        ) : (
                          <span className="text-xs text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">미통관</span>
                        )}
                      </td>
                      <td className="p-3">
                        {getDrivabilityIcon(v.drivability)}
                      </td>
                      <td className="p-3 text-center">
                        {v.condition_photo_url ? (
                          <button className="inline-flex items-center justify-center p-1.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors" title="사진 보기">
                            <Camera size={16} />
                            <span className="ml-1 text-xs font-bold">보기</span>
                          </button>
                        ) : (
                          <button className="inline-flex items-center justify-center p-1.5 border border-dashed border-slate-300 text-slate-400 rounded hover:bg-slate-50 hover:text-slate-600 transition-colors" title="사진 업로드">
                            <Upload size={16} />
                            <span className="ml-1 text-xs">업로드</span>
                          </button>
                        )}
                      </td>
                      <td className="p-3 text-center">
                         <button className="text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors">상태 변경</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
