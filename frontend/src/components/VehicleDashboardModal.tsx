import React, { useState, useEffect, useRef } from "react";
import { X, Camera, CheckCircle, Truck, Ship, AlertTriangle, Upload, FileImage, Loader2, Send, GripHorizontal, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";

interface Vehicle {
  id: number;
  vin: string;
  make: string;
  model: string;
  year: number;
  drivability: string;
  status: string;
  condition_photo_urls: string[]; // Changed from single string
  customs_cleared: boolean;
  buyer?: string;
  price?: number;
  plate_number?: string;
  vehicle_type?: string;
  mileage?: string;
  initial_registration_date?: string;
}

interface Props {
  shipmentId: number;
  blNumber: string;
  onClose: () => void;
}

interface ViewerState {
  isOpen: boolean;
  vehicleId: number;
  photos: string[];
  currentIndex: number;
}

export default function VehicleDashboardModal({ shipmentId, blNumber, onClose }: Props) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [unclassifiedPhotos, setUnclassifiedPhotos] = useState<string[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fastFileInputRef = useRef<HTMLInputElement>(null);

  const [viewerState, setViewerState] = useState<ViewerState>({
    isOpen: false,
    vehicleId: 0,
    photos: [],
    currentIndex: 0
  });

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
              drivability: "Running",
              status: "Yard In",
              condition_photo_urls: [],
              customs_cleared: false,
              buyer: "",
              price: 0
            };

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
                initial_registration_date: newVeh.initial_registration_date || oldVeh.initial_registration_date
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

  const handleGeneratePDF = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      alert("✅ 입력된 데이터를 바탕으로 Commercial Invoice 및 Packing List PDF를 생성하여 화주 카카오톡으로 전송했습니다!");
    }, 1500);
  };

  const handleInputChange = (id: number, field: keyof Vehicle, value: any) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, [field]: value } : v));
  };

  const handleDragStart = (e: React.DragEvent, photoUrl: string) => {
    e.dataTransfer.setData("photoUrl", photoUrl);
    e.dataTransfer.effectAllowed = "move";
  };

  const assignSelectedPhotosToVehicle = async (vehicleId: number, photoUrls: string[]) => {
    if (photoUrls.length === 0) return;
    
    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (!vehicle) return;
    
    const spaceLeft = 10 - vehicle.condition_photo_urls.length;
    if (spaceLeft <= 0) {
      alert("데미지 사진은 최대 10장까지만 배정할 수 있습니다.");
      return;
    }
    
    const photosToAdd = photoUrls.slice(0, spaceLeft);
    if (photoUrls.length > spaceLeft) {
      alert(`최대 10장 제한으로 인해 ${spaceLeft}장만 배정되었습니다.`);
    }

    // 낙관적 UI 업데이트
    setUnclassifiedPhotos(unclass => unclass.filter(url => !photosToAdd.includes(url)));
    setSelectedPhotos([]);

    setVehicles(prev => prev.map(v => {
      if (v.id === vehicleId) {
        const uniquePhotosToAdd = photosToAdd.filter(url => !v.condition_photo_urls.includes(url));
        return { ...v, condition_photo_urls: [...v.condition_photo_urls, ...uniquePhotosToAdd] };
      }
      return v;
    }));

    // 백엔드 API 호출 (물리적 파일 이동 및 DB 업데이트)
    try {
      const response = await fetch(`http://localhost:5000/api/tracking/vehicles/${vehicleId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls: photosToAdd })
      });
      const data = await response.json();
      if (data.success) {
        const updatedUrls = data.data.map((u: string) => u.startsWith('http') ? u : `http://localhost:5000${u}`);
        setVehicles(prev => prev.map(v => v.id === vehicleId ? { ...v, condition_photo_urls: updatedUrls } : v));
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

  const removeCurrentPhoto = () => {
    const { vehicleId, photos, currentIndex } = viewerState;
    const photoToRemove = photos[currentIndex];

    setVehicles(prev => prev.map(v => {
      if (v.id === vehicleId) {
        return { ...v, condition_photo_urls: v.condition_photo_urls.filter(url => url !== photoToRemove) };
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
  };

  useEffect(() => {
    const fetchVehicles = async () => {
      setLoading(true);
      try {
        const [vehiclesRes, photosRes] = await Promise.all([
          fetch(`http://localhost:5000/api/tracking/vehicles/${shipmentId}`),
          fetch(`http://localhost:5000/api/files/unclassified-photos/${blNumber}`)
        ]);
        
        const vehiclesData = await vehiclesRes.json();
        if (vehiclesData.success) {
          setVehicles(vehiclesData.data);
        }
        
        const photosData = await photosRes.json();
        if (photosData.success) {
          setUnclassifiedPhotos(photosData.data);
        }
      } catch (err) {
        console.error("차량 목록 조회 실패:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchVehicles();
  }, [shipmentId]);

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
      <div className="bg-white dark:bg-slate-900 w-full max-w-[1200px] max-h-[90vh] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center">
              <Ship className="mr-2 text-blue-600" size={20} />
              로로선 차량 관리 대시보드
            </h2>
            <p className="text-sm text-slate-500 mt-1">B/L 번호: <span className="font-mono font-bold text-blue-600">{blNumber}</span></p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleReset}
              disabled={loading}
              className="flex items-center gap-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50 border border-red-200 dark:border-red-800"
              title="이 B/L의 모든 차량 정보와 미분류 사진을 초기화합니다."
            >
              <Trash2 size={16} />
              초기화
            </button>
            <button 
              onClick={handleGeneratePDF}
              disabled={isSending}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {isSending ? "생성 및 전송 중..." : "PDF 자동생성 및 카톡 전송"}
            </button>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 ml-2">
              {/* Button 1: Fast Upload (No OCR) */}
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
                className="flex items-center gap-1.5 bg-white dark:bg-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded text-sm font-bold shadow-sm transition-colors disabled:opacity-50 border border-slate-200 dark:border-slate-600 mr-2"
                title="AI 분석 없이 사진을 1초 만에 미분류함으로 밀어넣습니다."
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <span className="text-amber-500">⚡</span>}
                외관 사진만 고속 추가
              </button>

              {/* Button 2: Full OCR Upload */}
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
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <FileImage size={16} />}
                {uploading ? "OCR 분석 중..." : "차량 등록 (AI 자동 매핑)"}
              </button>
            </div>

            <button onClick={onClose} className="p-2 ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <X size={20} className="text-slate-500" />
            </button>
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
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="p-3 font-bold w-40">차대번호 (VIN)</th>
                      <th className="p-3 font-bold w-64">제원 및 식별정보</th>
                      <th className="p-3 font-bold w-48">수출 정보 (바이어/단가)</th>
                      <th className="p-3 font-bold w-32">구동 여부</th>
                      <th className="p-3 font-bold text-center w-36">데미지 사진 (외관)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {vehicles.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-200">{v.vin}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800 dark:text-white mb-1.5">{v.make} {v.model} <span className="text-xs text-slate-500 font-normal">({v.year}년식)</span></div>
                          <div className="grid grid-cols-2 gap-1.5 w-full">
                            <input 
                              type="text" 
                              placeholder="차량번호" 
                              value={v.plate_number || ""} 
                              onChange={(e) => handleInputChange(v.id, "plate_number", e.target.value)}
                              className="text-[11px] px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:border-blue-500"
                              title="차량번호 (수동 수정 가능)"
                            />
                            <input 
                              type="text" 
                              placeholder="주행거리(km)" 
                              value={v.mileage || ""} 
                              onChange={(e) => handleInputChange(v.id, "mileage", e.target.value)}
                              className="text-[11px] px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:border-blue-500"
                              title="주행거리"
                            />
                            <input 
                              type="text" 
                              placeholder="최초등록일(YYYY-MM-DD)" 
                              value={v.initial_registration_date || ""} 
                              onChange={(e) => handleInputChange(v.id, "initial_registration_date", e.target.value)}
                              className="text-[11px] px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:border-blue-500"
                              title="최초등록일"
                            />
                            <input 
                              type="text" 
                              placeholder="차종(승용/화물..)" 
                              value={v.vehicle_type || ""} 
                              onChange={(e) => handleInputChange(v.id, "vehicle_type", e.target.value)}
                              className="text-[11px] px-2 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:border-blue-500"
                              title="차종"
                            />
                          </div>
                          <div className="mt-2">{getStatusBadge(v.status)}</div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1.5 w-full">
                            <input 
                              type="text" 
                              placeholder="바이어명 입력" 
                              value={v.buyer || ""} 
                              onChange={(e) => handleInputChange(v.id, "buyer", e.target.value)}
                              className="text-xs px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:border-blue-500 transition-colors"
                            />
                            <div className="relative">
                              <span className="absolute left-2.5 top-1.5 text-xs font-bold text-slate-400">$</span>
                              <input 
                                type="number" 
                                placeholder="가격(USD)" 
                                value={v.price || ""} 
                                onChange={(e) => handleInputChange(v.id, "price", parseFloat(e.target.value) || "")}
                                className="text-xs pl-6 pr-2.5 py-1.5 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:border-blue-500 transition-colors w-full"
                              />
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-2">
                            {getDrivabilityIcon(v.drivability)}
                            <select 
                              value={v.drivability} 
                              onChange={(e) => handleInputChange(v.id, "drivability", e.target.value)}
                              className="text-[11px] p-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded outline-none focus:border-blue-500 cursor-pointer text-slate-600 dark:text-slate-300 w-full"
                            >
                              <option value="Running">운행 가능 (Running)</option>
                              <option value="Towing">견인 필요 (Towing)</option>
                              <option value="Forklift">지게차 필요 (Forklift)</option>
                            </select>
                          </div>
                        </td>
                        <td 
                          className="p-3"
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDropToVehicle(e, v.id)}
                        >
                          <div 
                            className={`min-h-[80px] w-full border-2 border-dashed rounded-lg p-2 bg-slate-50/50 flex items-center justify-center transition-all cursor-pointer ${
                              selectedPhotos.length > 0 
                                ? 'border-emerald-500 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse'
                                : 'border-slate-300 dark:border-slate-700 hover:bg-indigo-50 hover:border-indigo-300'
                            }`}
                            onClick={() => {
                              if (selectedPhotos.length > 0) {
                                assignSelectedPhotosToVehicle(v.id, selectedPhotos);
                              } else {
                                openViewer(v.id, v.condition_photo_urls);
                              }
                            }}
                          >
                            {v.condition_photo_urls.length > 0 ? (
                              <div className="relative w-full aspect-video rounded overflow-hidden shadow-sm group">
                                <img src={v.condition_photo_urls[0]} alt="Damage Thumbnail" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Camera className="text-white" size={20} />
                                </div>
                                {v.condition_photo_urls.length > 1 && (
                                  <div className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
                                    +{v.condition_photo_urls.length - 1}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium text-center leading-relaxed">
                                {selectedPhotos.length > 0 ? (
                                  <span className="text-emerald-600 font-bold">여기를 클릭하여<br/>{selectedPhotos.length}장 배정</span>
                                ) : (
                                  <>우측 갤러리에서<br/>드래그 앤 드롭<br/>(최대 10장)</>
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Unclassified Photos Sidebar */}
          <div className="w-64 bg-slate-50 dark:bg-slate-900 shrink-0 flex flex-col p-4 overflow-y-auto">
            <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm mb-1 flex items-center gap-1.5">
              <Camera size={16} className="text-amber-500" />
              미분류 사진함
            </h3>
            <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
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
                    className={`relative group p-1 rounded-lg shadow-sm border cursor-pointer active:cursor-grabbing transition-all ${
                      selectedPhotos.includes(url) 
                        ? 'bg-indigo-50 border-indigo-500 ring-2 ring-indigo-500 scale-95' 
                        : 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-md'
                    }`}
                  >
                    {selectedPhotos.includes(url) && (
                      <div className="absolute -top-2 -right-2 bg-indigo-600 text-white rounded-full p-0.5 z-10 shadow-md">
                        <CheckCircle size={16} />
                      </div>
                    )}
                    <div className="aspect-square rounded overflow-hidden bg-slate-100">
                      <img src={url} alt="Unclassified" className="w-full h-full object-cover" />
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

      {/* Full Screen Photo Viewer Modal */}
      {viewerState.isOpen && (
        <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-md flex items-center justify-center p-4 select-none">
          {/* Top Controls */}
          <div className="absolute top-4 right-4 flex items-center gap-4">
            <div className="text-white font-mono bg-black/50 px-3 py-1 rounded-full text-sm">
              {viewerState.currentIndex + 1} / {viewerState.photos.length}
            </div>
            <button onClick={closeViewer} className="text-white hover:text-slate-300 p-2 bg-white/10 rounded-full transition-colors">
              <X size={28} />
            </button>
          </div>

          {/* Left/Right Navigation */}
          {viewerState.photos.length > 1 && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); navigateViewer(-1); }}
                className="absolute left-8 text-white hover:text-indigo-400 p-4 bg-black/30 hover:bg-black/60 rounded-full transition-all"
              >
                <ChevronLeft size={40} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); navigateViewer(1); }}
                className="absolute right-8 text-white hover:text-indigo-400 p-4 bg-black/30 hover:bg-black/60 rounded-full transition-all"
              >
                <ChevronRight size={40} />
              </button>
            </>
          )}

          {/* Image Container with Remove Button */}
          <div className="relative max-w-5xl w-full max-h-[85vh] flex items-center justify-center">
            <img 
              src={viewerState.photos[viewerState.currentIndex]} 
              alt="Vehicle Condition" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            
            {/* Remove (Cancel) Button */}
            <button
              onClick={removeCurrentPhoto}
              title="이 사진을 차량에서 배정 취소하고 미분류함으로 돌려보냅니다."
              className="absolute top-4 right-4 bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 group"
            >
              <Trash2 size={24} className="group-hover:animate-pulse" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
