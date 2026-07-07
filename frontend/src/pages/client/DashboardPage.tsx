import React, { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { io } from "socket.io-client";
import { useTrackingStore } from "../../store/useTrackingStore";
import {
  Search,
  Ship,
  MapPin,
  Calendar,
  CheckCircle2,
  FileUp,
  FileText,
  Truck,
  Camera,
  AlertTriangle
} from "lucide-react";

const STEPS = [
  { key: "Pending Documents", label: "서류 업로드" },
  { key: "Documents Verified", label: "서류 검증" },
  { key: "Trucking", label: "운송" },
  { key: "Gate In", label: "CY 입고" },
  { key: "Loaded on Vessel", label: "선적 완료" },
  { key: "Departed", label: "출항" },
  { key: "In Transit", label: "해상 운송" },
  { key: "Delivered", label: "배송 완료" }
];

const getStepIndex = (status: string) => {
  switch (status) {
    case "Pending Documents": return 0;
    case "Documents Uploaded": return 1; // 화주가 업로드 완료하여 서류 검증 단계(1) 대기 중
    case "Documents Verified": return 2; // 서류 검증 완료, 운송 단계(2) 대기 중
    case "Trucking": return 3;           // 운송 중, CY 입고 단계(3) 대기 중
    case "Gate In": return 4;            // 입고 완료, 선적 완료 단계(4) 대기 중
    case "Loaded on Vessel": return 5;   // 선적 완료, 출항 단계(5) 대기 중
    case "Departed": return 6;           // 출항, 해상 운송 단계(6) 대기 중
    case "In Transit": return 7;         // 해상 운송 중, 배송 완료 단계(7) 대기 중
    case "Delivered": return 8;          // 완료
    default: return -1;
  }
};

export default function DashboardPage() {
  const {
    data: trackingData,
    shipments,
    loading,
    error,
    fetchTracking,
    fetchAllShipments,
  } = useTrackingStore();
  const [blInput, setBlInput] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<'in-progress' | 'completed'>('in-progress');

  // 1. 상태 필터링된 선적 목록 계산 및 최근 발행일(ETD 역순) 정렬
  const filteredShipments = React.useMemo(() => {
    const filtered = shipments.filter(s => {
      if (statusFilter === 'completed') {
        return s.status === 'Delivered';
      } else {
        return s.status !== 'Delivered';
      }
    });

    return filtered.sort((a, b) => {
      const dateA = a.etd || a.last_updated || "";
      const dateB = b.etd || b.last_updated || "";
      return dateB.localeCompare(dateA);
    });
  }, [shipments, statusFilter]);

  // 2. 필터가 변경되거나 선적 정보가 로드되었을 때 가장 최근 B/L 자동 로드
  useEffect(() => {
    if (filteredShipments.length > 0) {
      const currentBl = trackingData?.bl_number;
      // 현재 조회중인 B/L이 현재 필터링 목록에 없는 경우에만 첫 번째(최근) B/L 자동 로드
      const exists = filteredShipments.some(s => s.bl_number === currentBl);
      if (!exists) {
        setIsMapOpen(false);
        fetchTracking(filteredShipments[0].bl_number);
        setBlInput(filteredShipments[0].bl_number);
      }
    }
  }, [filteredShipments, trackingData?.bl_number, fetchTracking]);

  // 3. 현재 조회중인 B/L의 상태와 진행/완료 필터 탭 동기화
  useEffect(() => {
    if (trackingData) {
      const isCompleted = trackingData.status === 'Delivered';
      setStatusFilter(isCompleted ? 'completed' : 'in-progress');
    }
  }, [trackingData?.bl_number, trackingData?.status]);

  // URL에서 bl 쿼리 파라미터 가져오기
  const [searchParams, setSearchParams] = useSearchParams();
  const queryBl = searchParams.get("bl");

  useEffect(() => {
    if (queryBl) {
      const trimmed = queryBl.trim();
      setBlInput(trimmed);
      fetchTracking(trimmed);

      // 주소창의 쿼리스트링 비워주기
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("bl");
      setSearchParams(newParams, { replace: true });
    }
  }, [queryBl, fetchTracking, searchParams, setSearchParams]);

  // 실시간 지도 노출 상태 제어
  const [isMapOpen, setIsMapOpen] = React.useState(false);

  // 선명별 실제 해운 MMSI 매핑 헬퍼
  const getVesselMmsi = (vesselName: string) => {
    if (!vesselName) return "440114000";
    const name = vesselName.toUpperCase();
    if (name.includes("RUBY")) return "440114000";       // HMM RUBY
    if (name.includes("NINGBO")) return "440112000";     // SM NINGBO
    if (name.includes("SHANGHAI")) return "440087000";   // SM SHANGHAI
    if (name.includes("TURQUOISE")) return "440306000";  // HMM TURQUOISE
    if (name.includes("TOPAZ")) return "440078000";      // HMM TOPAZ
    if (name.includes("YANTIAN")) return "440338000";    // SM YANTIAN
    return "440114000";
  };

  const activeIdx = trackingData ? getStepIndex(trackingData.status) : -1;

  // 선적 정보가 들어왔을 때, 상태가 해상 운송 단계(5, 6)이면 지도를 자동으로 켜고, 그 외에는 닫기
  useEffect(() => {
    if (trackingData) {
      const idx = getStepIndex(trackingData.status);
      if (idx === 5 || idx === 6) {
        setIsMapOpen(true);
      } else {
        setIsMapOpen(false);
      }
    } else {
      setIsMapOpen(false);
    }
  }, [trackingData]);

  // 소켓 레프 및 실시간 연동
  const socketRef = React.useRef<any>(null);

  // 파일 업로드 상태 관리
  const [invoiceFile, setInvoiceFile] = React.useState<File | null>(null);
  const [packingFile, setPackingFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);

  const [exteriorFiles, setExteriorFiles] = React.useState<FileList | null>(null);
  const [uploadingExterior, setUploadingExterior] = React.useState(false);

  const [docFiles, setDocFiles] = React.useState<FileList | null>(null);
  const [uploadingDocs, setUploadingDocs] = React.useState(false);

  useEffect(() => {
    fetchAllShipments();
  }, [fetchAllShipments]);

  // 실시간 트래킹 B/L 룸 입장 및 업데이트 감지
  useEffect(() => {
    if (!trackingData?.bl_number) return;

    const socket = io("http://localhost:5000");
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("실시간 B/L 룸 조인:", trackingData.bl_number);
      socket.emit("join_bl_room", { blNumber: trackingData.bl_number });
    });

    socket.on("shipment_status_changed", (data: any) => {
      console.log("실시간 B/L 상태 변경 이벤트 수신:", data);
      if (data.blNumber === trackingData.bl_number) {
        // 새로고침 없이 즉각 데이터 갱신
        fetchTracking(trackingData.bl_number);
        fetchAllShipments();
      }
    });

    return () => {
      if (socket) {
        socket.emit("leave_bl_room", { blNumber: trackingData.bl_number });
        socket.disconnect();
      }
    };
  }, [trackingData?.bl_number, fetchTracking, fetchAllShipments]);

  // 항만별 좌표 매핑 데이터
  const getPortCoordinates = (portName: string): [number, number] => {
    if (!portName) return [35.08, 129.04];
    const name = portName.toUpperCase();
    if (name.includes("BUSAN") || name.includes("PUS")) return [35.08, 129.04]; // 부산
    if (name.includes("TOKYO")) return [35.60, 139.77];                          // 도쿄
    if (name.includes("NINGBO")) return [29.85, 121.85];                         // 닝보
    if (name.includes("SHANGHAI")) return [30.62, 122.06];                       // 상하이
    if (name.includes("YANTIAN")) return [22.57, 114.27];                         // 얀티안
    if (name.includes("LAX") || name.includes("LGB") || name.includes("LOS ANGELES")) return [33.74, -118.26]; // LA
    return [35.08, 129.04];
  };

  // 날짜변경선을 건널 때 좌표가 깨지지 않도록 동쪽/서쪽 연속성을 보강해주는 헬퍼
  const getAdjustedCoords = (polName: string, podName: string): { pol: [number, number], pod: [number, number], isCrossDateLine: boolean } => {
    const pol = getPortCoordinates(polName);
    const pod = getPortCoordinates(podName);

    // 경도 차이가 180도보다 크면 날짜변경선을 통과하는 것임
    if (Math.abs(pod[1] - pol[1]) > 180) {
      if (pol[1] > pod[1]) {
        // 한국 ➔ 미국 (예: 129 ➔ -118). 미국 경도를 242로 시프트하여 태평양이 중심에 위치하게 함
        return { pol, pod: [pod[0], pod[1] + 360], isCrossDateLine: true };
      } else {
        // 미국 ➔ 한국 (예: -118 ➔ 129). 한국 경도를 -231로 시프트하여 태평양이 중심에 위치하게 함
        return { pol, pod: [pod[0], pod[1] - 360], isCrossDateLine: true };
      }
    }
    return { pol, pod, isCrossDateLine: false };
  };

  // 실시간 지도 동적 로딩, 진행률 애니메이션 및 그리기 훅
  const [mapLoaded, setMapLoaded] = React.useState(false);
  const [animatedProgress, setAnimatedProgress] = React.useState<number | null>(null);

  const mapInstanceRef = React.useRef<any>(null);
  const shipMarkerRef = React.useRef<any>(null);

  // 1. 진행률 가상 애니메이션 제어 (최초 40%~80% 랜덤, 5초마다 0.1%~0.5%씩 증가)
  useEffect(() => {
    if (!isMapOpen || !trackingData) {
      setAnimatedProgress(null);
      return;
    }

    // 초기 값 설정
    const startVal = 40 + Math.random() * 40; // 40% ~ 80%
    setAnimatedProgress(startVal);

    const interval = setInterval(() => {
      setAnimatedProgress((prev) => {
        if (prev === null) return null;
        if (prev >= 100) return 100;
        const increment = 0.1 + Math.random() * 0.4; // 0.1% ~ 0.5%
        return Math.min(100, prev + increment);
      });
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, [isMapOpen, trackingData?.bl_number]);

  // 2. Leaflet 라이브러리 CDN 로딩
  React.useEffect(() => {
    if (!isMapOpen || mapLoaded) return;

    // Load Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    // Load Leaflet JS
    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => {
      setMapLoaded(true);
    };
    document.body.appendChild(script);
  }, [isMapOpen, mapLoaded]);

  // 3. 맵 및 마일스톤 노선 레이어 그리기 (최초 1회 - 진행률 변경에 영향받지 않음)
  React.useEffect(() => {
    if (!isMapOpen || !mapLoaded || !trackingData) return;

    // Check if the DOM container actually exists
    const container = document.getElementById("simulated-map");
    if (!container) {
      console.warn("Map container element not found in DOM");
      return;
    }

    const L = (window as any).L;
    if (!L) return;

    // 기존 맵 인스턴스 소거
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (err) {
        console.error("Error removing old map instance:", err);
      }
      mapInstanceRef.current = null;
      shipMarkerRef.current = null;
    }

    // 날짜변경선 보강된 좌표 획득 (태평양 중심 배치 지원)
    const { pol: polCoord, pod: podCoord } = getAdjustedCoords(trackingData.pol, trackingData.pod);

    // 맵 객체 생성 (사용자 줌, 스크롤, 드래그 차단)
    const map = L.map("simulated-map", {
      zoomControl: false,       // 줌 컨트롤 버튼 제거
      dragging: false,          // 마우스 드래그 잠금
      scrollWheelZoom: false,   // 마우스 휠 줌 잠금
      doubleClickZoom: false,   // 더블 클릭 줌 잠금
      boxZoom: false,           // 박스 줌 잠금
      keyboard: false,          // 키보드 네비게이션 잠금
      touchZoom: false,         // 모바일 터치 줌 잠금
      attributionControl: true
    }).setView([(polCoord[0] + podCoord[0]) / 2, (polCoord[1] + podCoord[1]) / 2], 3);
    mapInstanceRef.current = map;

    // 프리미엄 다크 테마 타일 레이어 적용
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      maxZoom: 20
    }).addTo(map);

    // 항만 아이콘 커스텀
    const portIcon = (name: string) => L.divIcon({
      html: `<div style="display: flex; flex-direction: column; align-items: center;">
        <div style="font-size: 20px;">📍</div>
        <div style="background: rgba(15, 23, 42, 0.9); color: white; font-weight: bold; font-size: 9px; padding: 2px 5px; border-radius: 4px; border: 1px solid #3b82f6; white-space: nowrap; margin-top: -4px; box-shadow: 0 1px 3px rgba(0,0,0,0.3);">${name}</div>
      </div>`,
      className: "custom-port-icon",
      iconSize: [60, 40],
      iconAnchor: [9, 10]
    });

    // POL 및 POD 마커 배치
    L.marker(polCoord, { icon: portIcon(trackingData.pol.split(',')[0]) }).addTo(map);
    L.marker(podCoord, { icon: portIcon(trackingData.pod.split(',')[0]) }).addTo(map);

    // 경로선 그리기 (태평양 중심 연속 노선 그리기)
    L.polyline([polCoord, podCoord], {
      color: "#3b82f6",
      weight: 3,
      dashArray: "5, 10",
      opacity: 0.8
    }).addTo(map);

    // 줌 경계 자동 조정
    const bounds = L.latLngBounds([polCoord, podCoord]);
    map.fitBounds(bounds, { padding: [50, 50] });

    return () => {
      // 맵 정리
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch (err) {
          console.error("Clean up error:", err);
        }
        mapInstanceRef.current = null;
        shipMarkerRef.current = null;
      }
    };
  }, [isMapOpen, mapLoaded, trackingData?.bl_number]);

  // 4. 선박 진행률 업데이트 감지 시 마커 위치 슬라이딩 이동 (화면 깜빡임 없음)
  React.useEffect(() => {
    if (!isMapOpen || !mapInstanceRef.current || !trackingData || animatedProgress === null) return;

    const L = (window as any).L;
    if (!L) return;

    // 날짜변경선 보강된 좌표 획득 (경위도 계산 연속성 유지)
    const { pol: polCoord, pod: podCoord } = getAdjustedCoords(trackingData.pol, trackingData.pod);

    // 가상 좌표 계산 (태평양 중심 경도 기준 일관 보간)
    const currentLat = polCoord[0] + (podCoord[0] - polCoord[0]) * (animatedProgress / 100);
    const currentLng = polCoord[1] + (podCoord[1] - polCoord[1]) * (animatedProgress / 100);

    const popupHtml = `
      <div style="font-size:11px; font-family:sans-serif; padding:2px; line-height:1.6;">
        <strong style="color:#2563eb; font-size:12px;">🚢 ${trackingData.vessel_name}</strong><br/>
        <b>현재 속도:</b> 16.2 Knots<br/>
        <b>항해 진행률:</b> ${animatedProgress.toFixed(1)}%<br/>
        <b>상태:</b> ${animatedProgress >= 100 ? "입항 완료" : "운항 중"}
      </div>
    `;

    // 배의 진행 방향에 따라 이모지 좌우 반전 제어 (이모지는 기본적으로 왼쪽을 향하므로 동쪽 항해 시 우측 반전)
    const isHeadingEast = podCoord[1] > polCoord[1];

    if (!shipMarkerRef.current) {
      // 선박 아이콘 커스텀 (Tailwind animate-bounce의 transform translateY 덮어쓰기 방지를 위해 내부 div에서 좌우 반전 처리)
      const shipIcon = L.divIcon({
        html: `<div class="animate-bounce">
          <div style="font-size: 26px; display: inline-block; transform: scaleX(${isHeadingEast ? -1 : 1}); filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">🚢</div>
        </div>`,
        className: "custom-ship-icon",
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      // 마커 신규 생성 및 바인딩
      const marker = L.marker([currentLat, currentLng], { icon: shipIcon }).addTo(mapInstanceRef.current);
      shipMarkerRef.current = marker;
      marker.bindPopup(popupHtml).openPopup();
    } else {
      // 마커 좌표 이동
      shipMarkerRef.current.setLatLng([currentLat, currentLng]);
      // 팝업 내용 업데이트
      shipMarkerRef.current.getPopup().setContent(popupHtml);
    }
  }, [animatedProgress, isMapOpen, trackingData?.bl_number]);



  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (blInput.trim()) {
      setIsMapOpen(false);
      fetchTracking(blInput.trim());
    }
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingData) return;
    if (!invoiceFile || !packingFile) {
      alert("상업송장(Invoice)과 패킹리스트(Packing List) 파일을 모두 첨부해 주세요.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("blNumber", trackingData.bl_number);
    formData.append("invoice", invoiceFile);
    formData.append("packingList", packingFile);

    try {
      const res = await axios.post("http://localhost:5000/api/tracking/upload-docs", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        withCredentials: true
      });
      if (res.data.success) {
        alert(res.data.message);
        // 상태 새로고침
        fetchTracking(trackingData.bl_number);
        fetchAllShipments();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "파일 업로드 처리 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleExteriorUploadSubmit = async () => {
    if (!trackingData || !exteriorFiles || exteriorFiles.length === 0) {
      alert("업로드할 차량 외관 사진을 선택해주세요.");
      return;
    }
    setUploadingExterior(true);
    const formData = new FormData();
    formData.append("shipmentId", trackingData.id?.toString() || trackingData.bl_number);
    formData.append("skipOcr", "true");
    formData.append("blNumber", trackingData.bl_number);
    formData.append("photoType", "exterior");

    Array.from(exteriorFiles).slice(0, 30).forEach(file => {
      formData.append("photos", file);
    });

    try {
      const response = await fetch("http://localhost:5000/api/files/upload-vehicle-photos", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        alert(`차량 외관 사진 전송 완료! 총 ${data.data.length}장의 사진이 처리되었습니다.`);
        setExteriorFiles(null);
      } else {
        alert("사진 업로드 실패: " + data.message);
      }
    } catch (error) {
      alert("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setUploadingExterior(false);
    }
  };

  const handleDocUploadSubmit = async () => {
    if (!trackingData || !docFiles || docFiles.length === 0) {
      alert("업로드할 차대번호/말소증 사진을 선택해주세요.");
      return;
    }
    setUploadingDocs(true);
    const formData = new FormData();
    formData.append("shipmentId", trackingData.id?.toString() || trackingData.bl_number);
    formData.append("skipOcr", "true");
    formData.append("blNumber", trackingData.bl_number);
    formData.append("photoType", "docs");

    Array.from(docFiles).slice(0, 20).forEach(file => {
      formData.append("photos", file);
    });

    try {
      const response = await fetch("http://localhost:5000/api/files/upload-vehicle-photos", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        alert(`차대번호/말소증 서류 전송 완료! 총 ${data.data.length}장의 사진이 AI 분석 처리되었습니다.`);
        setDocFiles(null);
      } else {
        alert("서류 업로드 실패: " + data.message);
      }
    } catch (error) {
      alert("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setUploadingDocs(false);
    }
  };



  return (
    <div className="animate-fade-in-up space-y-8">
      {/* B/L Selection & Search Control Panel */}
      <div className="bg-white rounded-2xl shadow-sm border p-8">
        <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 mb-2">
          <Search className="text-blue-600" />
          내 화물 B/L 트래킹
        </h2>
        <p className="text-xs text-slate-400 mb-6">
          진행 중이거나 완료된 B/L 선적 건을 선택하여 트래킹 상태를 모니터링할 수 있습니다.
        </p>

        <div className="flex flex-col gap-4 max-w-xl">
          {/* 진행 / 완료 라디오 버튼 */}
          <div className="flex items-center gap-6 bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl w-fit">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
              <input
                type="radio"
                name="statusFilter"
                checked={statusFilter === 'in-progress'}
                onChange={() => setStatusFilter('in-progress')}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              진행 중 화물
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-xs font-black text-slate-700">
              <input
                type="radio"
                name="statusFilter"
                checked={statusFilter === 'completed'}
                onChange={() => setStatusFilter('completed')}
                className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
              />
              완료된 화물
            </label>
          </div>

          {/* B/L 드롭다운 선택기 */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-500">선적 B/L 선택 (최근 일자 순)</label>
            <select
              value={trackingData?.bl_number || ""}
              onChange={(e) => {
                if (e.target.value) {
                  setIsMapOpen(false);
                  fetchTracking(e.target.value);
                  setBlInput(e.target.value);
                }
              }}
              className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white text-slate-800 shadow-sm transition font-mono font-bold"
            >
              {filteredShipments.length === 0 ? (
                <option value="">조회된 B/L 번호가 없습니다.</option>
              ) : (
                filteredShipments.map(s => (
                  <option key={s.bl_number} value={s.bl_number}>
                    {s.bl_number} ({s.vessel_name || '선명 미정'} - ETD: {s.etd || '미정'})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        {error && (
          <p className="text-red-500 mt-4 text-sm font-semibold">{error}</p>
        )}
      </div>

      {/* Tracking Result Section */}
      {trackingData && (
        <div className="bg-white rounded-2xl shadow-sm border p-8">
          <div className="flex justify-between items-start mb-6 pb-6 border-b border-slate-100">
            <div>
              <h3 className="text-3xl font-black mb-2 text-slate-800">
                {trackingData.bl_number}
              </h3>
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold ${trackingData.status === "Delivered" ? "bg-slate-100 text-slate-700" : "bg-green-100 text-green-700"
                  }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${trackingData.status === "Delivered" ? "bg-slate-500" : "bg-green-500"
                    }`}
                ></span>
                {trackingData.status}
              </span>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 justify-end text-slate-600 mb-1">
                <Ship size={18} />
                <span className="font-semibold text-lg">
                  {trackingData.vessel_name}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                마지막 업데이트:{" "}
                {new Date(trackingData.last_updated).toLocaleString()}
              </p>
            </div>
          </div>

          {/* 가로형 Stepper UI */}
          <style>{`
            @keyframes wiggle-x {
              0%, 100% { transform: translateX(0); }
              25% { transform: translateX(-3px); }
              75% { transform: translateX(3px); }
            }
            .animate-wiggle {
              animation: wiggle-x 0.5s ease-in-out infinite;
            }
          `}</style>
          <div className="flex items-start justify-between w-full my-10 overflow-x-auto py-4 scrollbar-thin">
            {STEPS.map((step, idx) => {
              const isCompleted = activeIdx > idx;
              const isActive = activeIdx === idx;
              const isPending = activeIdx < idx;
              const isWaitingVerify = activeIdx === 1 && idx === 1;

              return (
                <React.Fragment key={step.key}>
                  <div className="flex flex-col items-center flex-1 min-w-[75px] text-center px-1">
                    {/* 상단 배지 영역 고정 높이 (h-6) 로 일관된 원형 세로 위치 보장 */}
                    <div className="h-6 flex items-center justify-center mb-1.5 w-full">
                      {/* 마감일 배지: 서류 업로드 단계 */}
                      {step.key === "Pending Documents" && trackingData?.doc_closing_date && (() => {
                        const deadline = new Date(trackingData.doc_closing_date);
                        const diffDays = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
                        const isUrgent = diffDays >= 0 && diffDays <= 1 && !isCompleted;
                        const isWarn = diffDays > 1 && diffDays <= 3;
                        const formattedDate = `${deadline.getMonth() + 1}/${deadline.getDate()}`;
                        return (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap flex flex-row items-center gap-0.5 justify-center mx-auto
                            ${diffDays < 0 ? 'bg-red-100 text-red-600' : isUrgent ? 'bg-red-100 text-red-600 animate-wiggle' : isWarn ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                            {(isUrgent || diffDays < 0) && <AlertTriangle size={8} className="shrink-0" />}
                            <span>서류마감: {formattedDate}</span>
                          </span>
                        );
                      })()}
                      {/* 마감일 배지: CY 입고 단계 */}
                      {step.key === "Gate In" && trackingData?.cargo_closing_date && (() => {
                        const deadline = new Date(trackingData.cargo_closing_date);
                        const diffDays = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
                        const isUrgent = diffDays >= 0 && diffDays <= 1 && !isCompleted;
                        const isWarn = diffDays > 1 && diffDays <= 3;
                        const formattedDate = `${deadline.getMonth() + 1}/${deadline.getDate()}`;
                        return (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full whitespace-nowrap flex flex-row items-center gap-0.5 justify-center mx-auto
                            ${diffDays < 0 ? 'bg-red-100 text-red-600' : isUrgent ? 'bg-red-100 text-red-600 animate-wiggle' : isWarn ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                            {(isUrgent || diffDays < 0) && <AlertTriangle size={8} className="shrink-0" />}
                            <span>cy입고마감: {formattedDate}</span>
                          </span>
                        );
                      })()}
                      {/* 출항 예정일 배지: 출항 단계 */}
                      {step.key === "Departed" && trackingData?.etd && (
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100 whitespace-nowrap flex flex-row items-center gap-0.5 justify-center mx-auto">
                          <span>ETD: {trackingData.etd.substring(5, 10).replace('-', '/')}</span>
                        </span>
                      )}
                    </div>
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition shadow-sm ${isCompleted
                          ? "bg-green-500 text-white"
                          : isWaitingVerify
                            ? "bg-amber-500 text-white animate-pulse"
                            : isActive
                              ? "bg-blue-600 text-white ring-4 ring-blue-100"
                              : "bg-slate-100 text-slate-400"
                        }`}
                    >
                      {isCompleted ? <CheckCircle2 size={18} /> : idx + 1}
                    </div>
                    <span
                      className={`text-xs font-bold mt-2 whitespace-nowrap ${isWaitingVerify
                          ? "text-amber-500"
                          : isActive
                            ? "text-blue-600"
                            : isCompleted
                              ? "text-green-600"
                              : "text-slate-400"
                        }`}
                    >
                      {step.label}
                    </span>
                    {isWaitingVerify && (
                      <span className="text-[9px] text-amber-500 font-bold mt-0.5">검증 대기</span>
                    )}
                    {step.key === "Trucking" && trackingData?.vehicleStats && trackingData.vehicleStats.total > 0 && (
                      <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold mt-1 bg-blue-50 dark:bg-slate-800 border border-blue-200 dark:border-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
                        반입: {trackingData.vehicleStats.yardInCount} / {trackingData.vehicleStats.total}대
                      </span>
                    )}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="flex-1 min-w-[20px] flex items-center self-start pt-[44px]">
                      <div className={`h-0.5 w-full mx-2 ${activeIdx > idx + 0.5 ? "bg-green-500" : "bg-slate-200"}`} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* 실시간 위치 지도 (AIS 연동) */}
          {trackingData && isMapOpen && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8 space-y-4 animate-fade-in-up">
              <div className="flex justify-between items-center border-b pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                    <Ship size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      실시간 선박 위치 추적 (AIS 시뮬레이션)
                      <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.5 rounded font-black animate-pulse">
                        LIVE
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400">
                      선명: {trackingData.vessel_name} (GPS 연동형 가상 좌표 보간)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsMapOpen(false)}
                  className="text-xs font-bold text-slate-400 hover:text-slate-600 border border-slate-200 px-2 py-1 rounded-lg hover:bg-slate-50 transition"
                >
                  지도 닫기
                </button>
              </div>

              {/* Leaflet 맵 타겟 컨테이너 (BL 번호별 고유 key를 부여하여 DOM 재사용으로 인한 Leaflet 충돌 방지) */}
              <div
                id="simulated-map"
                key={trackingData.bl_number}
                className="w-full h-[400px] rounded-xl border border-slate-100 relative"
                style={{ zIndex: 0 }}
              />

              <div className="flex items-center gap-2 bg-slate-50 p-3 rounded-xl text-slate-500 text-[11px] leading-relaxed">
                <span className="text-blue-500 font-bold text-xs">ℹ️</span>
                <span>
                  출발지와 도착지 좌표를 기반으로 선박의 스케줄(ETD ➔ ETA) 진행률을 실시간 계산하여, CartoDB Dark Matter 위성 지도 위에 현재 선박의 예상 위치를 보간해 출력합니다.
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-8 mb-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                출발 (POL)
              </p>
              <p className="text-lg font-bold flex items-center gap-2 mb-1 text-slate-800">
                <MapPin size={18} className="text-blue-600" />
                {trackingData.pol}
              </p>
              <p className="text-slate-500 flex items-center gap-2 text-sm">
                <Calendar size={16} /> ETD: {trackingData.etd}
              </p>
            </div>
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                도착 (POD)
              </p>
              <p className="text-lg font-bold flex items-center gap-2 mb-1 text-slate-800">
                <MapPin size={18} className="text-red-500" />
                {trackingData.pod}
              </p>
              <p className="text-slate-500 flex items-center gap-2 text-sm">
                <Calendar size={16} /> ETA: {trackingData.eta}
              </p>
            </div>
          </div>

          {/* 서류 마감 및 업로드 패널 (Pending Documents 상태인 경우에만 렌더링) */}
          {trackingData.status === "Pending Documents" && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-6">
              <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                <FileUp className="text-blue-600" size={18} /> 선적 서류 업로드 (마감 전 필수 제출)
              </h4>
              <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                출발 전 선사 적하목록 신고를 위해 상업송장(Invoice) 및 패킹리스트(Packing List) 파일을 업로드해 주십시오.<br />
                서류 마감일시: <span className="text-red-600 font-bold">
                  {trackingData.doc_closing_date ? new Date(trackingData.doc_closing_date).toLocaleString("ko-KR") : "-"}
                </span>
              </p>

              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-white rounded-xl border">
                    <label className="block text-xs font-bold text-slate-600 mb-2">상업송장 (Commercial Invoice)</label>
                    <input
                      type="file"
                      accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      onChange={(e) => setInvoiceFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <div className="p-4 bg-white rounded-xl border">
                    <label className="block text-xs font-bold text-slate-600 mb-2">패킹리스트 (Packing List)</label>
                    <input
                      type="file"
                      accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
                      className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      onChange={(e) => setPackingFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={uploading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-lg text-xs transition shadow-sm disabled:opacity-50"
                >
                  {uploading ? "업로드 중..." : "서류 업로드 완료하기"}
                </button>
              </form>
            </div>
          )}

          {/* 차량 사진 및 서류 업로드 패널 (선택) */}
          {(trackingData.status === "Pending Documents" || trackingData.status === "Documents Uploaded") && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-6 space-y-6">
              <div>
                <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                  <Camera className="text-blue-600" size={18} /> 1. 차량 사진 업로드 (외관/데미지)
                </h4>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  선적할 중고차량들의 외관 및 상태 사진들(또는 압축된 ZIP 파일)을 등록해 주세요.
                </p>
                <div className="flex items-center gap-4 bg-white p-4 rounded-xl border">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.zip"
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    onChange={(e) => setExteriorFiles(e.target.files)}
                  />
                  <button
                    onClick={handleExteriorUploadSubmit}
                    disabled={uploadingExterior || !exteriorFiles || exteriorFiles.length === 0}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 py-2.5 rounded-lg text-xs transition shadow-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {uploadingExterior ? "업로드 중..." : "외관 사진 전송"}
                  </button>
                </div>
              </div>

              <div className="border-t pt-6">
                <h4 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2">
                  <FileText className="text-emerald-600" size={18} /> 2. 차대번호 각인 및 말소증 업로드 (OCR 분석용)
                </h4>
                <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                  차량의 차대번호 스티커/각인 사진과 말소사실증명서 사진을 등록해 주세요. 시스템이 차대번호를 AI 분석합니다.
                </p>
                <div className="flex items-center gap-4 bg-white p-4 rounded-xl border">
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    className="w-full text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                    onChange={(e) => setDocFiles(e.target.files)}
                  />
                  <button
                    onClick={handleDocUploadSubmit}
                    disabled={uploadingDocs || !docFiles || docFiles.length === 0}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-lg text-xs transition shadow-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {uploadingDocs ? "분석 및 전송 중..." : "서류/차대 사진 전송"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 제출된 서류 보기 다운로드 패널 */}
          {trackingData.invoice_file_path && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mt-6">
              <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                <FileText className="text-slate-500" size={18} /> 제출된 선적 서류 내역
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase">Commercial Invoice</p>
                    <p className="text-slate-700 text-xs font-semibold mt-0.5">상업 송장</p>
                  </div>
                  <a
                    href={`http://localhost:5000${trackingData.invoice_file_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1 border border-blue-100 bg-blue-50 px-3 py-1.5 rounded-lg transition"
                  >
                    서류 보기
                  </a>
                </div>

                <div className="bg-white p-4 rounded-xl border flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-400 font-bold uppercase">Packing List</p>
                    <p className="text-slate-700 text-xs font-semibold mt-0.5">포장 명세서</p>
                  </div>
                  <a
                    href={`http://localhost:5000${trackingData.packing_list_file_path}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1 border border-blue-100 bg-blue-50 px-3 py-1.5 rounded-lg transition"
                  >
                    서류 보기
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* 트럭 배정 내역 카드 (배정일자가 세팅된 경우) */}
          {trackingData.truck_date && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-6 mt-6">
              <h4 className="font-bold text-blue-800 text-sm mb-3 flex items-center gap-1.5">
                <Truck size={18} /> 내륙 트럭 운송 배정 정보
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="bg-white p-4 rounded-xl border border-blue-50">
                  <span className="text-xs text-slate-400 block font-bold">운송 기사 방문일</span>
                  <span className="font-bold text-slate-800 text-base mt-1 block">
                    {new Date(trackingData.truck_date).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-blue-50">
                  <span className="text-xs text-slate-400 block font-bold">배정 차량 번호</span>
                  <span className="font-bold text-slate-800 text-base mt-1 block">
                    {trackingData.truck_plate_number || "배정 기사 배기 대기 중"}
                  </span>
                </div>
                <div className="bg-white p-4 rounded-xl border border-blue-50">
                  <span className="text-xs text-slate-400 block font-bold">기사님 연락처</span>
                  <span className="font-bold text-slate-800 text-base mt-1 block font-mono">
                    {trackingData.truck_driver_phone || "배정 중"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Shipments Table Section */}
      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Ship className="text-blue-600" />
            완료된 내 화물 목록
          </h3>
        </div>
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left border-collapse relative">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100 sticky top-0 shadow-sm z-10">
              <tr>
                <th className="p-4 font-bold">B/L 번호</th>
                <th className="p-4 font-bold">선박명</th>
                <th className="p-4 font-bold">상태</th>
                <th className="p-4 font-bold">구간 (POL ➔ POD)</th>
                <th className="p-4 font-bold">ETA</th>
                <th className="p-4 font-bold text-right">청구 금액</th>
                <th className="p-4 font-bold text-center">결제상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shipments
                .filter((s: any) => s.status === "Delivered")
                .map((shipment: any, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-blue-50 transition cursor-pointer"
                    onClick={() => fetchTracking(shipment.bl_number)}
                  >
                    <td className="p-4 font-bold text-blue-600">
                      {shipment.bl_number}
                    </td>
                    <td className="p-4 text-slate-800 font-medium">
                      {shipment.vessel_name}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${shipment.status === "Delivered" ? "bg-slate-100 text-slate-700" : "bg-blue-100 text-blue-700"
                          }`}
                      >
                        {shipment.status}
                      </span>
                    </td>
                    <td className="p-4 text-slate-600 text-sm">
                      {shipment.pol.split(",")[0]} ➔ {shipment.pod.split(",")[0]}
                    </td>
                    <td className="p-4 text-slate-800 text-sm">
                      {shipment.eta}
                    </td>
                    <td className="p-4 text-sm font-semibold text-right text-red-600">
                      ${Number(shipment.invoice_amount).toLocaleString()}
                    </td>
                    <td className="p-4 text-center">
                      {shipment.is_paid ? (
                        <span className="text-green-600 text-xs font-bold bg-green-50 px-2 py-1 rounded border border-green-200">
                          완료
                        </span>
                      ) : (
                        <span className="text-red-500 text-xs font-bold bg-red-50 px-2 py-1 rounded border border-red-200">
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
  );
}
