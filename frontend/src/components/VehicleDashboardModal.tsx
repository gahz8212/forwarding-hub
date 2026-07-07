import React, { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { X, Camera, Search, CheckCircle, Truck, Ship, AlertTriangle, Upload, FileImage, Loader2, Send, GripHorizontal, ChevronLeft, ChevronRight, Save, Trash2, BellRing } from "lucide-react";
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

interface Props {
  shipmentId: number;
  blNumber: string;
  onClose: () => void;
}

const formatDateToSlash = (val?: string) => {
  if (!val) return "";
  const dateOnly = val.includes('T') ? val.split('T')[0] : val;
  return dateOnly.replace(/-/g, '/');
};

export default function VehicleDashboardModal({ shipmentId, blNumber, onClose }: Props) {
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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingViewer) return;
      const dx = e.clientX - viewerDragStart.current.x;
      const dy = e.clientY - viewerDragStart.current.y;

      const newX = viewerStartPos.current.x + dx;
      const newY = viewerStartPos.current.y + dy;

      viewerPos.current = { x: newX, y: newY };
      if (viewerRef.current) {
        viewerRef.current.style.transform = `translate(${newX}px, ${newY}px)`;
      }
    };

    const handleMouseUp = () => {
      setIsDraggingViewer(false);
    };

    if (isDraggingViewer) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingViewer]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, skipOcr: boolean = false) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    formData.append("shipmentId", shipmentId.toString());
    formData.append("blNumber", blNumber);
    if (skipOcr) {
      formData.append("skipOcr", "true");
    }

    Array.from(files).slice(0, 50).forEach(file => {
      formData.append("photos", file);
    });

    try {
      const response = await fetch("http://localhost:5000/api/files/upload-vehicle-photos", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (data.success) {
        const ocrResults = data.data; // Backend processedResults

        const newVehiclesMap = new Map<string, Vehicle>();
        const newUnclassified: string[] = [];

        // 프론트엔드 File 객체 목록 (인덱스 매칭용)
        const fileArray = Array.from(files);

        ocrResults.forEach((res: any, index: number) => {
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
            // 차대번호를 못 찾은 사진(외관 사진 등)은 미분류함으로
            if (serverUrl) {
              newUnclassified.push(serverUrl);
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

        setUnclassifiedPhotos(prev => [...prev, ...newUnclassified]);

        if (skipOcr) {
          alert(`⚡ 고속 업로드 완료!\n미분류(외관) 사진 ${newUnclassified.length}장이 추가되었습니다.`);
        } else {
          alert(`🎉 OCR 분석 완료!\n인식된 차량 대수: ${newVehiclesMap.size}대\n미분류(외관) 사진: ${newUnclassified.length}장`);
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
      const response = await fetch(`http://localhost:5000/api/tracking/shipments/${shipmentId}/send-pdf`, {
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
      const response = await fetch(`http://localhost:5000/api/tracking/vehicles/vin/${encodeURIComponent(vin)}`);
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
      const response = await fetch(`http://localhost:5000/api/tracking/vehicles/vin/${encodeURIComponent(vin)}`);
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
      const response = await fetch(`http://localhost:5000/api/tracking/vehicles/${vehicleId}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
      const res = await response.json();
      if (res.success) {
        fetchVehicles();
      } else {
        alert("상태 변경 실패: " + res.message);
      }
    } catch (err) {
      console.error("차량 상태 변경 에러:", err);
      alert("차량 상태 변경 중 에러가 발생했습니다.");
    }
  };

  const handlePendingDocsConfirm = async (selectedUrls: string[]) => {
    try {
      const response = await fetch(`http://localhost:5000/api/files/analyze-pending-photos`, {
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
      const response = await fetch(`http://localhost:5000/api/tracking/vehicles/${shipmentId}/save-all`, {
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
        // 저장 후 남아있는(정리된) 뱃지나 미분류 사진 등을 최신화
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

    setUnclassifiedPhotos(unclass => unclass.filter(url => !photosToAdd.includes(url)));
    setSelectedPhotos([]);

    setVehicles(prev => prev.map(v => {
      if (v.id === vehicleId) {
        const uniquePhotosToAdd = photosToAdd.filter(url => !(v[photoField] || []).includes(url));
        return { ...v, [photoField]: [...(v[photoField] || []), ...uniquePhotosToAdd] };
      }
      return v;
    }));

    try {
      const response = await fetch(`http://localhost:5000/api/tracking/vehicles/${vehicleId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrls: photosToAdd,
          type: globalPhotoTab
        })
      });
      const data = await response.json();
      if (data.success) {
        const updatedUrls = data.data.map((u: string) => u.startsWith('http') ? u : `http://localhost:5000${u}`);
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

    viewerPos.current = { x: 0, y: 0 }; // Reset ref position
    if (viewerRef.current) {
      viewerRef.current.style.transform = 'translate(0px, 0px)'; // Reset DOM element style directly
    }
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

    setUnclassifiedPhotos(prev => [photoToRemove, ...prev]);

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
      await fetch(`http://localhost:5000/api/tracking/vehicles/${vehicleId}/photos/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoUrl: photoToRemove,
          type: globalPhotoTab
        })
      });
    } catch (err) {
      console.error("사진 배정 해제 API 에러:", err);
    }
  };

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:5000/api/tracking/vehicles/${shipmentId}`);
      const data = await res.json();
      if (data.success) {
        const list = data.data || [];
        setVehicles(list);
        for (const v of list) {
          if (v.vin && v.vin.length === 17 && (!v.model || !v.length)) {
            autoVinLookup(v.id, v.vin);
          }
        }
      }
    } catch (err) {
      console.error("차량 목록 조회 실패:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUnclassifiedPhotos = async () => {
    try {
      const res = await fetch(`http://localhost:5000/api/files/unclassified-photos/${blNumber}`);
      const data = await res.json();
      if (data.success) {
        const isArr = Array.isArray(data.data);
        const extPhotos = isArr ? data.data : (data.data.exterior || []);
        const docPhotos = isArr ? [] : (data.data.docs || []);

        setUnclassifiedPhotos(extPhotos);
        setPendingPhotos(docPhotos);
      }
    } catch (err) {
      console.error("미분류 사진 조회 실패:", err);
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchUnclassifiedPhotos();

    const socket = io("http://localhost:5000");
    socket.emit("join", { role: "admin" });

    socket.on("new_shipper_docs_alert", (data) => {
      // If the currently open dashboard matches the shipment that received photos
      if (data.blNumber === blNumber || data.shipmentId === shipmentId) {
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
      const response = await fetch(`http://localhost:5000/api/tracking/vehicles/${shipmentId}/reset?blNumber=${encodeURIComponent(blNumber)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        alert("모든 데이터가 초기화되었습니다.");
        setVehicles([]);
        setUnclassifiedPhotos([]);
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900">
      <div className="bg-white dark:bg-slate-900 w-full h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex flex-col p-4 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900 relative">
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
            <X size={20} className="text-slate-500" />
          </button>

          <h2 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2 mb-4">
            차량 관리 대시보드
            {pendingPhotos.length > 0 && (
              <button
                onClick={() => setShowPendingModal(true)}
                className="ml-4 flex items-center gap-1.5 bg-rose-50 border border-rose-200 text-rose-600 px-4 py-2 rounded-full text-sm font-bold hover:bg-rose-100 transition-colors animate-pulse shadow-sm"
              >
                <BellRing size={16} className="animate-bounce" />
                화주 대기 서류 {pendingPhotos.length}장 확인
              </button>
            )}
          </h2>

          {/* Controls Bar */}
          <div className="flex items-end justify-between w-full pr-10">
            {/* Left Controls (BL & Buyer) */}
            <div className="flex items-center gap-6">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">B/L Number</span>
                <span className="font-mono text-lg font-black text-blue-700 dark:text-blue-400">{blNumber}</span>
              </div>

              <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Buyer</span>
                <button
                  onClick={() => setShowBuyerModal(true)}
                  className={`text-left text-sm px-3 py-2 border ${globalBuyer ? 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800' : 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20'} rounded focus:border-indigo-500 w-56 transition-colors text-slate-700 dark:text-slate-300 overflow-hidden text-ellipsis whitespace-nowrap`}
                >
                  {globalBuyer || <span className="text-blue-500 dark:text-blue-400 font-medium">수입자(바이어) 정보 입력...</span>}
                </button>
              </div>

              <div className="h-8 w-px bg-slate-200 dark:bg-slate-700"></div>

              <div className="flex flex-col gap-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Vehicles</span>
                <span className="font-mono text-lg font-black text-indigo-600 dark:text-indigo-400">
                  총 {vehicles.length}대의 차량이 등록되었습니다.
                </span>
              </div>
            </div>

            {/* Right Controls (Buttons) */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleReset}
                disabled={loading}
                className="flex items-center gap-1.5 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 px-4 py-2 rounded text-sm font-bold transition-colors disabled:opacity-50 border border-red-200 dark:border-red-800"
              >
                <Trash2 size={16} />
                초기화
              </button>

              <div className="flex gap-1.5">
                <button
                  onClick={handleSaveAll}
                  disabled={isSaveDisabled || loading}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  title={isSaveDisabled ? "차량번호 '?' 수정 및 구동상태를 모두 선택해야 저장할 수 있습니다." : "모든 변경사항 저장"}
                >
                  <Save size={16} />
                  전체 저장
                </button>

                <button
                  onClick={handleGeneratePDF}
                  disabled={isSending || loading}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-bold transition-colors disabled:opacity-50 shadow-sm"
                  title="바이어 정보를 기반으로 PDF 서류 생성 및 카카오톡 발송"
                >
                  <Send size={16} />
                  {isSending ? "전송 중..." : "PDF 전송"}
                </button>

                <div className="flex bg-slate-100 dark:bg-slate-800 rounded p-1 ml-1 border border-slate-200 dark:border-slate-700">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.zip"
                    className="hidden"
                    ref={fastFileInputRef}
                    onChange={(e) => handleFileUpload(e, true)}
                  />
                  <button
                    onClick={() => fastFileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 bg-white dark:bg-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-sm text-sm font-bold shadow-sm transition-colors disabled:opacity-50 border border-slate-200 dark:border-slate-600 mr-1"
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <span className="text-amber-500">⚡</span>}
                    외관사진 추가
                  </button>

                  <input
                    type="file"
                    multiple
                    accept="image/*,.zip"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={(e) => handleFileUpload(e, false)}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-sm text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <FileImage size={16} />}
                    {uploading ? "분석 중..." : "차량 등록"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Table Area */}
          <div className="flex-1 overflow-auto p-4 bg-slate-50 dark:bg-slate-950/50 border-r border-slate-200 dark:border-slate-800">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-auto shadow-sm max-h-[540px]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-3 font-bold w-56">차대번호 (VIN)</th>
                      <th className="p-3 font-bold w-[650px]">제원 및 단가 정보</th>
                      <th className="p-3 font-bold w-32">구동 여부</th>
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
                            {/* <button
                              onClick={() => setGlobalPhotoTab('vin')}
                              className={`px-2 py-0.5 rounded transition-colors ${globalPhotoTab === 'vin' ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
                            >
                              차대
                            </button> */}
                          </div>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {vehicles.map((v, idx) => {
                      const isAlertRow = v.plate_number?.includes('?') || !v.drivability;
                      const isEven = idx % 2 === 0;
                      const rowBgClass = isAlertRow
                        ? (isEven ? 'bg-red-100/30 dark:bg-red-950/20' : 'bg-red-50/60 dark:bg-red-950/10')
                        : (isEven ? 'bg-white dark:bg-slate-900' : 'bg-gray-50 dark:bg-slate-800/30');

                      const isCurrentViewingRow = viewerState.isOpen && viewerState.vehicleId === v.id;

                      return (
                        <tr key={v.id} className={`transition-colors hover:bg-yellow-50 dark:hover:bg-yellow-950/10 ${rowBgClass} ${isCurrentViewingRow ? 'shadow-[0_4px_20px_rgba(239,68,68,0.15)]' : ''}`}>
                          <td className={`p-3 align-top transition-all duration-150 ${isCurrentViewingRow ? 'border-l-4 border-y-2 border-red-500 bg-red-50/20 dark:bg-red-950/10' : ''}`}>
                            <div className="flex gap-1.5 items-center mb-2">
                              <input
                                type="text"
                                maxLength={17}
                                value={v.vin || ""}
                                onChange={(e) => handleInputChange(v.id, "vin", e.target.value)}
                                placeholder="차대번호 입력"
                                className="font-mono font-black text-[16px] text-slate-900 dark:text-white flex-1 min-w-0 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors"
                              />
                              <button
                                onClick={() => handleVinLookup(v.id, v.vin || "")}
                                disabled={vinLoadingId === v.id}
                                className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg transition-colors flex items-center justify-center shrink-0 disabled:bg-slate-300"
                                title="차대번호 제원 조회"
                              >
                                {vinLoadingId === v.id ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : (
                                  <Search size={16} />
                                )}
                              </button>
                            </div>
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <select
                                value={v.status || "Pending"}
                                onChange={(e) => handleVehicleStatusChange(v.id, e.target.value, v.status || "Pending")}
                                className="px-2 py-1 text-xs font-bold rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-750 dark:text-slate-200 focus:border-blue-500 outline-none transition-colors"
                              >
                                <option value="Pending">대기중</option>
                                <option value="Trucking">운송중</option>
                                <option value="Yard In">야드반입</option>
                                <option value="Loaded">선적완료</option>
                              </select>
                              {getStatusBadge(v.status)}
                            </div>
                          </td>
                          <td className={`p-3 align-top transition-all duration-150 ${isCurrentViewingRow ? 'border-y-2 border-red-500 bg-red-50/20 dark:bg-red-950/10' : ''}`}>
                            {/* 차명, 연식, 수출단가 한 행 구성 */}
                            <div className="flex items-center gap-3 mb-4 text-sm">
                              {/* 차명 (모델명) */}
                              <div className="flex items-center gap-1.5 flex-[2.5] min-w-0">
                                <span className="font-bold text-slate-600 dark:text-slate-400 shrink-0">차명:</span>
                                <input
                                  type="text"
                                  value={v.model || ""}
                                  onChange={(e) => handleInputChange(v.id, "model", e.target.value)}
                                  placeholder="차명 (모델명)"
                                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors font-bold text-slate-700 dark:text-slate-200 text-sm"
                                />
                              </div>

                              {/* 연식 */}
                              <div className="flex items-center gap-1.5 flex-[1.2] min-w-0">
                                <span className="font-bold text-slate-600 dark:text-slate-400 shrink-0">연식:</span>
                                <select
                                  value={v.year || ""}
                                  onChange={(e) => handleInputChange(v.id, "year", e.target.value ? parseInt(e.target.value, 10) : null)}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors text-slate-700 dark:text-slate-200 text-sm"
                                >
                                  <option value="">선택</option>
                                  {Array.from({ length: 45 }, (_, i) => new Date().getFullYear() + 1 - i).map(year => (
                                    <option key={year} value={year}>{year}년</option>
                                  ))}
                                </select>
                              </div>

                              {/* 수출단가 */}
                              <div className="flex items-center gap-1.5 flex-[1.8] min-w-0">
                                <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">단가:</span>
                                <div className="relative w-full">
                                  <span className="absolute left-2 top-2 text-xs font-bold text-slate-400">$</span>
                                  <input
                                    type="number"
                                    placeholder="단가 (USD)"
                                    value={v.price || ""}
                                    onChange={(e) => handleInputChange(v.id, "price", e.target.value ? parseFloat(e.target.value) : "")}
                                    className="w-full pl-5 pr-1.5 py-1.5 border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/10 rounded outline-none focus:border-emerald-500 transition-colors font-bold text-emerald-600 dark:text-emerald-400 text-sm"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* CBM / 중량 기본 표시 및 상세 제원 펼치기 버튼 */}
                            <div className="mt-2 flex justify-between items-center bg-slate-50 dark:bg-slate-850 px-3 py-2 rounded-lg border border-slate-200/60 dark:border-slate-800">
                              <div className="flex gap-4 text-xs font-bold items-center">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 font-medium">부피:</span>
                                  <span className="text-blue-600 dark:text-blue-400 font-black text-sm">{v.cbm || 0} CBM</span>
                                </div>
                                <div className="border-l border-slate-200 dark:border-slate-700 h-4" />
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-500 font-medium">중량:</span>
                                  <span className="text-slate-700 dark:text-slate-300 font-black text-sm">
                                    {v.weight ? `${Number(v.weight).toLocaleString()} kg` : "0 kg"}
                                    <span className="text-xs font-bold text-slate-400 ml-1">({((v.weight || 0) / 1000).toFixed(3)} Ton)</span>
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleVehicleExpand(v.id)}
                                className="text-xs font-extrabold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline flex items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 rounded-lg shadow-sm transition-all"
                              >
                                {expandedVehicles[v.id] ? "제원 편집 접기" : "상세 제원 / 실측 입력"}
                              </button>
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
                                      className={`flex-1 min-w-0 px-2.5 py-1.5 text-sm border rounded outline-none transition-colors ${v.plate_number?.includes('?')
                                        ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 focus:border-red-600 focus:ring-1 focus:ring-red-500'
                                        : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-blue-500'
                                        }`}
                                    />
                                  </div>
                                  <div className="flex items-center text-sm">
                                    <span className="w-16 font-bold text-slate-600 dark:text-slate-400 shrink-0">제작사:</span>
                                    <input
                                      type="text"
                                      value={v.make || ""}
                                      onChange={(e) => handleInputChange(v.id, "make", e.target.value)}
                                      className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors"
                                    />
                                  </div>
                                  <div className="flex items-center text-sm">
                                    <span className="w-16 font-bold text-slate-600 dark:text-slate-400 shrink-0">최초등록:</span>
                                    <input
                                      type="text"
                                      value={formatDateToSlash(v.initial_registration_date)}
                                      onChange={(e) => handleInputChange(v.id, "initial_registration_date", e.target.value)}
                                      className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors"
                                    />
                                  </div>
                                  <div className="flex items-center text-sm">
                                    <span className="w-16 font-bold text-slate-600 dark:text-slate-400 shrink-0">차종:</span>
                                    <input
                                      type="text"
                                      value={v.vehicle_type || ""}
                                      onChange={(e) => handleInputChange(v.id, "vehicle_type", e.target.value)}
                                      className="flex-1 min-w-0 px-2.5 py-1.5 text-sm border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 transition-colors"
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
                                      className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-white font-bold outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-slate-500">전폭 (W, mm)</span>
                                    <input
                                      type="number"
                                      value={v.width || ""}
                                      onChange={(e) => handleInputChange(v.id, "width", e.target.value ? parseInt(e.target.value, 10) : "")}
                                      placeholder="전폭"
                                      className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-white font-bold outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-slate-500">전고 (H, mm)</span>
                                    <input
                                      type="number"
                                      value={v.height || ""}
                                      onChange={(e) => handleInputChange(v.id, "height", e.target.value ? parseInt(e.target.value, 10) : "")}
                                      placeholder="전고"
                                      className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-white font-bold outline-none focus:border-blue-500"
                                    />
                                  </div>
                                  <div className="flex flex-col gap-1">
                                    <span className="text-[11px] font-black text-slate-500">중량 (Weight, kg)</span>
                                    <input
                                      type="number"
                                      value={v.weight || ""}
                                      onChange={(e) => handleInputChange(v.id, "weight", e.target.value ? parseFloat(e.target.value) : "")}
                                      placeholder="중량"
                                      className="w-full px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-800 dark:text-white font-bold outline-none focus:border-blue-500"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className={`p-3 align-top transition-all duration-150 ${isCurrentViewingRow ? 'border-y-2 border-red-500 bg-red-50/20 dark:bg-red-950/10' : ''}`}>
                            <div className="flex flex-col gap-2.5">
                              {getDrivabilityIcon(v.drivability)}
                              <div className="flex flex-col gap-2 mt-1 border-t border-slate-200 dark:border-slate-700 pt-2">
                                {["Running", "Towing", "Forklift"].map(status => (
                                  <label key={status} className="flex items-center gap-1.5 text-sm cursor-pointer text-slate-700 dark:text-slate-300 hover:text-blue-600 transition-colors">
                                    <input
                                      type="radio"
                                      name={`drivability-${v.id}`}
                                      value={status}
                                      checked={v.drivability === status}
                                      onChange={(e) => handleInputChange(v.id, "drivability", e.target.value)}
                                      className="cursor-pointer accent-blue-600 h-4 w-4"
                                    />
                                    {status === 'Running' ? '운행 가능' : status === 'Towing' ? '견인 필요' : '지게차 필요'}
                                  </label>
                                ))}
                              </div>
                            </div>
                          </td>
                          <td
                            className={`p-3 transition-all duration-150 ${isCurrentViewingRow ? 'border-r-4 border-y-2 border-red-500 bg-red-50/20 dark:bg-red-950/10' : ''}`}
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

          {/* Unclassified Photos Sidebar */}
          <div className="w-80 bg-slate-50 dark:bg-slate-900 shrink-0 flex flex-col p-4 overflow-y-auto">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base mb-1.5 flex items-center gap-2">
              <Camera size={18} className="text-amber-500" />
              미분류 사진함
            </h3>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              OCR로 차대번호를 매칭하지 못한 외관 사진들입니다. 표의 데미지 사진 영역으로 마우스로 끌어서 배정해 주세요.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {unclassifiedPhotos.length > 0 ? (
                unclassifiedPhotos.map((url, idx) => (
                  <div
                    key={idx}
                    draggable
                    onDragStart={(e) => handleDragStart(e, url)}
                    onClick={() => {
                      setSelectedPhotos(prev =>
                        prev.includes(url) ? prev.filter(p => p !== url) : [...prev, url]
                      );
                    }}
                    className={`relative group p-1 rounded-lg shadow-sm border cursor-pointer active:cursor-grabbing transition-all ${selectedPhotos.includes(url)
                      ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500 scale-95'
                      : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                      }`}
                  >
                    {selectedPhotos.includes(url) && (
                      <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full p-0.5 z-10 shadow-md">
                        <CheckCircle size={16} />
                      </div>
                    )}
                    <div className="aspect-square rounded overflow-hidden bg-slate-100 relative">
                      <img src={url} alt="Unclassified" className="w-full h-full object-cover" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openViewer(0, [url]);
                        }}
                        className="absolute bottom-1 right-1 bg-black/60 hover:bg-black/85 text-white p-1 rounded transition-colors z-20"
                        title="크게 보기"
                      >
                        <Search size={12} />
                      </button>
                    </div>
                    {!selectedPhotos.includes(url) && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg pointer-events-none">
                        <GripHorizontal className="text-white drop-shadow-md" size={24} />
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="col-span-2 py-10 text-center flex flex-col items-center justify-center text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                  <CheckCircle size={24} className="mb-2 text-emerald-400 opacity-50" />
                  <span className="text-xs font-bold">모두 분류됨</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Photo Viewer (Does not block layout) */}
      {viewerState.isOpen && (
        <div
          ref={viewerRef}
          style={{ transform: `translate(${viewerPos.current.x}px, ${viewerPos.current.y}px)` }}
          className="absolute right-80 bottom-4 z-[70] w-[675px] h-[825px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-200 select-none"
        >
          {/* Header (Drag Handle) */}
          <div
            onMouseDown={handleViewerMouseDown}
            className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center border-b border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2">
              <Camera size={16} className="text-blue-500" />
              <span className="font-bold text-sm text-slate-800 dark:text-white">
                {globalPhotoTab === 'document' ? '말소증 사진 상세' : globalPhotoTab === 'vin' ? '차대번호 사진 상세' : '데미지 사진 상세'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs font-mono bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-full">
                {viewerState.currentIndex + 1} / {viewerState.photos.length}
              </div>
              <button onClick={closeViewer} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-slate-500">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Image Area */}
          <div className="flex-1 overflow-auto bg-slate-950 flex items-center justify-center relative p-2">
            <img
              src={viewerState.photos[viewerState.currentIndex]}
              alt="상세 사진"
              className="max-w-full max-h-full object-contain"
            />
            {/* Left/Right controls inside floating panel */}
            {viewerState.photos.length > 1 && (
              <>
                <button
                  onClick={() => navigateViewer(-1)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-2 rounded-full hover:bg-black/85 transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => navigateViewer(1)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-2 rounded-full hover:bg-black/85 transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </>
            )}

            {/* Float-specific Photo Delete Button */}
            <button
              onClick={removeCurrentPhoto}
              title="이 사진을 차량에서 배정 취소하고 미분류함으로 돌려보냅니다."
              className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white p-2 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105"
            >
              <Trash2 size={16} />
            </button>
          </div>

          {/* Footer controls */}
          <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 flex justify-between bg-slate-50 dark:bg-slate-800">
            <span>* 테이블의 입력창과 정보를 바로 비교할 수 있습니다.</span>
            <a
              href={viewerState.photos[viewerState.currentIndex]}
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 font-bold hover:underline"
            >
              원본 보기
            </a>
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
        unclassifiedPhotos={pendingPhotos}
        onConfirm={handlePendingDocsConfirm}
      />
    </div>
  );
}
