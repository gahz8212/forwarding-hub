import { API_BASE_URL } from '../api/axios';
import api from '../api/axios';
import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { X, Camera, Search, CheckCircle, Truck, Ship, AlertTriangle, Upload, FileImage, Loader2, Send, GripHorizontal, ChevronLeft, ChevronRight, Save, Trash2, BellRing, CreditCard, Clock, Warehouse, Globe, Coins, Sparkles, AlertCircle, RefreshCw } from "lucide-react";
import BuyerInfoModal from './BuyerInfoModal';
import PendingDocsModal from './PendingDocsModal';

interface Vehicle {
  id: number;
  vin: string;
  make: string;
  model: string;
  year: number;
  drivability: string;
  status: string;
  condition_photo_urls: string[];
  deregistration_photo_urls: string[];
  vin_photo_urls: string[];
  customs_cleared: boolean;
  buyer?: string;
  price?: number;
  plate_number?: string;
  vehicle_type?: string;
  mileage?: string;
  initial_registration_date?: string;
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  cbm?: number;
}

interface ViewerState {
  isOpen: boolean;
  vehicleId: number;
  photos: string[];
  currentIndex: number;
}

const VEHICLE_STAGES = [
  { value: "Pending", label: "대기중", icon: Clock, activeColor: "text-slate-650 bg-slate-100 border-slate-300 dark:bg-slate-900 dark:text-slate-350 dark:border-slate-800" },
  { value: "Trucking", label: "운송중", icon: Truck, activeColor: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800" },
  { value: "Yard In", label: "야드반입", icon: Warehouse, activeColor: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800" },
  { value: "Loaded", label: "선적완료", icon: Ship, activeColor: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800" }
];

interface Props {
  shipment: any;
  onClose: () => void;
  onOpenDraftGenerator?: (shipment: any) => void;
}

const formatDateToSlash = (val?: string) => {
  if (!val) return "";
  const dateOnly = val.includes('T') ? val.split('T')[0] : val;
  return dateOnly.replace(/-/g, '/');
};

export default function VehicleDashboardModal({ shipment, onClose, onOpenDraftGenerator }: Props) {
  if (!shipment) return null;
  const shipmentId = shipment.id;
  const blNumber = shipment.bl_number;

  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [globalPhotoTab, setGlobalPhotoTab] = useState<'plate' | 'document' | 'vin'>('plate');
  const [unclassifiedPhotos, setUnclassifiedPhotos] = useState<string[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<string[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showBuyerModal, setShowBuyerModal] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [buyerInfo, setBuyerInfo] = useState({ name: '', address: '', phone: '', email: '' });
  const [uploading, setUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [vinLoadingId, setVinLoadingId] = useState<number | null>(null);
  const [expandedVehicles, setExpandedVehicles] = useState<Record<number, boolean>>({});
  const [globalBuyer, setGlobalBuyer] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fastFileInputRef = useRef<HTMLInputElement>(null);
  const [showUnclassifiedDrawer, setShowUnclassifiedDrawer] = useState(false);
  const [focusedPriceId, setFocusedPriceId] = useState<number | null>(null);

  // 선택삭제 상태
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);

  // Draft 인라인 폼 상태
  const [isDraftOpen, setIsDraftOpen] = useState(false);
  const [draftClients, setDraftClients] = useState<any[]>([]);
  const [draftClientId, setDraftClientId] = useState("");
  const [draftInvoiceNo, setDraftInvoiceNo] = useState("");
  const [draftDueDate, setDraftDueDate] = useState("");
  const [draftExchangeRate, setDraftExchangeRate] = useState("1350");
  const [draftCalcResult, setDraftCalcResult] = useState<any>(null);
  const [draftCalculating, setDraftCalculating] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [draftError, setDraftError] = useState("");

  const [viewerState, setViewerState] = useState<ViewerState>({
    isOpen: false,
    vehicleId: 0,
    photos: [],
    currentIndex: 0
  });

  // Floating Viewer Drag logic (Ref-based for 60fps zero-lag performance)
  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerPos = useRef({ x: 0, y: 0 });
  const [isDraggingViewer, setIsDraggingViewer] = useState(false);
  const viewerDragStart = useRef({ x: 0, y: 0 });
  const viewerStartPos = useRef({ x: 0, y: 0 });


  const handleViewerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingViewer(true);
    viewerDragStart.current = { x: e.clientX, y: e.clientY };
    viewerStartPos.current = { x: viewerPos.current.x, y: viewerPos.current.y };
  };

  // Floating Unclassified Drawer Drag logic
  const unclassifiedRef = useRef<HTMLDivElement>(null);
  const unclassifiedPos = useRef({ x: 0, y: 0 });
  const [isDraggingUnclassified, setIsDraggingUnclassified] = useState(false);
  const unclassifiedDragStart = useRef({ x: 0, y: 0 });
  const unclassifiedStartPos = useRef({ x: 0, y: 0 });

  const handleUnclassifiedMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDraggingUnclassified(true);
    unclassifiedDragStart.current = { x: e.clientX, y: e.clientY };
    unclassifiedStartPos.current = { x: unclassifiedPos.current.x, y: unclassifiedPos.current.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingViewer && !isDraggingUnclassified) return;

      if (isDraggingViewer) {
        const dx = e.clientX - viewerDragStart.current.x;
        const dy = e.clientY - viewerDragStart.current.y;
        const newX = viewerStartPos.current.x + dx;
        const newY = viewerStartPos.current.y + dy;
        viewerPos.current = { x: newX, y: newY };
        if (viewerRef.current) {
          viewerRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
        }
      }

      if (isDraggingUnclassified) {
        const dx = e.clientX - unclassifiedDragStart.current.x;
        const dy = e.clientY - unclassifiedDragStart.current.y;
        const newX = unclassifiedStartPos.current.x + dx;
        const newY = unclassifiedStartPos.current.y + dy;
        unclassifiedPos.current = { x: newX, y: newY };
        if (unclassifiedRef.current) {
          unclassifiedRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingViewer(false);
      setIsDraggingUnclassified(false);
    };

    if (isDraggingViewer || isDraggingUnclassified) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingViewer, isDraggingUnclassified]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, skipOcr: boolean = false, photoType: 'docs' | 'exterior' = 'exterior') => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("shipmentId", shipmentId.toString());
    formData.append("blNumber", blNumber);
    formData.append("isForwarder", "true");
    formData.append("photoType", photoType);
    if (skipOcr) {
      formData.append("skipOcr", "true");
    }

    Array.from(files).slice(0, 50).forEach(file => {
      formData.append("photos", file);
    });

    try {
      const response = await fetch(`${API_BASE_URL}` + "/api/files/upload-vehicle-photos", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        const ocrResults = data.data; // Backend processedResults

        const newVehiclesMap = new Map<string, Vehicle>();
        const newUnclassified: string[] = [];
        const newPendingDocs: string[] = [];
        let hasDuplicate = false;

        // 프론트엔드 File 객체 목록 (인덱스 매칭용)
        const fileArray = Array.from(files);

        ocrResults.forEach((res: any, index: number) => {
          if (res.status === 'duplicate') {
            hasDuplicate = true;
            // 중복 파일은 프론트엔드 목록에 절대 추가하지 않음
            return;
          }
          // 백엔드에서 한글 파일명이 깨질 수 있으므로, 파일명 매칭 대신 업로드 순서(index)로 매칭합니다.
          const file = fileArray[index];
          const localUrl = file ? URL.createObjectURL(file) : "";
          const serverUrl = res.extracted?.serverUrl || localUrl;

          if (res.status === 'success' && res.extracted?.vin) {
            const vin = res.extracted.vin;
            const existingVeh = newVehiclesMap.get(vin) || {
              id: res.extracted.id || Math.floor(Math.random() * 1000000),
              vin: vin,
              make: res.extracted.make || "Unknown",
              model: res.extracted.model || "Unknown",
              year: res.extracted.year || new Date().getFullYear(),
              drivability: "",
              status: "Yard In",
              condition_photo_urls: [] as string[],
              deregistration_photo_urls: [] as string[],
              vin_photo_urls: [] as string[],
              customs_cleared: false,
              buyer: "",
              price: 0,
              plate_number: "",
              mileage: "",
              initial_registration_date: "",
              vehicle_type: ""
            };

            if (res.extracted.type === 'document') {
              if (serverUrl && !existingVeh.deregistration_photo_urls.includes(serverUrl)) {
                existingVeh.deregistration_photo_urls.push(serverUrl);
              }
            } else if (res.extracted.type === 'vin') {
              if (serverUrl && !existingVeh.vin_photo_urls.includes(serverUrl)) {
                existingVeh.vin_photo_urls.push(serverUrl);
              }
            } else {
              if (serverUrl && !existingVeh.condition_photo_urls.includes(serverUrl)) {
                existingVeh.condition_photo_urls.push(serverUrl);
              }
            }

            // 문서 사진에서 추출된 추가 제원 정보 병합
            if (res.extracted.makeModel || res.extracted.make) existingVeh.make = res.extracted.makeModel || res.extracted.make;
            if (res.extracted.model) existingVeh.model = res.extracted.model;
            if (res.extracted.modelYear || res.extracted.year) existingVeh.year = res.extracted.modelYear || res.extracted.year;
            if (res.extracted.plateNumber) existingVeh.plate_number = res.extracted.plateNumber;
            if (res.extracted.vehicleType) existingVeh.vehicle_type = res.extracted.vehicleType;
            if (res.extracted.mileage) existingVeh.mileage = res.extracted.mileage;
            if (res.extracted.initialRegistrationDate) existingVeh.initial_registration_date = res.extracted.initialRegistrationDate;

            newVehiclesMap.set(vin, existingVeh);
          } else {
            // 차대번호를 못 찾았거나 중복/오류인 사진
            if (serverUrl) {
              if (photoType === 'docs') {
                newPendingDocs.push(serverUrl);
              } else {
                newUnclassified.push(serverUrl);
              }
            }
          }
        });

        // 기존 차량 목록에 새로 인식된 차량 추가 및 병합
        setVehicles(prev => {
          const combined = [...prev];
          newVehiclesMap.forEach((newVeh, vin) => {
            const existingIdx = combined.findIndex(v => v.vin === vin);
            if (existingIdx === -1) {
              combined.push(newVeh);
            } else {
              // 기존에 화면에 떠있는 차량이라도 새로 추출된 정보(plate_number 등)가 있다면 덮어쓰기 병합
              const oldVeh = combined[existingIdx];
              combined[existingIdx] = {
                ...oldVeh,
                make: newVeh.make !== 'Unknown' ? newVeh.make : oldVeh.make,
                model: newVeh.model !== 'Unknown' ? newVeh.model : oldVeh.model,
                year: newVeh.year !== new Date().getFullYear() ? newVeh.year : oldVeh.year,
                plate_number: newVeh.plate_number || oldVeh.plate_number,
                vehicle_type: newVeh.vehicle_type || oldVeh.vehicle_type,
                mileage: newVeh.mileage || oldVeh.mileage,
                initial_registration_date: newVeh.initial_registration_date || oldVeh.initial_registration_date,
                condition_photo_urls: Array.from(new Set([...(oldVeh.condition_photo_urls || []), ...(newVeh.condition_photo_urls || [])])),
                deregistration_photo_urls: Array.from(new Set([...(oldVeh.deregistration_photo_urls || []), ...(newVeh.deregistration_photo_urls || [])])),
                vin_photo_urls: Array.from(new Set([...(oldVeh.vin_photo_urls || []), ...(newVeh.vin_photo_urls || [])]))
              };
            }
          });
          return combined;
        });

        setUnclassifiedPhotos(prev => Array.from(new Set([...prev, ...newUnclassified])));
        setPendingPhotos(prev => Array.from(new Set([...prev, ...newPendingDocs])));

        if (newUnclassified.length > 0) {
          setShowUnclassifiedDrawer(true);
        }
        if (newPendingDocs.length > 0) {
          setShowPendingModal(true);
        }

        // DB에서 최신 제원 포함된 차량 목록 즉시 갱신
        await fetchVehicles();

        if (hasDuplicate) {
          alert("선택한 이미지가 이미 저장되어 있습니다.");
        }

        // 중복 파일 이외에 신규 처리된 사진이 있는 경우에만 처리 결과 알림 출력
        if (newVehiclesMap.size > 0 || newUnclassified.length > 0 || newPendingDocs.length > 0) {
          if (skipOcr) {
            alert(`⚡ 고속 업로드 완료!\n미분류(외관) 사진 ${newUnclassified.length}장이 추가되었습니다.`);
          } else {
            let alertMsg = `🎉 OCR 분석 완료!\n인식된 차량 대수: ${newVehiclesMap.size}대`;
            if (newUnclassified.length > 0) alertMsg += `\n미분류(외관) 사진: ${newUnclassified.length}장`;
            if (newPendingDocs.length > 0) alertMsg += `\n미분류(대기) 서류: ${newPendingDocs.length}장`;
            alert(alertMsg);
          }
        }
      } else {
        alert("업로드 실패: " + data.message);
      }
    } catch (error) {
      console.error("업로드 에러:", error);
      alert("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (fastFileInputRef.current) fastFileInputRef.current.value = "";
    }
  };

  const handleGeneratePDF = async () => {
    setIsSending(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracking/shipments/${shipmentId}/send-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blNumber }),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        alert("✅ 입력된 데이터를 바탕으로 Commercial Invoice 및 Packing List PDF를 생성하여 화주 카카오톡으로 전송했습니다!");
      } else {
        alert("전송 실패: " + data.message);
      }
    } catch (err) {
      console.error("PDF 전송 에러:", err);
      alert("서버와 통신 중 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (id: number, field: keyof Vehicle, value: any) => {
    setVehicles(prev => prev.map(v => {
      if (v.id === id) {
        const updated = { ...v, [field]: value };
        if (['length', 'width', 'height'].includes(String(field))) {
          const l = parseFloat(String(updated.length || 0)) / 1000;
          const w = parseFloat(String(updated.width || 0)) / 1000;
          const h = parseFloat(String(updated.height || 0)) / 1000;
          updated.cbm = Math.round((l * w * h) * 1000) / 1000;
        }
        return updated;
      }
      return v;
    }));
  };

  const toggleVehicleExpand = (id: number) => {
    setExpandedVehicles(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const autoVinLookup = async (id: number, vin: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracking/vehicles/vin/${encodeURIComponent(vin)}`);
      const res = await response.json();
      if (res.success) {
        const { data } = res;
        setVehicles(prev => prev.map(v => v.id === id ? {
          ...v,
          model: data.modelName,
          make: data.make,
          year: data.year,
          initial_registration_date: data.initialRegistrationDate,
          length: data.dimensions.length,
          width: data.dimensions.width,
          height: data.dimensions.height,
          weight: data.weight,
          cbm: data.cbm
        } : v));

        // DB에도 즉시 저장 (새로고침 없이 데이터 유지)
        await fetch(`${API_BASE_URL}/api/tracking/vehicles/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            make: data.make,
            model: data.modelName,
            year: data.year,
            initial_registration_date: data.initialRegistrationDate,
            length: data.dimensions?.length,
            width: data.dimensions?.width,
            height: data.dimensions?.height,
            weight: data.weight,
            cbm: data.cbm
          })
        });
      }
    } catch (err) {
      console.error('자동 차대번호 조회 실패:', vin, err);
    }
  };

  const handleVinLookup = async (id: number, vin: string) => {
    if (!vin || vin.length !== 17) {
      alert('차대번호 17자리를 정확히 입력해주세요.');
      return;
    }
    setVinLoadingId(id);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracking/vehicles/vin/${encodeURIComponent(vin)}`);
      const res = await response.json();
      if (res.success) {
        const { data } = res;
        setVehicles(prev => prev.map(v => v.id === id ? {
          ...v,
          model: data.modelName,
          make: data.make,
          year: data.year,
          initial_registration_date: data.initialRegistrationDate,
          length: data.dimensions.length,
          width: data.dimensions.width,
          height: data.dimensions.height,
          weight: data.weight,
          cbm: data.cbm
        } : v));
      } else {
        alert('차대번호 조회 실패: ' + res.message);
      }
    } catch (err) {
      console.error('차대번호 조회 중 에러:', err);
      alert('차대번호 제원 조회 중 오류가 발생했습니다.');
    } finally {
      setVinLoadingId(null);
    }
  };

  const handleVehicleStatusChange = async (vehicleId: number, newStatus: string, oldStatus: string) => {
    const isOldYard = oldStatus === "Yard In" || oldStatus === "Loaded";
    const isNewNotYard = newStatus === "Pending" || newStatus === "Trucking";

    if (isOldYard && isNewNotYard) {
      const ok = window.confirm("이미 야드반입(또는 선적완료)된 차량입니다. 다시 운송중(또는 대기중) 상태로 변경하시겠습니까? (반입 수량이 차감되며 전체 선적의 진행단계가 트럭운송 단계로 복구될 수 있습니다.)");
      if (!ok) return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/tracking/vehicles/${vehicleId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const res = await response.json();
      if (res.success) {
        // 낙관적 업데이트: loading 없이 해당 차량 상태만 즉시 반영 (번쩍거림 방지)
        setVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, status: newStatus } : v));
      } else {
        alert("상태 변경 실패: " + res.message);
      }
    } catch (err) {
      console.error("차량 상태 변경 에러:", err);
      alert("차량 상태 변경 중 에러가 발생했습니다.");
    }
  };

  // 선택 차량 삭제
  const handleDeleteSelected = async () => {
    if (selectedVehicleIds.length === 0) return;
    const ok = window.confirm(`선택한 ${selectedVehicleIds.length}대의 차량을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`);
    if (!ok) return;
    setIsDeleting(true);
    try {
      await Promise.all(
        selectedVehicleIds.map(id =>
          fetch(`${API_BASE_URL}/api/tracking/vehicles/${id}`, { method: 'DELETE' })
        )
      );
      setSelectedVehicleIds([]);
      fetchVehicles();
    } catch (err) {
      console.error('선택삭제 에러:', err);
      alert('선택 차량 삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectVehicle = (id: number) => {
    setSelectedVehicleIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedVehicleIds.length === vehicles.length) {
      setSelectedVehicleIds([]);
    } else {
      setSelectedVehicleIds(vehicles.map(v => v.id));
    }
  };

  // Draft 정산서 핸들러
  const handleOpenDraft = async () => {
    setDraftInvoiceNo(`INV-${blNumber}`);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setDraftDueDate(nextWeek.toISOString().split('T')[0]);
    setDraftCalcResult(null);
    setDraftError("");
    setIsDraftOpen(true);
    try {
      const [clientsRes, rateRes] = await Promise.all([
        api.get("/api/billing/clients", { withCredentials: true }),
        api.get("/api/billing/exchange-rate", { withCredentials: true }).catch(() => ({ data: { success: false } }))
      ]);
      if (clientsRes.data.success) {
        setDraftClients(clientsRes.data.clients);
        const matched = clientsRes.data.clients.find((c: any) =>
          c.client_name.includes(shipment.shipper) || (shipment.shipper || '').includes(c.client_name)
        );
        setDraftClientId(matched ? matched.client_id : (clientsRes.data.clients[0]?.client_id || ''));
      }
      if (rateRes.data.success && rateRes.data.rate) setDraftExchangeRate(String(rateRes.data.rate));
    } catch (err) {
      setDraftError('기본 설정을 불러오는 중 오류가 발생했습니다.');
    }
  };

  const handleCalculateDraft = async () => {
    if (!draftClientId || !draftExchangeRate) { setDraftError('화주와 환율을 입력해주세요.'); return; }
    setDraftCalculating(true);
    setDraftError("");
    try {
      const res = await api.post("/api/billing/invoices/calculate", {
        shipmentIds: [shipmentId],
        clientId: draftClientId,
        exchangeRate: parseFloat(draftExchangeRate)
      }, { withCredentials: true });
      if (res.data.success) setDraftCalcResult(res.data.data);
      else setDraftError(res.data.message || '계산 실패');
    } catch (err: any) {
      setDraftError(err.response?.data?.message || '정산 계산 중 오류가 발생했습니다.');
    } finally {
      setDraftCalculating(false);
    }
  };

  // 화주/환율 변경 시 자동 계산
  useEffect(() => {
    if (isDraftOpen && draftClientId && draftExchangeRate) {
      const t = setTimeout(() => handleCalculateDraft(), 300);
      return () => clearTimeout(t);
    }
  }, [isDraftOpen, draftClientId, draftExchangeRate]);

  const handleSaveDraft = async () => {
    if (!draftCalcResult || !draftInvoiceNo || !draftDueDate) { setDraftError('인보이스 번호와 납기일을 입력해주세요.'); return; }
    setDraftSaving(true);
    setDraftError("");
    try {
      const payload = {
        invoice_no: draftInvoiceNo,
        client_id: draftClientId,
        bl_number: blNumber,
        vessel_name: shipment.vessel_name,
        pol: shipment.pol,
        pod: shipment.pod,
        exchange_rate: parseFloat(draftCalcResult.master.exchange_rate),
        total_ocean_usd: parseFloat(draftCalcResult.master.total_ocean_usd),
        total_local_krw: parseFloat(draftCalcResult.master.total_local_krw),
        final_amount_krw: parseFloat(draftCalcResult.master.final_amount_krw),
        bl_fee_krw: parseFloat(draftCalcResult.master.bl_fee_krw),
        customs_fee_krw: parseFloat(draftCalcResult.master.customs_fee_krw),
        due_date: draftDueDate,
        items: draftCalcResult.items,
        shipmentIds: [shipmentId]
      };
      const res = await api.post("/api/billing/invoices", payload, { withCredentials: true });
      if (res.data.success) {
        alert('정산서(가승인)가 성공적으로 임시 발행되었습니다!');
        setIsDraftOpen(false);
      } else {
        setDraftError(res.data.message || '저장 실패');
      }
    } catch (err: any) {
      setDraftError(err.response?.data?.message || '인보이스 저장에 실패했습니다.');
    } finally {
      setDraftSaving(false);
    }
  };

  const handlePendingDocsConfirm = async (selectedUrls: string[]) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/files/analyze-pending-photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipmentId,
          blNumber,
          photoUrls: selectedUrls
        })
      });

      const data = await response.json();
      if (data.success) {
        alert(`분석 완료! ${data.data.newVehiclesCount}대의 차량이 생성되었습니다.`);
        fetchVehicles();
        fetchUnclassifiedPhotos();
      } else {
        alert("분석 실패: " + data.message);
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleSaveAll = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracking/vehicles/${shipmentId}/save-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blNumber,
          vehicles
        })
      });
      const data = await response.json();
      if (data.success) {
        alert('모든 데이터가 성공적으로 저장되었습니다.');
        fetchVehicles(); // 전체저장된 상태 데이터(정규 URL 등)를 새로고침하여 화면에 정상 표시
        fetchUnclassifiedPhotos();
      } else {
        alert('저장 실패: ' + data.message);
      }
    } catch (err) {
      console.error(err);
      alert('저장 중 서버 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const isSaveDisabled = vehicles.some(v => v.plate_number?.includes('?') || !v.drivability);

  const handleDragStart = (e: React.DragEvent, photoUrl: string) => {
    e.dataTransfer.setData("photoUrl", photoUrl);
    e.dataTransfer.effectAllowed = "move";
  };

  const assignSelectedPhotosToVehicle = async (vehicleId: number, photoUrls: string[]) => {
    if (photoUrls.length === 0) return;

    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;

    const photoField = globalPhotoTab === 'document'
      ? 'deregistration_photo_urls'
      : globalPhotoTab === 'vin'
        ? 'vin_photo_urls'
        : 'condition_photo_urls';

    const currPhotos = vehicle[photoField] || [];
    const spaceLeft = 10 - currPhotos.length;
    if (spaceLeft <= 0) {
      alert("해당 사진첩은 최대 10장까지만 배정할 수 있습니다.");
      return;
    }

    const photosToAdd = photoUrls.slice(0, spaceLeft);
    if (photoUrls.length > spaceLeft) {
      alert(`최대 10장 제한으로 인해 ${spaceLeft}장만 배정되었습니다.`);
    }

    const removeFn = (unclass: string[]) => unclass.filter(url => {
      return !photosToAdd.some(addedUrl => {
        const rel = addedUrl.replace(/^https?:\/\/[^\/]+/, '');
        const fileName = rel.split('/').pop() || '';
        const linkedRel = rel.replace(`/${fileName}`, `/linked_${fileName}`);
        return url === addedUrl || url === `${API_BASE_URL}${rel}` || url === `${API_BASE_URL}${linkedRel}`;
      });
    });

    // 탭에 따라 올바른 미분류 사진 목록에서 배정된 사진들을 제외시킵니다.
    if (globalPhotoTab === 'document') {
      setPendingPhotos(prev => removeFn(prev));
    } else {
      setUnclassifiedPhotos(prev => removeFn(prev));
    }
    
    setSelectedPhotos([]);

    setVehicles(prev => prev.map(v => {
      if (v.id === vehicleId) {
        const uniquePhotosToAdd = photosToAdd.filter(url => !(v[photoField] || []).includes(url));
        return { ...v, [photoField]: [...(v[photoField] || []), ...uniquePhotosToAdd] };
      }
      return v;
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/api/tracking/vehicles/${vehicleId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrls: photosToAdd,
          type: globalPhotoTab
        })
      });
      const data = await response.json();
      if (data.success) {
        const updatedUrls = data.data.map((u: string) => u.startsWith('http') ? u : `${API_BASE_URL}${u}`);
        setVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, [photoField]: updatedUrls } : v));

        // Update floating viewer photos if open for this vehicle
        setViewerState(prev => {
          if (prev.isOpen && prev.vehicleId === vehicleId) {
            return { ...prev, photos: updatedUrls };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error("사진 배정 API 에러:", err);
    }
  };

  const handleDropToVehicle = (e: React.DragEvent, vehicleId: number) => {
    e.preventDefault();
    const photoUrl = e.dataTransfer.getData("photoUrl");
    if (!photoUrl) return;

    if (selectedPhotos.includes(photoUrl)) {
      assignSelectedPhotosToVehicle(vehicleId, selectedPhotos);
      return;
    }

    assignSelectedPhotosToVehicle(vehicleId, [photoUrl]);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const openViewer = (vehicleId: number, photos: string[]) => {
    if (photos.length === 0) return;

    viewerPos.current = { x: 0, y: 0 };
    if (viewerRef.current) {
      viewerRef.current.style.transform = 'translate(0px, 0px)';
    }
    // 미분류 사진함이 열려있으면 닫기 (같은 위치에서 열리므로)
    setShowUnclassifiedDrawer(false);
    setViewerState({
      isOpen: true,
      vehicleId,
      photos,
      currentIndex: 0
    });
  };

  const closeViewer = () => {
    setViewerState(prev => ({ ...prev, isOpen: false }));
  };

  const navigateViewer = (direction: 1 | -1) => {

    setViewerState(prev => {
      let newIndex = prev.currentIndex + direction;
      if (newIndex < 0) newIndex = prev.photos.length - 1;
      if (newIndex >= prev.photos.length) newIndex = 0;
      return { ...prev, currentIndex: newIndex };
    });
  };

  const removeCurrentPhoto = async () => {
    const { vehicleId, photos, currentIndex } = viewerState;
    const photoToRemove = photos[currentIndex];

    const photoField = globalPhotoTab === 'document'
      ? 'deregistration_photo_urls'
      : globalPhotoTab === 'vin'
        ? 'vin_photo_urls'
        : 'condition_photo_urls';

    setVehicles(prev => prev.map(v => {
      if (v.id === vehicleId) {
        return { ...v, [photoField]: (v[photoField] || []).filter(url => url !== photoToRemove) };
      }
      return v;
    }));

    // 미분류함에 일단 낙관적 복원 (linked_ 접두사 제거한 URL 추정)
    const getRestoredUrl = (url: string) => {
      const fileName = url.split('/').pop() || '';
      if (fileName.startsWith('linked_')) {
        return url.replace(`/${fileName}`, `/${fileName.replace(/^linked_/, '')}`);
      }
      return url;
    };
    const optimisticRestoredUrl = getRestoredUrl(photoToRemove);
    if (globalPhotoTab === 'document') {
      setPendingPhotos(prev => [optimisticRestoredUrl, ...prev]);
    } else {
      setUnclassifiedPhotos(prev => [optimisticRestoredUrl, ...prev]);
    }

    const newPhotos = photos.filter((_, idx) => idx !== currentIndex);
    if (newPhotos.length === 0) {
      closeViewer();
    } else {
      setViewerState(prev => ({
        ...prev,
        photos: newPhotos,
        currentIndex: currentIndex >= newPhotos.length ? newPhotos.length - 1 : currentIndex
      }));
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/tracking/vehicles/${vehicleId}/photos/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrl: photoToRemove,
          type: globalPhotoTab
        })
      });
      const data = await res.json();
      // 백엔드에서 실제로 복원된 URL이 다른 경우 교체
      if (data.restoredUrl) {
        const restoredFull = `${API_BASE_URL}${data.restoredUrl}`;
        if (restoredFull !== optimisticRestoredUrl) {
          const replaceFn = (prev: string[]) => prev.map(u => u === optimisticRestoredUrl ? restoredFull : u);
          if (globalPhotoTab === 'document') {
            setPendingPhotos(prev => replaceFn(prev));
          } else {
            setUnclassifiedPhotos(prev => replaceFn(prev));
          }
        }
      }
    } catch (err) {
      console.error("사진 배정 해제 API 에러:", err);
    }
  };

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/tracking/vehicles/${shipmentId}`);
      const data = await res.json();
      if (data.success) {
        const list = data.data || [];
        // 1. 데이터베이스에서 불러온 차량 목록을 로컬에서 편집 중이던 임시 값들과 병합하여 화면에 세팅
        setVehicles(prev => {
          return list.map((v: Vehicle) => {
            const existing = prev.find(p => p.id === v.id);
            if (existing) {
              return {
                ...v,
                // 로컬 UI상에서 사용자가 입력/수정한 값들을 유지
                vin: existing.vin !== undefined ? existing.vin : v.vin,
                plate_number: existing.plate_number !== undefined ? existing.plate_number : v.plate_number,
                vehicle_type: existing.vehicle_type !== undefined ? existing.vehicle_type : v.vehicle_type,
                mileage: existing.mileage !== undefined ? existing.mileage : v.mileage,
                initial_registration_date: existing.initial_registration_date !== undefined ? existing.initial_registration_date : v.initial_registration_date,
                make: existing.make !== undefined ? existing.make : v.make,
                model: existing.model !== undefined ? existing.model : v.model,
                year: existing.year !== undefined ? existing.year : v.year,
                price: existing.price !== undefined ? existing.price : v.price,
                drivability: existing.drivability !== undefined ? existing.drivability : v.drivability,
                length: existing.length !== undefined ? existing.length : v.length,
                width: existing.width !== undefined ? existing.width : v.width,
                height: existing.height !== undefined ? existing.height : v.height,
                weight: existing.weight !== undefined ? existing.weight : v.weight,
                cbm: existing.cbm !== undefined ? existing.cbm : v.cbm,
                buyer: existing.buyer !== undefined ? existing.buyer : v.buyer,
                customs_cleared: existing.customs_cleared !== undefined ? existing.customs_cleared : v.customs_cleared,
              };
            }
            return v;
          });
        });
        
        // 2. 비동기로 누락된 제원 조회 (렌더링을 블로킹하지 않음)
        list.forEach(async (v: Vehicle) => {
          if (v.vin && v.vin.length === 17 && (!v.model || !v.length)) {
            try {
              await autoVinLookup(v.id, v.vin);
            } catch (err) {
              console.error(`비동기 제원 조회 에러 (VIN: ${v.vin}):`, err);
            }
          }
        });
      }
    } catch (err) {
      console.error("차량 목록 조회 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnclassifiedPhotos = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/files/unclassified-photos/${blNumber}`);
      const data = await res.json();
      if (data.success) {
        const isArr = Array.isArray(data.data);
        const extPhotos = isArr ? data.data : (data.data.exterior || []);
        const docPhotos = isArr ? [] : (data.data.docs || []);

        setUnclassifiedPhotos(extPhotos);
        setPendingPhotos(docPhotos.filter((url: string) => url.split('/').pop()?.startsWith('shipper_')));
      }
    } catch (err) {
      console.error("미분류 사진 조회 실패:", err);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchUnclassifiedPhotos();

    const socket = io(API_BASE_URL);
    socket.emit("join", { role: "admin" });

    socket.on("new_shipper_docs_alert", (data) => {
      // If the currently open dashboard matches the shipment that received photos
      if (data.blNumber === blNumber || data.shipmentId === shipmentId) {
        fetchUnclassifiedPhotos();
      }
    });

    socket.on("refresh_vehicle_list", (data) => {
      if (data.blNumber === blNumber || data.shipmentId === shipmentId) {
        fetchVehicles();
        fetchUnclassifiedPhotos();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [shipmentId, blNumber]);

  const handleReset = async () => {
    if (!window.confirm("정말 이 B/L의 모든 차량 정보와 미분류 사진을 초기화하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tracking/vehicles/${shipmentId}/reset?blNumber=${encodeURIComponent(blNumber)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        alert("모든 데이터가 초기화되었습니다.");
        setVehicles([]);
        setUnclassifiedPhotos([]);
        setPendingPhotos([]);
      } else {
        alert("초기화 실패: " + data.message);
      }
    } catch (err) {
      console.error("초기화 에러:", err);
      alert("초기화 중 서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Loaded": return <span className="bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded text-sm font-bold">선적 완료</span>;
      case "Yard In": return <span className="bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded text-sm font-bold">야드 반입</span>;
      case "Pending": return <span className="bg-slate-100 text-slate-800 px-2.5 py-0.5 rounded text-sm font-bold">대기중</span>;
      default: return <span className="bg-gray-100 text-gray-800 px-2.5 py-0.5 rounded text-sm font-bold">{status}</span>;
    }
  };

  const getDrivabilityIcon = (drivability: string) => {
    switch (drivability) {
      case "Running": return <span className="text-emerald-600 flex items-center text-sm font-bold"><CheckCircle size={14} className="mr-1" /> Running</span>;
      case "Towing": return <span className="text-amber-600 flex items-center text-sm font-bold"><Truck size={14} className="mr-1" /> Towing</span>;
      case "Forklift": return <span className="text-rose-600 flex items-center text-sm font-bold"><AlertTriangle size={14} className="mr-1" /> Forklift</span>;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 md:p-6">
      <style>{`
        @keyframes modal-slide-up {
          from {
            transform: translateY(100vh);
            opacity: 0.9;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        .animate-modal-slide-up {
          animation: modal-slide-up 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
      <div className="bg-white dark:bg-slate-900 w-full max-w-[95vw] h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 relative animate-modal-slide-up">
        {/* Header */}
        <div className="flex flex-col p-4 md:p-6 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors z-10">
            <X size={20} className="text-slate-500" />
          </button>

          <h2 className="text-xl md:text-2xl font-black text-slate-800 dark:text-white flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
            차량 관리 대시보드
            {pendingPhotos.length > 0 && (
              <button
                onClick={() => setShowPendingModal(true)}
                className="w-fit mt-1 sm:mt-0 sm:ml-4 flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2 rounded-full text-xs md:text-sm font-bold hover:bg-rose-100 transition-colors animate-pulse shadow-sm"
              >
                <BellRing size={16} className="animate-bounce" />
                화주 대기 서류 {pendingPhotos.length}장 확인
              </button>
            )}
          </h2>

          {/* Controls Bar */}
          <div className="flex flex-col lg:flex-row lg:items-end justify-between w-full gap-4 md:pr-10">
            {/* Left Controls (BL & Buyer) */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 md:gap-6">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">B/L Number</span>
                <span className="font-mono text-base md:text-lg font-black text-blue-700 dark:text-blue-400">{blNumber}</span>
              </div>

              <div className="hidden sm:block h-8 w-px bg-slate-200 dark:bg-slate-700"></div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Buyer</span>
                <button
                  onClick={() => setShowBuyerModal(true)}
                  className={`text-left text-sm px-3 py-2 border ${globalBuyer ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800' : 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'} rounded focus:border-indigo-500 w-full sm:w-56 transition-colors text-slate-700 dark:text-slate-300 overflow-hidden text-ellipsis whitespace-nowrap`}
                >
                  {globalBuyer || <span className="text-blue-500 dark:text-blue-400 font-medium">수입자(바이어) 정보 입력...</span>}
                </button>
              </div>

              <div className="hidden sm:block h-8 w-px bg-slate-200 dark:bg-slate-700"></div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Vehicles</span>
                <span className="font-mono text-sm md:text-base font-black text-indigo-600 dark:text-indigo-400">
                  총 {vehicles.length}대 등록됨
                </span>
              </div>
            </div>

            {/* Right Controls (Buttons) */}
            <div className="flex flex-wrap items-center gap-2 justify-end lg:ml-auto">

              {/* 전체선택 + 선택삭제 */}
              <div className="flex items-center gap-1.5 h-9 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg">
                <input
                  type="checkbox"
                  id="select-all-vehicles"
                  checked={vehicles.length > 0 && selectedVehicleIds.length === vehicles.length}
                  onChange={toggleSelectAll}
                  className="h-3.5 w-3.5 rounded accent-rose-500 cursor-pointer"
                />
                <label htmlFor="select-all-vehicles" className="text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                  전체
                </label>
              </div>
              {selectedVehicleIds.length > 0 && (
                <button
                  onClick={handleDeleteSelected}
                  disabled={isDeleting}
                  className="h-9 flex items-center justify-center gap-1.5 bg-rose-500 hover:bg-rose-600 text-white px-3.5 rounded-lg text-xs md:text-sm font-bold transition-colors disabled:opacity-50 shadow-sm animate-pulse"
                >
                  <Trash2 size={14} />
                  {isDeleting ? '삭제 중...' : `선택 ${selectedVehicleIds.length}대 삭제`}
                </button>
              )}

              {/* 전체삭제 */}
              <button
                onClick={handleReset}
                disabled={loading}
                className="h-9 flex items-center justify-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 px-3.5 rounded-lg text-xs md:text-sm font-bold transition-colors disabled:opacity-50 border border-red-200 dark:border-red-800"
              >
                <Trash2 size={15} />
                전체삭제
              </button>

              {/* 전체저장 */}
              <button
                onClick={handleSaveAll}
                disabled={isSaveDisabled || loading}
                className="h-9 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 rounded-lg text-xs md:text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                title={isSaveDisabled ? "차량번호 '?' 수정 및 구동상태를 모두 선택해야 저장할 수 있습니다." : "모든 변경사항 저장"}
              >
                <Save size={15} />
                전체저장
              </button>

              {/* INV/PAC전송 */}
              <button
                onClick={handleGeneratePDF}
                disabled={isSending || loading}
                className="h-9 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 rounded-lg text-xs md:text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                title="바이어 정보를 기반으로 PDF 서류 생성 및 카카오톡 발송"
              >
                <Send size={15} />
                {isSending ? "전송 중..." : "INV/PAC전송"}
              </button>

              {/* Draft 발행 */}
              <button
                type="button"
                onClick={handleOpenDraft}
                className="h-9 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 rounded-lg text-xs md:text-sm font-bold transition-colors shadow-sm"
                title="임시 정산서(Draft) 발행 폼 열기"
              >
                <CreditCard size={15} />
                Draft 발행
              </button>

              {/* 차량사진 업로드 */}
              <input
                type="file"
                multiple
                accept="image/*,.zip"
                className="hidden"
                ref={fastFileInputRef}
                onChange={(e) => handleFileUpload(e, true, 'exterior')}
              />
              <button
                onClick={() => fastFileInputRef.current?.click()}
                disabled={uploading}
                className="h-9 flex items-center justify-center gap-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 px-3.5 rounded-lg text-xs md:text-sm font-bold shadow-sm transition-colors disabled:opacity-50 border border-slate-200 dark:border-slate-700"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={15} className="text-amber-500" />}
                차량사진
              </button>

              {/* 서류사진 업로드 */}
              <input
                type="file"
                multiple
                accept="image/*,.zip"
                className="hidden"
                ref={fileInputRef}
                onChange={(e) => handleFileUpload(e, false, 'docs')}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="h-9 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 rounded-lg text-xs md:text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <FileImage size={14} />}
                {uploading ? "분석 중..." : "서류사진"}
              </button>
              
              {/* 차량사진 추가 (미분류 사진함) */}
              {unclassifiedPhotos.length > 0 && (
                <button
                  onClick={() => setShowUnclassifiedDrawer(!showUnclassifiedDrawer)}
                  className={`h-9 flex items-center justify-center gap-1.5 px-3.5 rounded-lg text-xs md:text-sm font-bold shadow-sm border transition-colors ${
                    showUnclassifiedDrawer 
                      ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/50' 
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Camera size={16} className={showUnclassifiedDrawer ? "text-amber-600" : "text-slate-400"} />
                  차량사진 추가 ({unclassifiedPhotos.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Table Area */}
          <div className="flex-1 flex flex-col overflow-hidden p-4 bg-slate-50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="bg-slate-50 dark:bg-slate-950/20 rounded-lg overflow-auto shadow-sm flex-1">
                <table className="w-full text-left text-sm block lg:table">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 z-10 shadow-sm hidden lg:table-header-group">
                    <tr>
                      <th className="p-3 w-10">
                        <input
                          type="checkbox"
                          checked={vehicles.length > 0 && selectedVehicleIds.length === vehicles.length}
                          onChange={toggleSelectAll}
                          className="h-3.5 w-3.5 rounded accent-rose-500 cursor-pointer"
                        />
                      </th>
                      <th className="p-3 font-bold w-56">차대번호 (VIN)</th>
                      <th className="p-3 font-bold w-[650px]">제원 및 단가 정보</th>
                      <th className="p-3 font-bold text-center w-56">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-sm">사진 정보</span>
                          <div className="flex bg-slate-200 dark:bg-slate-800 p-0.5 rounded text-[11px] font-bold shadow-inner">
                            <button
                              onClick={() => setGlobalPhotoTab('plate')}
                              className={`px-2 py-0.5 rounded transition-colors ${globalPhotoTab === 'plate' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            >
                              외관
                            </button>
                            <button
                              onClick={() => setGlobalPhotoTab('document')}
                              className={`px-2 py-0.5 rounded transition-colors ${globalPhotoTab === 'document' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            >
                              말소증
                            </button>
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 block lg:table-row-group p-2 md:p-4 lg:p-0">
                    {vehicles.map((v, idx) => {
                      const isAlertRow = v.plate_number?.includes('?') || !v.drivability;
                      const isEven = idx % 2 === 0;
                      const rowBgClass = isAlertRow
                        ? (isEven ? 'bg-red-50/50 dark:bg-red-950/20 border-red-200' : 'bg-red-50/30 dark:bg-red-950/10 border-red-150')
                        : (isEven ? 'bg-white dark:bg-slate-900 border-slate-200' : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-150');

                      const isCurrentViewingRow = viewerState.isOpen && viewerState.vehicleId === v.id;

                      return (
                        <tr key={v.id} className={`transition-colors hover:bg-yellow-50 dark:hover:bg-yellow-950/10 ${rowBgClass} ${isCurrentViewingRow ? 'shadow-[0_4px_20px_rgba(239,68,68,0.15)]' : ''} block lg:table-row mb-6 lg:mb-0 p-4 lg:p-0 rounded-2xl border shadow-sm lg:shadow-none bg-white dark:bg-slate-900`}>
                          {/* 체크박스 셀 (desktop only) */}
                          <td className="hidden lg:table-cell p-3 align-middle w-10">
                            <input
                              type="checkbox"
                              checked={selectedVehicleIds.includes(v.id)}
                              onChange={() => toggleSelectVehicle(v.id)}
                              onClick={e => e.stopPropagation()}
                              className="h-3.5 w-3.5 rounded accent-rose-500 cursor-pointer"
                            />
                          </td>
                          <td className={`p-3 align-top transition-all duration-150 block lg:table-cell w-full lg:w-56 mb-4 lg:mb-0 border-b border-slate-100 dark:border-slate-800 lg:border-none pb-3 lg:pb-3 ${isCurrentViewingRow ? 'border-l-4 border-y-2 border-red-500 bg-red-50/20 dark:bg-red-950/10' : ''}`}>
                            <div className="flex gap-1.5 items-center mb-2">
                              <input
                                type="text"
                                maxLength={17}
                                value={v.vin || ""}
                                onChange={(e) => {
                                  const nextVal = e.target.value;
                                  handleInputChange(v.id, "vin", nextVal);
                                  if (nextVal && nextVal.length === 17) {
                                    autoVinLookup(v.id, nextVal);
                                  }
                                }}
                                placeholder="차대번호 입력"
                                className={`font-mono font-black text-[16px] flex-1 min-w-0 px-2 py-1.5 border rounded outline-none transition-colors ${
                                  (v.vin?.includes('?') || !v.vin || v.vin.length < 17)
                                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 focus:border-red-600'
                                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-blue-500'
                                }`}
                              />
                            </div>
                            <div className="mt-1.5 w-4/5 mx-auto select-none border border-slate-200 dark:border-slate-800 rounded-lg p-1.5 bg-slate-50 dark:bg-slate-900/30 flex items-center justify-between gap-1">
                              {(() => {
                                const currentIdx = VEHICLE_STAGES.findIndex(stage => stage.value === (v.status || "Pending"));
                                const activeIdx = currentIdx === -1 ? 0 : currentIdx;
                                
                                const prevStage = activeIdx > 0 ? VEHICLE_STAGES[activeIdx - 1] : null;
                                const activeStage = VEHICLE_STAGES[activeIdx];
                                const nextStage = activeIdx < VEHICLE_STAGES.length - 1 ? VEHICLE_STAGES[activeIdx + 1] : null;

                                const PrevIcon = prevStage?.icon;
                                const ActiveIcon = activeStage.icon;
                                const NextIcon = nextStage?.icon;

                                return (
                                  <>
                                    {/* Left (Previous) */}
                                    <div className="w-[64px] flex justify-start">
                                      {prevStage && PrevIcon ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleVehicleStatusChange(v.id, prevStage.value, v.status || "Pending");
                                          }}
                                          className="w-[60px] h-[48px] flex flex-col items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition duration-150 shadow-3xs cursor-pointer"
                                          title={`클릭 시 '${prevStage.label}'(으)로 변경`}
                                        >
                                          <PrevIcon size={12} className="text-slate-400 mb-0.5" />
                                          <span className="text-[8px] leading-none font-bold">{prevStage.label}</span>
                                        </button>
                                      ) : (
                                        <div className="w-[60px] h-[48px]" />
                                      )}
                                    </div>
                                    {/* Center (Active) */}
                                    <div className="flex-1 flex justify-center">
                                      <div
                                        className={`w-[84px] h-[48px] flex flex-col items-center justify-center rounded-md border font-black ${activeStage.activeColor} shadow-2xs relative overflow-hidden`}
                                      >
                                        <span className="text-[5px] font-bold uppercase tracking-wide opacity-50 absolute top-0.5">Active</span>
                                        <ActiveIcon size={15} className="mb-0.5 mt-2.5 text-current animate-pulse shrink-0" />
                                        <span className="text-[9.5px] tracking-tight text-center leading-none truncate w-full font-bold">{activeStage.label}</span>
                                      </div>
                                    </div>

                                    {/* Right (Next) */}
                                    <div className="w-[64px] flex justify-end">
                                      {nextStage && NextIcon ? (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleVehicleStatusChange(v.id, nextStage.value, v.status || "Pending");
                                          }}
                                          className="w-[60px] h-[48px] flex flex-col items-center justify-center rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition duration-150 shadow-3xs cursor-pointer"
                                          title={`클릭 시 '${nextStage.label}'(으)로 변경`}
                                        >
                                          <NextIcon size={12} className="text-slate-400 mb-0.5" />
                                          <span className="text-[8px] leading-none font-bold">{nextStage.label}</span>
                                        </button>
                                      ) : (
                                        <div className="w-[60px] h-[48px]" />
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>

                            {/* Row 3: 구동 여부 (운행가능, 견인필요, 지게차필요) 세그먼트 버튼 group (Desktop view: hidden lg:flex) */}
                            <div className="mt-3 flex flex-col gap-1.5 hidden lg:flex">
                              {/* <div className="text-xs font-bold text-slate-500 dark:text-slate-400">구동상태:</div> */}
                              <div className="flex w-full bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1">
                                {[
                                  { value: "Running", label: "운행 가능", activeBg: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs", inactiveBg: "text-slate-600 hover:bg-slate-200/60 dark:text-slate-350 dark:hover:bg-slate-750", Icon: CheckCircle },
                                  { value: "Towing", label: "견인 필요", activeBg: "bg-amber-500 hover:bg-amber-600 text-white shadow-xs", inactiveBg: "text-slate-600 hover:bg-slate-200/60 dark:text-slate-350 dark:hover:bg-slate-750", Icon: Truck },
                                  { value: "Forklift", label: "지게차 필요", activeBg: "bg-rose-500 hover:bg-rose-600 text-white shadow-xs", inactiveBg: "text-slate-600 hover:bg-slate-200/60 dark:text-slate-350 dark:hover:bg-slate-750", Icon: AlertTriangle }
                                ].map(({ value, label, activeBg, inactiveBg, Icon }) => {
                                  const isSelected = v.drivability === value;
                                  return (
                                    <button
                                      key={value}
                                      type="button"
                                      onClick={() => handleInputChange(v.id, "drivability", value)}
                                      className={`flex-1 h-9 rounded-lg text-xs font-extrabold transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer ${
                                        isSelected ? activeBg : inactiveBg
                                      }`}
                                    >
                                      <Icon size={13} className={isSelected ? "text-white" : "text-slate-400 dark:text-slate-500"} />
                                      <span>{label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                          <td className={`p-3 align-top transition-all duration-150 block lg:table-cell w-full lg:w-[650px] mb-4 lg:mb-0 border-b border-slate-100 dark:border-slate-800 lg:border-none pb-3 lg:pb-3 ${isCurrentViewingRow ? 'border-y-2 border-red-500 bg-red-50/20 dark:bg-red-950/10' : ''}`}>
                            <div className="flex flex-col gap-4">
                              {/* Row 1: 차명, 연식, 단가 */}
                              <div className="grid grid-cols-3 gap-3 border-b border-slate-200 dark:border-slate-850 pb-3">
                                {/* 차명 */}
                                <div className="flex flex-col gap-1">
                                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400">차명:</div>
                                  <input
                                    type="text"
                                    value={v.model || ""}
                                    onChange={(e) => handleInputChange(v.id, "model", e.target.value)}
                                    placeholder="차명 (모델명)"
                                    className={`w-full px-2.5 py-1.5 border rounded-lg outline-none transition-colors font-bold text-sm h-9 ${
                                      (v.model?.includes('?') || !v.model)
                                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-755 dark:text-red-300 focus:border-red-600'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-750 dark:text-slate-200 focus:border-blue-500'
                                    }`}
                                  />
                                </div>

                                {/* 연식 */}
                                <div className="flex flex-col gap-1 border-l border-slate-250 dark:border-slate-800 pl-3">
                                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400">연식:</div>
                                  <select
                                    value={v.year || ""}
                                    onChange={(e) => handleInputChange(v.id, "year", e.target.value ? parseInt(e.target.value, 10) : null)}
                                    className={`w-full px-2.5 py-1.5 border rounded-lg outline-none transition-colors text-sm font-bold h-9 ${
                                      (!v.year)
                                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-755 dark:text-red-300 focus:border-red-600'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-750 dark:text-slate-200 focus:border-blue-500'
                                    }`}
                                  >
                                    <option value="">선택</option>
                                    {Array.from({ length: 45 }, (_, i) => new Date().getFullYear() + 1 - i).map(year => (
                                      <option key={year} value={year}>{year}년</option>
                                    ))}
                                  </select>
                                </div>

                                {/* 단가 */}
                                <div className="flex flex-col gap-1 border-l border-slate-250 dark:border-slate-800 pl-3">
                                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-450">단가:</div>
                                  <div className="relative w-full">
                                    <span className="absolute left-2.5 top-2 text-xs font-bold text-slate-400">$</span>
                                    <input
                                      type="text"
                                      placeholder="0.0"
                                      value={focusedPriceId === v.id ? (v.price !== undefined && v.price !== null ? String(v.price) : "") : (v.price ? Number(v.price).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "")}
                                      onFocus={() => setFocusedPriceId(v.id)}
                                      onBlur={() => setFocusedPriceId(null)}
                                      onChange={(e) => {
                                        const cleanVal = e.target.value.replace(/[^0-9.]/g, "");
                                        const parts = cleanVal.split('.');
                                        const formattedVal = parts[0] + (parts.length > 1 ? '.' + parts.slice(1).join('') : '');
                                        handleInputChange(v.id, "price", formattedVal);
                                      }}
                                      className={`w-full pl-5.5 pr-2.5 py-1.5 border rounded-lg outline-none transition-colors font-bold text-sm h-9 text-right ${
                                        (!v.price)
                                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-755 dark:text-red-300 focus:border-red-600'
                                          : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10 text-emerald-600 dark:text-emerald-450 focus:border-emerald-500'
                                      }`}
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Row 2: 부피, 중량, 실측입력 */}
                              <div className="grid grid-cols-3 gap-3 border-b border-slate-200 dark:border-slate-850 pb-3 items-center">
                                {/* 부피 */}
                                <div className="flex flex-col gap-0.5">
                                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400">부피:</div>
                                  <div className="text-blue-600 dark:text-blue-400 font-black text-sm h-7 flex items-center">
                                    {v.cbm || 0} CBM
                                  </div>
                                </div>

                                {/* 중량 */}
                                <div className="flex flex-col gap-0.5 border-l border-slate-250 dark:border-slate-800 pl-3">
                                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400">중량:</div>
                                  <div className="text-slate-700 dark:text-slate-300 font-black text-xs h-7 flex flex-wrap items-center gap-1.5">
                                    <span>{v.weight ? `${Number(v.weight).toLocaleString()} kg` : "0 kg"}</span>
                                    <span className="text-[10px] font-bold text-slate-400">({((v.weight || 0) / 1000).toFixed(3)} Ton)</span>
                                  </div>
                                </div>

                                {/* 실측입력 */}
                                <div className="flex flex-col gap-0.5 border-l border-slate-250 dark:border-slate-800 pl-3">
                                  {/* <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-0.5">실측입력:</div> */}
                                  <button
                                    type="button"
                                    onClick={() => toggleVehicleExpand(v.id)}
                                    className={`w-full h-8 px-2.5 rounded-lg border text-xs font-bold shadow-xs transition duration-150 flex items-center justify-center gap-1 shrink-0 cursor-pointer ${
                                      expandedVehicles[v.id]
                                        ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900/50'
                                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 border-slate-200 dark:border-slate-700'
                                    }`}
                                  >
                                    {expandedVehicles[v.id] ? "실측 닫기" : "실측 입력"}
                                  </button>
                                </div>
                              </div>

                              {/* Row 3: 구동 여부 (운행가능, 견인필요, 지게차필요) 세그먼트 버튼 group (Mobile view: lg:hidden) */}
                              <div className="flex flex-col gap-1.5 lg:hidden">
                                <div className="text-xs font-bold text-slate-500 dark:text-slate-400">구동상태:</div>
                                <div className="flex w-full bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl gap-1">
                                  {[
                                    { value: "Running", label: "운행 가능", activeBg: "bg-emerald-500 hover:bg-emerald-600 text-white shadow-xs", inactiveBg: "text-slate-600 hover:bg-slate-200/60 dark:text-slate-350 dark:hover:bg-slate-750", Icon: CheckCircle },
                                    { value: "Towing", label: "견인 필요", activeBg: "bg-amber-500 hover:bg-amber-600 text-white shadow-xs", inactiveBg: "text-slate-600 hover:bg-slate-200/60 dark:text-slate-350 dark:hover:bg-slate-750", Icon: Truck },
                                    { value: "Forklift", label: "지게차 필요", activeBg: "bg-rose-500 hover:bg-rose-600 text-white shadow-xs", inactiveBg: "text-slate-600 hover:bg-slate-200/60 dark:text-slate-350 dark:hover:bg-slate-750", Icon: AlertTriangle }
                                  ].map(({ value, label, activeBg, inactiveBg, Icon }) => {
                                    const isSelected = v.drivability === value;
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() => handleInputChange(v.id, "drivability", value)}
                                        className={`flex-1 h-9 rounded-lg text-xs font-extrabold transition-all duration-150 flex items-center justify-center gap-1.5 cursor-pointer ${
                                          isSelected ? activeBg : inactiveBg
                                        }`}
                                      >
                                        <Icon size={13} className={isSelected ? "text-white" : "text-slate-400 dark:text-slate-500"} />
                                        <span>{label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {/* 상세 제원 및 실측 입력 (토글 영역) */}
                            {expandedVehicles[v.id] && (
                              <div className="mt-3 p-3 bg-slate-50/50 dark:bg-slate-900/40 rounded-xl border border-slate-100 dark:border-slate-800 space-y-4 animate-fadeIn">
                                <style>{`
                                  @keyframes fadeIn {
                                    from { opacity: 0; transform: translateY(-4px); }
                                    to { opacity: 1; transform: translateY(0); }
                                  }
                                  .animate-fadeIn {
                                    animation: fadeIn 0.15s ease-out forwards;
                                  }
                                `}</style>

                                {/* 하단 제원 2x2 그리드 */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-3 w-full">
                                  <div className="flex items-center text-sm">
                                    <span className="w-16 font-bold text-slate-600 dark:text-slate-400 shrink-0">차량번호:</span>
                                    <input
                                      type="text"
                                      value={v.plate_number || ""}
                                      onChange={(e) => handleInputChange(v.id, "plate_number", e.target.value)}
                                      className={`flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded outline-none transition-colors ${
                                        (v.plate_number?.includes('?') || !v.plate_number)
                                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-755 dark:text-red-350 focus:border-red-600'
                                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-slate-200 focus:border-blue-500'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex items-center text-sm">
                                    <span className="w-16 font-bold text-slate-600 dark:text-slate-400 shrink-0">제작사:</span>
                                    <input
                                      type="text"
                                      value={v.make || ""}
                                      onChange={(e) => handleInputChange(v.id, "make", e.target.value)}
                                      className={`flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded outline-none transition-colors ${
                                        (v.make?.includes('?') || !v.make)
                                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-755 dark:text-red-350 focus:border-red-600'
                                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-slate-200 focus:border-blue-500'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex items-center text-sm">
                                    <span className="w-16 font-bold text-slate-600 dark:text-slate-400 shrink-0">최초등록:</span>
                                    <input
                                      type="text"
                                      value={formatDateToSlash(v.initial_registration_date)}
                                      onChange={(e) => handleInputChange(v.id, "initial_registration_date", e.target.value)}
                                      className={`flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded outline-none transition-colors ${
                                        (v.initial_registration_date?.includes('?') || !v.initial_registration_date)
                                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-755 dark:text-red-350 focus:border-red-600'
                                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-slate-200 focus:border-blue-500'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex items-center text-sm">
                                    <span className="w-16 font-bold text-slate-600 dark:text-slate-400 shrink-0">차종:</span>
                                    <input
                                      type="text"
                                      value={v.vehicle_type || ""}
                                      onChange={(e) => handleInputChange(v.id, "vehicle_type", e.target.value)}
                                      className={`flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded outline-none transition-colors ${
                                        (v.vehicle_type?.includes('?') || !v.vehicle_type)
                                          ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-755 dark:text-red-350 focus:border-red-600'
                                          : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-slate-200 focus:border-blue-500'
                                      }`}
                                    />
                                  </div>
                                </div>

                                {/* 제원 및 부피/중량 실측 관리 그리드 */}
                                <div className="grid grid-cols-4 gap-3 w-full bg-slate-100/50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-slate-500">전장 (L, mm)</span>
                                    <input
                                      type="number"
                                      value={v.length || ""}
                                      onChange={(e) => handleInputChange(v.id, "length", e.target.value ? parseInt(e.target.value, 10) : "")}
                                      placeholder="전장"
                                      className={`w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800 font-bold outline-none focus:border-blue-500 transition-colors ${
                                        (!v.length)
                                          ? 'border-red-500 text-red-755 dark:text-red-300 bg-red-50 dark:bg-red-900/20'
                                          : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-slate-500">전폭 (W, mm)</span>
                                    <input
                                      type="number"
                                      value={v.width || ""}
                                      onChange={(e) => handleInputChange(v.id, "width", e.target.value ? parseInt(e.target.value, 10) : "")}
                                      placeholder="전폭"
                                      className={`w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800 font-bold outline-none focus:border-blue-500 transition-colors ${
                                        (!v.width)
                                          ? 'border-red-500 text-red-755 dark:text-red-300 bg-red-50 dark:bg-red-900/20'
                                          : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-slate-500">전고 (H, mm)</span>
                                    <input
                                      type="number"
                                      value={v.height || ""}
                                      onChange={(e) => handleInputChange(v.id, "height", e.target.value ? parseInt(e.target.value, 10) : "")}
                                      placeholder="전고"
                                      className={`w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800 font-bold outline-none focus:border-blue-500 transition-colors ${
                                        (!v.height)
                                          ? 'border-red-500 text-red-755 dark:text-red-300 bg-red-50 dark:bg-red-900/20'
                                          : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white'
                                      }`}
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-slate-500">중량 (Weight, kg)</span>
                                    <input
                                      type="number"
                                      value={v.weight || ""}
                                      onChange={(e) => handleInputChange(v.id, "weight", e.target.value ? parseFloat(e.target.value) : "")}
                                      placeholder="중량"
                                      className={`w-full px-2 py-1 text-xs border rounded bg-white dark:bg-slate-800 font-bold outline-none focus:border-blue-500 transition-colors ${
                                        (!v.weight)
                                          ? 'border-red-500 text-red-755 dark:text-red-300 bg-red-50 dark:bg-red-900/20'
                                          : 'border-slate-300 dark:border-slate-700 text-slate-800 dark:text-white'
                                      }`}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td
                            className={`p-3 transition-all duration-150 block lg:table-cell w-full lg:w-56 pb-1 lg:pb-3 ${isCurrentViewingRow ? 'border-r-4 border-y-2 border-red-500 bg-red-50/20 dark:bg-red-950/10' : ''}`}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDropToVehicle(e, v.id)}
                          >
                            {(() => {
                              const photoField = globalPhotoTab === 'document'
                                ? 'deregistration_photo_urls'
                                : globalPhotoTab === 'vin'
                                  ? 'vin_photo_urls'
                                  : 'condition_photo_urls';
                              const urls = v[photoField] || [];

                              return (
                                <div
                                  className={`min-h-[80px] w-full border-2 border-dashed rounded-lg p-2 bg-slate-50/50 flex items-center justify-center transition-all cursor-pointer ${selectedPhotos.length > 0
                                    ? 'border-emerald-500 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse'
                                    : 'border-slate-300 dark:border-slate-700 hover:bg-indigo-50 hover:border-indigo-300'
                                    }`}
                                  onClick={() => {
                                    if (selectedPhotos.length > 0) {
                                      assignSelectedPhotosToVehicle(v.id, selectedPhotos);
                                    } else {
                                      if (urls.length > 0) openViewer(v.id, urls);
                                    }
                                  }}
                                >
                                  {urls.length > 0 ? (
                                    <div className="relative w-full aspect-video rounded overflow-hidden shadow-sm group">
                                      <img src={urls[0]} alt="Thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Camera className="text-white" size={20} />
                                      </div>
                                      {urls.length > 1 && (
                                        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                          +${urls.length - 1}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-slate-400 font-medium text-center leading-relaxed">
                                      {selectedPhotos.length > 0 ? (
                                        <span className="text-emerald-600 font-bold">여기를 클릭하여<br />{selectedPhotos.length}장 배정</span>
                                      ) : (
                                        <>우측 갤러리에서<br />드래그 앤 드롭<br />(최대 10장)</>
                                      )}
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Floating Unclassified Photos drawer/modal */}
          {showUnclassifiedDrawer && (
            <div 
              ref={unclassifiedRef}
              style={{ transform: `translate(${unclassifiedPos.current.x}px, ${unclassifiedPos.current.y}px)` }}
              className="absolute inset-x-0 bottom-0 sm:inset-auto sm:right-6 sm:top-24 z-[80] w-full sm:w-[472px] h-[60vh] sm:h-[578px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 select-none"
            >
              {/* Header */}
              <div 
                onMouseDown={handleUnclassifiedMouseDown}
                className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing select-none"
              >
                <div className="flex items-center gap-2">
                  <Camera size={16} className="text-amber-500" />
                  <span className="font-bold text-sm text-slate-800 dark:text-white">
                    {globalPhotoTab === 'document' ? '차량사진 추가 (서류사진 상세)' : '차량사진 추가 (차량사진 상세)'}
                  </span>
                </div>
                <button onClick={() => setShowUnclassifiedDrawer(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500">
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable grid showing all pictures as tiles (overflow-y-auto shows scrollbar ONLY when content overflows) */}
              <div className="flex-1 overflow-y-auto p-4 bg-slate-950">
                <p className="text-[11px] text-slate-400 w-full text-center mb-3 leading-relaxed bg-black/40 py-1.5 rounded">
                  {globalPhotoTab === 'document' 
                    ? '* 말소증 폴더(docs)에 들어있는 미분류 사진들입니다. 마우스로 끌어서 테이블의 말소증 사진 영역에 배정해 주세요.'
                    : '* OCR로 차대번호를 매칭하지 못한 외관 사진들입니다. 마우스로 끌어서 테이블의 데미지 사진 영역에 배정해 주세요.'
                  }
                </p>

                {(globalPhotoTab === 'document' ? pendingPhotos : unclassifiedPhotos).length > 0 ? (
                  <div className="columns-2 gap-3 space-y-3 pb-4">
                    {(globalPhotoTab === 'document' ? pendingPhotos : unclassifiedPhotos).map((url, idx) => (
                      <div
                        key={idx}
                        draggable
                        onDragStart={(e) => handleDragStart(e, url)}
                        onClick={() => {
                          setSelectedPhotos(prev =>
                            prev.includes(url) ? prev.filter(p => p !== url) : [...prev, url]
                          );
                        }}
                        className={`break-inside-avoid relative group rounded-lg shadow border cursor-pointer active:cursor-grabbing transition-all ${selectedPhotos.includes(url)
                          ? 'bg-indigo-900/40 border-indigo-500 ring-2 ring-indigo-500 scale-95'
                          : 'bg-slate-900 border-slate-750 hover:border-indigo-400'
                          }`}
                      >
                        {selectedPhotos.includes(url) && (
                          <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full p-0.5 z-10 shadow-md">
                            <CheckCircle size={16} />
                          </div>
                        )}
                        <div className="rounded overflow-hidden bg-slate-900 relative">
                          <img src={url} alt="Unclassified" className="w-full h-auto object-contain block" />
                        </div>
                        {!selectedPhotos.includes(url) && (
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg pointer-events-none">
                            <GripHorizontal className="text-white drop-shadow-md" size={24} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center flex flex-col items-center justify-center text-slate-400 w-full bg-slate-900/50 rounded-lg border border-dashed border-slate-800">
                    <CheckCircle size={36} className="mb-2 text-emerald-400 opacity-50" />
                    <span className="text-sm font-bold">모든 사진의 분류가 완료되었습니다!</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Photo Viewer (Tile grid displaying all photos in the folder) */}
      {viewerState.isOpen && (
        <div
          ref={viewerRef}
          style={{ transform: `translate(${viewerPos.current.x}px, ${viewerPos.current.y}px)` }}
          className="absolute right-6 top-24 z-[70] w-[472px] h-[578px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 select-none"
        >
          {/* Header (Drag Handle) */}
          <div
            onMouseDown={handleViewerMouseDown}
            className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-blue-500" />
              <span className="font-bold text-sm text-slate-800 dark:text-white">
                {globalPhotoTab === 'document' ? '말소증 사진 목록' : globalPhotoTab === 'vin' ? '차대번호 사진 목록' : '데미지 사진 목록'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                총 {viewerState.photos.length}장
              </div>
              <button onClick={closeViewer} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Grid Area showing all photos as tiles */}
          <div className="flex-1 overflow-y-auto bg-slate-950 p-4">
            <div className="columns-2 gap-3 space-y-3 pb-4">
              {viewerState.photos.map((url, idx) => (
                <div key={idx} className="break-inside-avoid relative group rounded-lg shadow-lg border border-slate-800 bg-slate-900 overflow-hidden">
                  <div className="w-full bg-slate-900 relative rounded overflow-hidden">
                    <img
                      src={url}
                      alt={`상세 사진 ${idx + 1}`}
                      className="w-full h-auto object-contain block"
                    />
                    <button
                      onClick={() => window.open(url, '_blank', 'width=1000,height=800,noopener,noreferrer,resizable=yes')}
                      className="absolute bottom-2 left-2 bg-black/60 hover:bg-black/85 text-white text-[10px] px-2 py-1 rounded transition-colors z-20 font-bold pointer-events-auto"
                    >
                      원본 보기
                    </button>
                    
                    {/* Trash Button for this specific image */}
                    <button
                      onClick={() => {
                        // Custom logic to remove photo at this index
                        setViewerState(prev => {
                          const updatedPhotos = prev.photos.filter((_, pIdx) => pIdx !== idx);
                          
                          // Update vehicle photo list state in vehicles
                          setVehicles(vList => vList.map(v => {
                            if (v.id === prev.vehicleId) {
                              const photoField = globalPhotoTab === 'document'
                                ? 'deregistration_photo_urls'
                                : globalPhotoTab === 'vin'
                                  ? 'vin_photo_urls'
                                  : 'condition_photo_urls';
                              return { ...v, [photoField]: updatedPhotos };
                            }
                            return v;
                          }));

                          // 삭제된 사진을 미분류 사진함으로 이동
                          setUnclassifiedPhotos(prev => [url, ...prev]);
                          setShowUnclassifiedDrawer(true);

                          // Also hit API to update backend
                          const photoFieldForApi = globalPhotoTab === 'document'
                            ? 'deregistration'
                            : globalPhotoTab === 'vin'
                              ? 'vin'
                              : 'condition';
                          
                          fetch(`${API_BASE_URL}/api/files/remove-vehicle-photo`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              vehicleId: prev.vehicleId,
                              photoUrl: url,
                              photoType: photoFieldForApi
                            })
                          }).then(res => res.json())
                            .then(data => {
                              if (data.success) {
                                // fetchVehicles will refresh it, but we already updated local state
                              }
                            }).catch(err => console.error("사진 제거 API 호출 오류:", err));

                          if (updatedPhotos.length === 0) {
                            return { ...prev, isOpen: false, photos: [] };
                          }
                          return { ...prev, photos: updatedPhotos, currentIndex: 0 };
                        });
                      }}
                      title="이 사진을 차량에서 배정 취소하고 미분류함으로 돌려보냅니다."
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-1.5 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 z-20"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer controls */}
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 flex justify-between bg-slate-50 dark:bg-slate-800">
            <span>* 테이블의 입력창과 정보를 바로 비교할 수 있습니다.</span>
          </div>
        </div>
      )}
      <BuyerInfoModal
        isOpen={showBuyerModal}
        onClose={() => setShowBuyerModal(false)}
        buyerInfo={buyerInfo}
        setBuyerInfo={setBuyerInfo}
        onSave={() => {
          setGlobalBuyer(buyerInfo.name);
          setShowBuyerModal(false);
          // TODO: Save buyerInfo to backend
        }}
      />
      <PendingDocsModal
        isOpen={showPendingModal}
        onClose={() => setShowPendingModal(false)}
        unclassifiedPhotos={pendingPhotos.filter(url => url.split('/').pop()?.startsWith('shipper_'))}
        onConfirm={handlePendingDocsConfirm}
      />

      {/* Draft 정산서 발행 폼 (z-[200] 레이어 — 차량 대시보드 위에 표시) */}
      {isDraftOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
            {/* 헤더 */}
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <CreditCard size={18} />
                <div>
                  <h3 className="font-bold text-base">가승인(Draft) 정산서 발행</h3>
                  <p className="text-xs text-slate-300 mt-0.5">B/L: {blNumber}</p>
                </div>
              </div>
              <button onClick={() => setIsDraftOpen(false)} className="text-white/60 hover:text-white transition p-1.5 hover:bg-white/10 rounded-lg">
                <X size={18} />
              </button>
            </div>

            {/* 폼 바디 (스크롤 가능) */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
              {/* 기본 설정 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">화주 (Client)</label>
                  <select
                    value={draftClientId}
                    onChange={e => setDraftClientId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  >
                    {draftClients.map(c => (
                      <option key={c.client_id} value={c.client_id}>{c.client_name}</option>
                    ))}
                    {draftClients.length === 0 && <option value="">화주 정보 로딩 중...</option>}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">적용 환율 (₩/USD)</label>
                  <input
                    type="number"
                    value={draftExchangeRate}
                    onChange={e => setDraftExchangeRate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">인보이스 번호</label>
                  <input
                    type="text"
                    value={draftInvoiceNo}
                    onChange={e => setDraftInvoiceNo(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">납기일 (Due Date)</label>
                  <input
                    type="date"
                    value={draftDueDate}
                    onChange={e => setDraftDueDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:border-indigo-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                </div>
              </div>

              {/* 오류 메시지 */}
              {draftError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-bold">
                  <AlertCircle size={14} />
                  {draftError}
                </div>
              )}

              {/* 계산 중 로딩 */}
              {draftCalculating && (
                <div className="flex items-center justify-center gap-2 py-6 text-indigo-600">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm font-bold">정산 계산 중...</span>
                </div>
              )}

              {/* 계산 결과 */}
              {draftCalcResult && !draftCalculating && (
                <div className="space-y-4">
                  {/* 마스터 요약 */}
                  <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/50 rounded-xl p-4">
                    <div className="text-xs font-bold text-indigo-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Coins size={13} /> 정산 요약
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div className="text-center">
                        <div className="text-xs text-slate-400 font-medium mb-1">적용 환율</div>
                        <div className="font-black text-slate-700 dark:text-slate-300">₩{Number(draftCalcResult.master.exchange_rate).toLocaleString()}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-400 font-medium mb-1">해상 운임</div>
                        <div className="font-black text-indigo-700 dark:text-indigo-300">${Number(draftCalcResult.master.total_ocean_usd).toLocaleString()}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-400 font-medium mb-1">로컬 비용</div>
                        <div className="font-black text-blue-700 dark:text-blue-300">₩{Number(draftCalcResult.master.total_local_krw).toLocaleString()}</div>
                      </div>
                      <div className="text-center col-span-2 sm:col-span-1">
                        <div className="text-xs text-slate-400 font-medium mb-1">최종 청구금액</div>
                        <div className="font-black text-emerald-700 dark:text-emerald-300 text-base">₩{Number(draftCalcResult.master.final_amount_krw).toLocaleString()}</div>
                      </div>
                    </div>
                  </div>

                  {/* 차량별 내역 */}
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 font-bold">VIN</th>
                          <th className="px-3 py-2 font-bold">차종</th>
                          <th className="px-3 py-2 font-bold text-right">해상 운임 (USD)</th>
                          <th className="px-3 py-2 font-bold text-right">로컬 (KRW)</th>
                          <th className="px-3 py-2 font-bold text-right">합계 (KRW)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draftCalcResult.items.map((item: any, i: number) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-mono text-slate-700">{item.vin}</td>
                            <td className="px-3 py-2 text-slate-600">{item.cargo_type}</td>
                            <td className="px-3 py-2 text-right font-semibold text-indigo-600">${Number(item.applied_ocean_usd).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-semibold text-blue-600">₩{(Number(item.applied_lashing_krw)+Number(item.applied_thc_krw)+Number(item.applied_wharfage_krw)+Number(item.applied_inland_krw)).toLocaleString()}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-800">₩{(Math.floor(Number(item.applied_ocean_usd)*Number(draftCalcResult.master.exchange_rate))+Number(item.applied_lashing_krw)+Number(item.applied_thc_krw)+Number(item.applied_wharfage_krw)+Number(item.applied_inland_krw)).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* 푸터 버튼 */}
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 shrink-0 bg-slate-50 dark:bg-slate-900/50">
              <button
                onClick={() => setIsDraftOpen(false)}
                className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                취소
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={draftSaving || !draftCalcResult}
                className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                {draftSaving ? <><Loader2 size={15} className="animate-spin" /> 저장 중...</> : <><Sparkles size={15} /> 가승인 정산서 발행</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
