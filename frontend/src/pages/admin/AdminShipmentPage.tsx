import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import {
  Edit2,
  ShieldAlert,
  FileText,
  Check,
  Truck,
  ArrowRight,
  RefreshCw,
  Eye,
  ArrowLeft,
  RotateCcw,
  Sparkles,
  Copy,
  Database,
  Download,
  AlertCircle,
  FileSpreadsheet,
  X,
  Car,
  BellRing,
  CreditCard
} from "lucide-react";
import VehicleDashboardModal from "../../components/VehicleDashboardModal";
import { useNotificationStore } from "../../store/useNotificationStore";

interface ExtractionKey {
  id: string;
  label: string;
  desc: string;
  color: string;
}

const EXTRACTION_KEYS: ExtractionKey[] = [
  { id: "vin", label: "차대번호", desc: "차량 고유 식별번호(VIN)", color: "bg-blue-600 text-white hover:bg-blue-700 border-blue-700" },
  { id: "make", label: "제조사", desc: "차량 제조사 (예: Hyundai)", color: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700" },
  { id: "model", label: "모델명", desc: "차량 모델명", color: "bg-teal-600 text-white hover:bg-teal-700 border-teal-700" },
  { id: "year", label: "연식", desc: "차량 연식", color: "bg-amber-600 text-white hover:bg-amber-700 border-amber-700" },
  { id: "weight", label: "중량", desc: "차량 중량 (KGS)", color: "bg-violet-600 text-white hover:bg-violet-700 border-violet-700" },
  { id: "cbm", label: "CBM", desc: "차량 부피 (CBM)", color: "bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-700" },
  { id: "drivability", label: "구동상태", desc: "Running / Towing / Forklift", color: "bg-pink-600 text-white hover:bg-pink-700 border-pink-700" },
  { id: "deregistration_no", label: "말소증번호", desc: "수출말소등록번호", color: "bg-rose-600 text-white hover:bg-rose-700 border-rose-700" }
];

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

  // 서류 검증 워크스페이스 모달 관련 상태
  const [isVerifierOpen, setIsVerifierOpen] = useState(false);
  const [verifierBlNumber, setVerifierBlNumber] = useState("");
  const [verifierShipperName, setVerifierShipperName] = useState("");
  const [verifierInvoiceKey, setVerifierInvoiceKey] = useState<string | null>(null);
  const [verifierPackingKey, setVerifierPackingKey] = useState<string | null>(null);
  const [verifierActiveTab, setVerifierActiveTab] = useState<"invoice" | "packingList">("invoice");
  const [verifierGridData, setVerifierGridData] = useState<any[][] | null>(null);
  const [verifierFileName, setVerifierFileName] = useState("");
  const [verifierLoading, setVerifierLoading] = useState(false);

  // 매핑 관련 상태
  const [mappedColumns, setMappedColumns] = useState<Record<string, { col: number; startRow: number; endRow: number; activeRows?: number[] }>>({}); // keyId -> mapping details
  const [selectedColIndices, setSelectedColIndices] = useState<number[]>([]);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  // 셀 드래깅 영역 및 배지 큐
  const [dragStartCell, setDragStartCell] = useState<{ row: number; col: number } | null>(null);
  const [dragEndCell, setDragEndCell] = useState<{ row: number; col: number } | null>(null);
  const [additionalSelectionBlocks, setAdditionalSelectionBlocks] = useState<{ minRow: number; maxRow: number; minCol: number; maxCol: number }[]>([]);
  const [clickedBadgeQueue, setClickedBadgeQueue] = useState<string[]>([]);

  // 최종 추출 데이터 모달 상태
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // 로로선 차량 대시보드 상태 및 화주 대기 서류 알림 토스트 상태 관리 (Zustand 전역 스토어 연동)
  const { 
    missedAlerts, 
    setMissedAlerts, 
    showWindowsAlertDrawer, 
    setShowWindowsAlertDrawer,
    activeDashboardShipment,
    setActiveDashboardShipment
  } = useNotificationStore();

  const [docAlert, setDocAlert] = useState<{ id: string; blNumber: string; count: number; shipmentId: number; photoType?: string; shipperName?: string; timestamp?: string } | null>(null);
  const [alertTimers, setAlertTimers] = useState<Record<string, any>>({});

  // Debit Note Generator Modal State
  const [isBillingModalOpen, setIsBillingModalOpen] = useState(false);
  const [billingShipment, setBillingShipment] = useState<any | null>(null);
  const [billingClients, setBillingClients] = useState<any[]>([]);
  const [selectedBillingClientId, setSelectedBillingClientId] = useState("");
  const [exchangeRateInput, setExchangeRateInput] = useState("1350");
  const [invoiceNoInput, setInvoiceNoInput] = useState("");
  const [dueDateInput, setDueDateInput] = useState("");
  const [calculationResult, setCalculationResult] = useState<any | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [billingError, setBillingError] = useState("");

  const handleOpenDebitNoteGenerator = async (shipment: any) => {
    setBillingShipment(shipment);
    setInvoiceNoInput(`INV-${shipment.bl_number}`);
    
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    setDueDateInput(nextWeek.toISOString().split('T')[0]);
    
    setCalculationResult(null);
    setBillingError("");
    setIsBillingModalOpen(true);
    
    try {
      const [clientsRes, rateRes] = await Promise.all([
        axios.get("http://localhost:5000/api/billing/clients", { withCredentials: true }),
        axios.get("http://localhost:5000/api/billing/exchange-rate", { withCredentials: true }).catch(err => {
          console.warn("Failed to fetch real-time exchange rate:", err);
          return { data: { success: false } };
        })
      ]);

      if (clientsRes.data.success) {
        setBillingClients(clientsRes.data.clients);
        // Match shipper name to client name
        const matched = clientsRes.data.clients.find((c: any) => 
          c.client_name.includes(shipment.shipper) || shipment.shipper.includes(c.client_name)
        );
        if (matched) {
          setSelectedBillingClientId(matched.client_id);
        } else if (clientsRes.data.clients.length > 0) {
          setSelectedBillingClientId(clientsRes.data.clients[0].client_id);
        }
      }

      if (rateRes.data.success && rateRes.data.rate) {
        setExchangeRateInput(String(rateRes.data.rate));
      } else {
        setExchangeRateInput("1350");
      }
    } catch (err) {
      console.error("Open Debit Note modal error:", err);
      setBillingError("기본 설정을 불러오는 중 오류가 발생했습니다.");
    }
  };

  const handleCalculateInvoice = async () => {
    if (!billingShipment || !selectedBillingClientId || !exchangeRateInput) {
      setBillingError("화주와 적용 환율을 입력해주세요.");
      return;
    }
    setCalculating(true);
    setBillingError("");
    try {
      const res = await axios.post("http://localhost:5000/api/billing/invoices/calculate", {
        shipmentId: billingShipment.id,
        clientId: selectedBillingClientId,
        exchangeRate: parseFloat(exchangeRateInput)
      }, { withCredentials: true });
      if (res.data.success) {
        setCalculationResult(res.data.data);
      } else {
        setBillingError(res.data.message || "계산 실패");
      }
    } catch (err: any) {
      console.error("Calculate invoice error:", err);
      setBillingError(err.response?.data?.message || "정산 계산 중 에러가 발생했습니다. 차량이 먼저 등록되어 있는지 확인해주세요.");
    } finally {
      setCalculating(false);
    }
  };

  const handleSaveInvoice = async () => {
    if (!calculationResult || !invoiceNoInput || !dueDateInput) {
      setBillingError("인보이스 번호와 납기일을 입력해주세요.");
      return;
    }
    setSavingInvoice(true);
    setBillingError("");
    try {
      const payload = {
        invoice_no: invoiceNoInput,
        client_id: selectedBillingClientId,
        bl_number: billingShipment.bl_number,
        vessel_name: billingShipment.vessel_name,
        pol: billingShipment.pol,
        pod: billingShipment.pod,
        exchange_rate: parseFloat(calculationResult.master.exchange_rate),
        total_ocean_usd: parseFloat(calculationResult.master.total_ocean_usd),
        total_local_krw: parseFloat(calculationResult.master.total_local_krw),
        final_amount_krw: parseFloat(calculationResult.master.final_amount_krw),
        bl_fee_krw: parseFloat(calculationResult.master.bl_fee_krw),
        customs_fee_krw: parseFloat(calculationResult.master.customs_fee_krw),
        due_date: dueDateInput,
        items: calculationResult.items
      };

      const res = await axios.post("http://localhost:5000/api/billing/invoices", payload, { withCredentials: true });
      if (res.data.success) {
        alert("정산서(데빗노트)가 정상적으로 발행 및 저장되었습니다!");
        setIsBillingModalOpen(false);
        fetchShipments();
      }
    } catch (err: any) {
      console.error("Save invoice error:", err);
      setBillingError(err.response?.data?.message || "인보이스 저장에 실패했습니다.");
    } finally {
      setSavingInvoice(false);
    }
  };

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

    socket.emit("join", { role: "admin" });

    socket.on("shipment_status_changed", (data) => {
      console.log("실시간 선적 상태 업데이트 수신:", data);
      // 목록 갱신
      fetchShipments();
    });

    // 화주 대기 서류 알림 토스트 상태 및 미확인 알림창 히스토리 상태 관리
    socket.on("new_shipper_docs_alert", (data) => {
      console.log("화주 서류 업로드 수신:", data);
      const alertId = `shipper_alert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newAlert = { ...data, id: alertId, timestamp: new Date().toLocaleTimeString() };
      
      // 알림 노출
      setDocAlert(newAlert);
      
      // 15초 후 자동 닫히며 미확인 리스트에 저장
      const timer = setTimeout(() => {
        setDocAlert(current => {
          if (current && current.id === alertId) {
            // 아직 닫히거나 확인하러가지 않았다면 미확인 알림창 목록에 추가
            setMissedAlerts(prev => {
              // 중복 방지
              if (prev.some(a => a.id === alertId)) return prev;
              return [...prev, { ...current, saved: true }];
            });
            return null;
          }
          return current;
        });
      }, 15000);
      
      // 타이머 등록
      setAlertTimers(prev => ({ ...prev, [alertId]: timer }));
    });

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);



  // 검증 대상 탭 변경 시 그리드 데이터 로딩
  useEffect(() => {
    if (isVerifierOpen) {
      const activeKey = verifierActiveTab === "invoice" ? verifierInvoiceKey : verifierPackingKey;
      if (activeKey) {
        fetchVerifierGrid(activeKey);
      } else {
        setVerifierGridData(null);
      }
    }
  }, [verifierActiveTab, isVerifierOpen, verifierInvoiceKey, verifierPackingKey]);

  const fetchVerifierGrid = async (key: string) => {
    setVerifierLoading(true);
    try {
      const res = await axios.get(`http://localhost:5000/api/files/view/${key}`, {
        withCredentials: true
      });
      if (res.data.success) {
        setVerifierGridData(res.data.data.gridData);
        setVerifierFileName(res.data.data.fileName);
        
        // 화주별 매핑 설정을 로드합니다.
        try {
          const mappingRes = await axios.get(`http://localhost:5000/api/files/mapping/${encodeURIComponent(verifierShipperName)}`, {
            withCredentials: true
          });
          if (mappingRes.data.success && mappingRes.data.exists && mappingRes.data.data) {
            setMappedColumns(mappingRes.data.data);
          } else {
            setMappedColumns({}); // 저장된 매핑이 없는 경우 빈 값
          }
        } catch (mappingErr) {
          console.error("화주별 매핑 로딩 에러:", mappingErr);
          setMappedColumns({});
        }

        setSelectedColIndices([]);
        setClickedBadgeQueue([]);
      }
    } catch (err) {
      console.error(err);
      alert("그리드 데이터를 가져오는데 실패했습니다.");
    } finally {
      setVerifierLoading(false);
    }
  };

  const saveCurrentShipperMapping = async () => {
    if (!verifierShipperName || Object.keys(mappedColumns).length === 0) return;
    try {
      await axios.post("http://localhost:5000/api/files/mapping", {
        shipperName: verifierShipperName,
        mapping: mappedColumns
      }, {
        withCredentials: true
      });
      console.log("화주별 매핑 설정 자동 저장 완료");
    } catch (err) {
      console.error("화주별 매핑 설정 자동 저장 실패:", err);
    }
  };

  // 1. 서류 승인 처리
  const handleVerifyDocs = async (blNumber: string) => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/tracking/verify-docs",
        { blNumber },
        { withCredentials: true }
      );
      if (res.data.success) {
        setIsVerifierOpen(false);
        fetchShipments();
        const targetShipment = shipments.find(s => s.bl_number === blNumber);
        if (targetShipment && window.confirm(`${res.data.message}\n\n화주가 아직 차량 사진 3종을 업로드하지 않은 경우, 포워더 대행을 위해 차량 현황판으로 이동하시겠습니까?`)) {
          setActiveDashboardShipment({ id: targetShipment.id, blNumber: targetShipment.bl_number });
        } else if (!targetShipment) {
          alert(res.data.message);
        }
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "서류 검증 처리 실패");
    }
  };

  // 1.5. 서류 재요청 처리
  const handleReRequestDocs = async (blNumber: string) => {
    if (!window.confirm(`B/L 번호 [${blNumber}]의 제출된 서류를 삭제하고 화주에게 서류 재요청을 보내시겠습니까?`)) {
      return;
    }
    try {
      const res = await axios.post(
        "http://localhost:5000/api/tracking/re-request-docs",
        { blNumber },
        { withCredentials: true }
      );
      if (res.data.success) {
        alert(res.data.message);
        setIsVerifierOpen(false);
        fetchShipments();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "서류 재요청 처리 실패");
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
      alert(err.response?.data?.message || "트럭 배정 등록 중 에러 발생");
    } finally {
      setAssigning(false);
    }
  };

  // 3. 수동 상태 업데이트
  const handleStatusChange = async (blNumber: string, nextStatus: string) => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/tracking/update-status",
        { blNumber, status: nextStatus },
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

  // ----------------------------------------------------
  // 그리드 처리 헬퍼들
  // ----------------------------------------------------
  const getColLetter = (index: number): string => {
    let temp = index;
    let letter = "";
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  const getMappedKeys = (colIndex: number): ExtractionKey[] => {
    const entries = Object.entries(mappedColumns).filter(([_, mapping]) => mapping.col === colIndex);
    return entries.map(entry => EXTRACTION_KEYS.find(k => k.id === entry[0])).filter(Boolean) as ExtractionKey[];
  };

  // 현재 셀이 어떤 매핑 데이터의 startRow 한 칸 위(라벨 위치)인지 식별하는 헬퍼
  const getBadgesForKeyAtCell = (r: number, c: number): ExtractionKey[] => {
    const entries = Object.entries(mappedColumns).filter(([_, mapping]) => {
      const isScalar = mapping.startRow === mapping.endRow;
      const targetRow = isScalar ? mapping.startRow : mapping.startRow - 1;
      return mapping.col === c && targetRow === r;
    });
    return entries.map(entry => EXTRACTION_KEYS.find(k => k.id === entry[0])).filter(Boolean) as ExtractionKey[];
  };

  const isCellInSelection = (rowIdx: number, colIdx: number): boolean => {
    for (const block of additionalSelectionBlocks) {
      if (colIdx >= block.minCol && colIdx <= block.maxCol && rowIdx >= block.minRow && rowIdx <= block.maxRow) {
        return true;
      }
    }
    if (!dragStartCell || !dragEndCell) return false;
    if (dragStartCell.row === -1) {
      const minCol = Math.min(dragStartCell.col, dragEndCell.col);
      const maxCol = Math.max(dragStartCell.col, dragEndCell.col);
      return colIdx >= minCol && colIdx <= maxCol;
    }
    const minCol = Math.min(dragStartCell.col, dragEndCell.col);
    const maxCol = Math.max(dragStartCell.col, dragEndCell.col);
    const minRow = Math.min(dragStartCell.row, dragEndCell.row);
    const maxRow = Math.max(dragStartCell.row, dragEndCell.row);
    return colIdx >= minCol && colIdx <= maxCol && rowIdx >= minRow && rowIdx <= maxRow;
  };

  const getActiveRowsForCol = (colIdx: number) => {
    const rows: number[] = [];
    const maxR = verifierGridData ? verifierGridData.length - 1 : 1000;
    for (let r = 0; r <= maxR; r++) {
      if (isCellInSelection(r, colIdx)) rows.push(r);
    }
    return rows;
  };

  const createMappingObj = (colIdx: number) => {
    const rows = getActiveRowsForCol(colIdx);
    if (rows.length === 0) return { col: colIdx, startRow: 0, endRow: 0, activeRows: [] };
    const startRow = Math.min(...rows);
    const endRow = Math.max(...rows);
    return { col: colIdx, startRow, endRow, activeRows: rows };
  };

  const removeMapping = (keyId: string) => {
    setMappedColumns(prev => {
      const updated = { ...prev };
      delete updated[keyId];
      return updated;
    });
  };

  const handleReset = () => {
    setMappedColumns({});
    setSelectedColIndices([]);
    setClickedBadgeQueue([]);
    setAdditionalSelectionBlocks([]);
  };

  const handleBadgeClick = (keyId: string) => {
    setClickedBadgeQueue((prev) => {
      const idx = prev.indexOf(keyId);
      if (idx !== -1) {
        return prev.filter((k) => k !== keyId);
      } else {
        return [...prev, keyId];
      }
    });
  };

  const handleColDrop = (colIndex: number, rowIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverColIndex(null);
    const keyId = e.dataTransfer.getData("text/plain");
    if (!keyId) return;

    // 만약 헤더에 드롭한 경우, 전체 행 범위 매핑
    const isHeaderDrop = rowIndex === -1;
    const startRow = isHeaderDrop ? 0 : rowIndex;
    const endRow = isHeaderDrop ? (verifierGridData ? verifierGridData.length - 1 : 0) : rowIndex;

    setMappedColumns((prev) => {
      const updated = { ...prev };
      updated[keyId] = { col: colIndex, startRow, endRow };
      return updated;
    });
  };

  const handleCellMouseDown = (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    const isAppend = e.ctrlKey || e.metaKey;
    if (isAppend && dragStartCell && dragEndCell) {
      setAdditionalSelectionBlocks(prev => [
        ...prev,
        {
          minRow: dragStartCell.row === -1 ? 0 : Math.min(dragStartCell.row, dragEndCell.row),
          maxRow: dragStartCell.row === -1 ? Infinity : Math.max(dragStartCell.row, dragEndCell.row),
          minCol: Math.min(dragStartCell.col, dragEndCell.col),
          maxCol: Math.max(dragStartCell.col, dragEndCell.col)
        }
      ]);
    } else if (!isAppend) {
      setAdditionalSelectionBlocks([]);
    }
    setDragStartCell({ row: rowIdx, col: colIdx });
    setDragEndCell({ row: rowIdx, col: colIdx });
    if (isAppend) {
      setSelectedColIndices(prev => Array.from(new Set([...prev, colIdx])));
    } else {
      setSelectedColIndices([colIdx]);
    }
  };

  const handleCellMouseEnter = (rowIdx: number, colIdx: number, e: React.MouseEvent) => {
    if (dragStartCell) {
      setDragEndCell({ row: rowIdx, col: colIdx });
      const minCol = Math.min(dragStartCell.col, colIdx);
      const maxCol = Math.max(dragStartCell.col, colIdx);
      const cols: number[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        cols.push(c);
      }
      const isAppend = e.ctrlKey || e.metaKey;
      let newCols = [...cols];
      if (isAppend) {
        const blockCols = new Set<number>();
        additionalSelectionBlocks.forEach(b => {
          for(let c = b.minCol; c <= b.maxCol; c++) blockCols.add(c);
        });
        cols.forEach(c => blockCols.add(c));
        newCols = Array.from(blockCols);
      }
      setSelectedColIndices(newCols);

      // 드래그 중인 마우스 포인터 셀이 경계선을 넘어가면 자동으로 뷰포트 스크롤
      const cellElement = e.currentTarget as HTMLElement;
      if (cellElement) {
        cellElement.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  };

  const handleHeaderMouseDown = (colIndex: number, e: React.MouseEvent) => {
    const isAppend = e.ctrlKey || e.metaKey;
    if (isAppend && dragStartCell && dragEndCell) {
      setAdditionalSelectionBlocks(prev => [
        ...prev,
        {
          minRow: dragStartCell.row === -1 ? 0 : Math.min(dragStartCell.row, dragEndCell.row),
          maxRow: dragStartCell.row === -1 ? Infinity : Math.max(dragStartCell.row, dragEndCell.row),
          minCol: Math.min(dragStartCell.col, dragEndCell.col),
          maxCol: Math.max(dragStartCell.col, dragEndCell.col)
        }
      ]);
    } else if (!isAppend) {
      setAdditionalSelectionBlocks([]);
    }
    setDragStartCell({ row: -1, col: colIndex });
    setDragEndCell({ row: -1, col: colIndex });
    if (isAppend) {
      setSelectedColIndices(prev => Array.from(new Set([...prev, colIndex])));
    } else {
      setSelectedColIndices([colIndex]);
    }
  };

  const handleHeaderMouseEnter = (colIndex: number, e: React.MouseEvent) => {
    if (dragStartCell && dragStartCell.row === -1) {
      setDragEndCell({ row: -1, col: colIndex });
      const minCol = Math.min(dragStartCell.col, colIndex);
      const maxCol = Math.max(dragStartCell.col, colIndex);
      const cols: number[] = [];
      for (let c = minCol; c <= maxCol; c++) {
        cols.push(c);
      }
      const isAppend = e.ctrlKey || e.metaKey;
      let newCols = [...cols];
      if (isAppend) {
        const blockCols = new Set<number>();
        additionalSelectionBlocks.forEach(b => {
          for(let c = b.minCol; c <= b.maxCol; c++) blockCols.add(c);
        });
        cols.forEach(c => blockCols.add(c));
        newCols = Array.from(blockCols);
      }
      setSelectedColIndices(newCols);

      const cellElement = e.currentTarget as HTMLElement;
      if (cellElement) {
        cellElement.scrollIntoView({
          behavior: 'auto',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }
  };

  const handleBatchMap = (keyIds: string[]) => {
    if (!dragStartCell || !dragEndCell || !verifierGridData) return;

    // 헤더 드래깅인 경우 전체 행 매핑
    const isHeaderSelection = dragStartCell.row === -1;
    const minRow = isHeaderSelection ? 0 : Math.min(dragStartCell.row, dragEndCell.row);
    const maxRow = isHeaderSelection ? verifierGridData.length - 1 : Math.max(dragStartCell.row, dragEndCell.row);

    setMappedColumns(prev => {
      const updated = { ...prev };
      keyIds.forEach(k => delete updated[k]);

      selectedColIndices.forEach((colIdx, idx) => {
        if (idx < keyIds.length) {
          const keyId = keyIds[idx];
          updated[keyId] = createMappingObj(colIdx);
        }
      });
      return updated;
    });
    setSelectedColIndices([]);
  };

  // 마우스 글로벌 릴리즈 시 배지 큐 일괄 처리
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (dragStartCell && dragEndCell) {
        if (clickedBadgeQueue.length > 0) {
          const minCol = Math.min(dragStartCell.col, dragEndCell.col);
          const maxCol = Math.max(dragStartCell.col, dragEndCell.col);
          const minRow = dragStartCell.row === -1 ? 0 : Math.min(dragStartCell.row, dragEndCell.row);
          const maxRow = dragStartCell.row === -1 ? (verifierGridData ? verifierGridData.length - 1 : 0) : Math.max(dragStartCell.row, dragEndCell.row);

          setMappedColumns(prev => {
            const updated = { ...prev };
            clickedBadgeQueue.forEach(k => delete updated[k]);

            let colOffset = 0;
            
            const sortedCols = [...selectedColIndices].sort((a,b)=>a-b);
            clickedBadgeQueue.forEach((keyId) => {
              const colIdx = sortedCols[colOffset];
              if (colIdx !== undefined) {
                updated[keyId] = createMappingObj(colIdx);
              }
              colOffset++;
            });

            return updated;
          });
          setClickedBadgeQueue([]);
          setSelectedColIndices([]);
          setAdditionalSelectionBlocks([]);
        }
      }
      setDragStartCell(null);
      setDragEndCell(null);
    };

    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleGlobalMouseUp);
    };
  }, [dragStartCell, dragEndCell, clickedBadgeQueue, verifierGridData]);

  const getExtractedData = () => {
    if (!verifierGridData || verifierGridData.length === 0) return {};

    const activeKeys = Object.keys(mappedColumns);
    if (activeKeys.length === 0) return {};

    const result: any = {};

    // 1. 단일 셀 스칼라 값 분리 추출 (시작 행과 끝 행이 동일한 매핑)
    const scalarKeys = activeKeys.filter(k => {
      const mapping = mappedColumns[k];
      return mapping.startRow === mapping.endRow;
    });

    scalarKeys.forEach(k => {
      const mapping = mappedColumns[k];
      const rowVal = verifierGridData[mapping.startRow];
      if (rowVal && mapping.col < rowVal.length) {
        const val = rowVal[mapping.col];
        result[k] = val !== undefined && val !== null ? String(val).trim() : "";
      }
    });

    // 2. 리스트/품목 데이터 추출 (시작 행과 끝 행이 다른 매핑)
    const listKeys = activeKeys.filter(k => {
      const mapping = mappedColumns[k];
      return mapping.startRow !== mapping.endRow;
    });

    if (listKeys.length > 0) {
      // 품목 행의 최소 범위와 최대 범위 결정
      let minRow = Infinity;
      let maxRow = -Infinity;
      listKeys.forEach(k => {
        const mapping = mappedColumns[k];
        if (mapping.startRow < minRow) minRow = mapping.startRow;
        if (mapping.endRow > maxRow) maxRow = mapping.endRow;
      });

      if (minRow !== Infinity && maxRow !== -Infinity) {
        const itemsList: any[] = [];
        for (let r = minRow; r <= maxRow; r++) {
          const rowVal = verifierGridData[r];
          if (!rowVal) continue;

          // 해당 행에 적어도 하나의 매핑된 값이라도 존재하는지 검증
          let hasAnyData = false;
          const rowObj: any = { _rowIndex: r + 1 };

          listKeys.forEach(k => {
            const mapping = mappedColumns[k];
            // 해당 품목 컬럼의 개별 지정 행 범위 내에 포함될 경우에만 데이터 바인딩
            const isActive = mapping.activeRows ? mapping.activeRows.includes(r) : (r >= mapping.startRow && r <= mapping.endRow);
            if (isActive) {
              const val = rowVal[mapping.col];
              if (val !== undefined && val !== null && String(val).trim() !== "") {
                rowObj[k] = String(val).trim();
                hasAnyData = true;
              } else {
                rowObj[k] = "";
              }
            } else {
              rowObj[k] = "";
            }
          });

          if (hasAnyData) {
            itemsList.push(rowObj);
          }
        }
        result.items = itemsList;
      }
    } else {
      result.items = [];
    }

    return result;
  };

  const extractedRows = getExtractedData();

  const handleCopyToClipboard = () => {
    const jsonString = JSON.stringify(extractedRows, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownloadJson = async () => {
    try {
      const response = await axios.post("http://localhost:5000/api/files/export-customs-excel", {
        verifierFileName,
        extractedRows
      }, {
        responseType: 'blob',
        withCredentials: true
      });
      
      const blob = new Blob([response.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `관세사용_${verifierFileName.replace(/\.[^/.]+$/, "")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("엑셀 다운로드 에러:", err);
      alert("관세사용 엑셀 파일을 다운로드하는데 실패했습니다.");
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-[95%] mx-auto w-full min-h-[calc(100vh-12rem)] flex flex-col justify-center py-6 relative">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-800">화물 및 선적 전체 관리 (어드민 전용)</h2>
          <p className="text-slate-500 text-sm mt-1">포워더 입장에서 진행 상태를 업데이트하고 제출된 관세 서류를 검증합니다.</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-slate-50">
          <h3 className="text-base font-bold text-slate-800">운송 트래킹 현황 목록</h3>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-500 font-bold">로딩 중...</div>
          ) : error ? (
            <div className="p-12 text-center text-rose-500 font-bold">{error}</div>
          ) : shipments.length === 0 ? (
            <div className="p-12 text-center text-slate-400">등록된 선적 정보가 없습니다.</div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-xs border-b">
                <tr>
                  <th className="p-4 font-bold">B/L 번호</th>
                  <th className="p-4 font-bold">화주명</th>
                  <th className="p-4 font-bold">선박명</th>
                  <th className="p-4 font-bold">POL (출발)</th>
                  <th className="p-4 font-bold">POD (도착)</th>
                  <th className="p-4 font-bold">ETD / ETA</th>
                  <th className="p-4 font-bold">상태</th>
                  <th className="p-4 font-bold">운송 업무 제어</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold">
                {shipments.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="p-4 text-slate-800 font-bold">{s.bl_number}</td>
                    <td className="p-4 text-slate-600">{s.shipper}</td>
                    <td className="p-4 text-slate-600">{s.vessel_name}</td>
                    <td className="p-4 text-slate-500">{s.pol}</td>
                    <td className="p-4 text-slate-500">{s.pod}</td>
                    <td className="p-4 text-slate-500 text-xs">
                      <div>D: {s.etd ? s.etd.split("T")[0] : "-"}</div>
                      <div className="text-slate-400">A: {s.eta ? s.eta.split("T")[0] : "-"}</div>
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${s.status === "Pending Documents"
                          ? "bg-red-50 text-red-600 border border-red-100"
                          : s.status === "Documents Uploaded"
                            ? "bg-amber-50 text-amber-600 border border-amber-100 animate-pulse"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="p-4 align-top">
                      {/* 공통 기능: 차량 현황판 및 정산서 발행 */}
                      <div className="mb-3 flex flex-wrap gap-2">
                        <button
                          onClick={() => setActiveDashboardShipment({ id: s.id, blNumber: s.bl_number })}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
                        >
                          <Car size={14} /> 차량 현황판 (사진/수기입력)
                        </button>
                        <button
                          onClick={() => handleOpenDebitNoteGenerator(s)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
                        >
                          <CreditCard size={14} /> 정산서 발행 (Debit Note)
                        </button>
                      </div>

                      {/* 1단계: 서류 업로드 대기 */}
                      {s.status === "Pending Documents" && (
                        <span className="text-xs text-slate-400 font-medium italic">화주의 인보이스/패킹리스트 제출을 대기하고 있습니다.</span>
                      )}

                      {/* 2단계: 화주가 서류 제출 완료 ➔ 어드민이 단일 서류검증 버튼으로 한 화면에서 확인 */}
                      {s.status === "Documents Uploaded" && (
                        <div className="space-y-2">
                          <div>
                            <button
                              onClick={() => {
                                setVerifierBlNumber(s.bl_number);
                                setVerifierShipperName(s.shipper || "일반 화주");
                                setVerifierInvoiceKey(s.invoice_file_key);
                                setVerifierPackingKey(s.packing_list_file_key);
                                setVerifierActiveTab("invoice");
                                setIsVerifierOpen(true);
                              }}
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition shadow-sm"
                            >
                              <Eye size={14} /> 서류 검증 (인보이스/패킹)
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 3단계: 서류 확인 완료 ➔ 트럭 운송 수동 배정 */}
                      {s.status === "Documents Verified" && (
                        <div className="space-y-3">
                          {activeAssignBl !== s.bl_number ? (
                            <button
                              onClick={() => {
                                setActiveAssignBl(s.bl_number);
                                setTruckDate(s.truck_date ? s.truck_date.split("T")[0] : "");
                                setTruckPlate(s.truck_plate_number || "");
                                setTruckPhone(s.truck_driver_phone || "");
                              }}
                              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 transition shadow-sm"
                            >
                              <Truck size={14} /> 운송 차량 배정 등록
                            </button>
                          ) : (
                            <form onSubmit={(e) => handleAssignTruckSubmit(e, s.bl_number)} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs space-y-2 max-w-xs">
                              <div className="font-bold text-slate-700">로컬 트럭 정보 매핑</div>
                              <div className="space-y-1">
                                <label className="block text-slate-500 font-bold">운송 예정일</label>
                                <input
                                  type="date"
                                  className="w-full border rounded p-1 text-slate-700"
                                  value={truckDate}
                                  onChange={(e) => setTruckDate(e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-500 font-bold">차량 번호</label>
                                <input
                                  type="text"
                                  placeholder="예: 서울82가1234"
                                  className="w-full border rounded p-1 text-slate-700"
                                  value={truckPlate}
                                  onChange={(e) => setTruckPlate(e.target.value)}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="block text-slate-500 font-bold">기사 연락처</label>
                                <input
                                  type="text"
                                  placeholder="예: 010-1234-5678"
                                  className="w-full border rounded p-1 text-slate-700"
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
                      {["Trucking", "Gate In", "Loaded on Vessel", "Departed", "In Transit", "Delivered"].includes(s.status) && (
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
                              <option value="Trucking">Trucking (운송 중)</option>
                              <option value="Gate In">Gate In (CY 입고완료)</option>
                              <option value="Loaded on Vessel">Loaded on Vessel (선적 완료)</option>
                              <option value="Departed">Departed (출항)</option>
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

      {/* 서류 검증 워크스페이스 모달 */}
      {isVerifierOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-[96vw] h-[90vh] flex flex-col overflow-hidden animate-fade-in-up">

            {/* 모달 헤더 */}
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
              <div className="flex items-center gap-3">
                <span className="text-xs bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold px-2.5 py-1 rounded-lg">
                  B/L: {verifierBlNumber} 서류 검증
                </span>
                <h3 className="text-base font-extrabold text-slate-800 dark:text-white">관세 신고용 엑셀 격자 뷰어</h3>
              </div>

              {/* 승인 / 반려 / 닫기 액션 */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleVerifyDocs(verifierBlNumber)}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition shadow-sm"
                >
                  <Check size={14} /> 서류 검증 승인
                </button>
                <button
                  onClick={() => handleReRequestDocs(verifierBlNumber)}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 transition shadow-sm"
                >
                  <RefreshCw size={14} /> 서류 재요청 (반려)
                </button>
                <button
                  onClick={() => setIsVerifierOpen(false)}
                  className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* 토글 서브 탭 (인보이스 vs 패킹리스트 스위치) */}
            <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-850 flex justify-between items-center">
              <div className="flex bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200/50 dark:border-slate-800">
                <button
                  onClick={() => setVerifierActiveTab("invoice")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${verifierActiveTab === "invoice"
                      ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                >
                  <FileText size={14} /> 상업송장 (Invoice)
                </button>
                <button
                  onClick={() => setVerifierActiveTab("packingList")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${verifierActiveTab === "packingList"
                      ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                      : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                >
                  <FileSpreadsheet size={14} /> 패킹리스트 (Packing List)
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border font-semibold px-3 py-1.5 rounded-lg transition flex items-center gap-1 text-xs"
                >
                  <RotateCcw size={13} /> 매핑 초기화
                </button>
                <button
                  onClick={() => {
                    if (Object.keys(mappedColumns).length === 0) {
                      alert("추출할 열을 지정해주세요.");
                      return;
                    }
                    saveCurrentShipperMapping();
                    setShowSaveModal(true);
                  }}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3.5 py-1.5 rounded-lg transition flex items-center gap-1 text-xs shadow-sm"
                >
                  <Database size={13} /> 최종 데이터 생성
                </button>
              </div>
            </div>

            {/* 그리드 분석기 영역 */}
            <div className="flex-1 p-6 overflow-hidden flex flex-col lg:flex-row gap-6 bg-slate-50 dark:bg-slate-950">

              {/* 왼쪽: 커스텀 엑셀 그리드 */}
              <div className="flex-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-850 shadow-sm flex flex-col overflow-hidden">
                <div className="mb-3 flex justify-between items-center text-xs text-slate-400">
                  <span className="font-bold flex items-center gap-1"><FileSpreadsheet size={13} /> 파일명: {verifierFileName}</span>
                  <span>전체 {verifierGridData ? verifierGridData.length : 0}개 행 로딩됨</span>
                </div>

                {verifierLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 text-slate-400">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-bold">엑셀 그리드 렌더링 중...</span>
                  </div>
                ) : !verifierGridData ? (
                  <div className="flex-1 flex items-center justify-center text-slate-400 border border-dashed rounded-xl">
                    표시할 서류 데이터가 없습니다. 화주가 서류를 업로드했는지 확인해 주세요.
                  </div>
                ) : (
                  <div className="flex-1 overflow-auto border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-950">
                    <table className="min-w-full text-left border-collapse text-xs" style={{ width: "max-content" }}>
                      <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-800">
                        <tr>
                          {/* 최상단 최좌측 셀: 작은 동그라미 표시 */}
                          <th className="w-12 p-2 border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 text-center select-none">
                            <span className="inline-block w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500 shadow-sm"></span>
                          </th>
                          {/* 최상단 행 로우: A, B, C... */}
                          {verifierGridData[0]?.map((_, colIndex) => {
                            const letter = getColLetter(colIndex);
                            const isSelected = selectedColIndices.includes(colIndex);
                            const isDragOver = dragOverColIndex === colIndex;
                            const mappedKeys = getMappedKeys(colIndex);

                            return (
                              <th
                                key={colIndex}
                                className={`min-w-[130px] p-2 border border-slate-200 dark:border-slate-800 text-center relative select-none cursor-pointer transition ${isSelected
                                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border-blue-300 dark:border-blue-700'
                                    : isDragOver
                                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-dashed border-indigo-400'
                                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                  }`}
                                onMouseDown={(e) => handleHeaderMouseDown(colIndex, e)}
                                onMouseEnter={(e) => handleHeaderMouseEnter(colIndex, e)}
                                onDragOver={(e) => { e.preventDefault(); setDragOverColIndex(colIndex); }}
                                onDragLeave={() => setDragOverColIndex(null)}
                                onDrop={(e) => handleColDrop(colIndex, -1, e)}
                              >
                                <div className="flex flex-col items-center justify-center min-h-[44px]">
                                  <span className="text-sm font-extrabold">{letter}</span>
                                  {/* startRow가 0(첫 번째 행)이라 위쪽 칸이 없을 때만 최상단 고정 헤더에 배지 렌더링 */}
                                  {mappedKeys.filter(k => mappedColumns[k.id].startRow === 0).map(mappedKey => (
                                    <div key={mappedKey.id} className={`mt-1 text-[9px] px-1.5 py-0.5 rounded font-bold flex flex-col items-center gap-0.5 shadow-sm ${mappedKey.color}`}>
                                      <div className="flex items-center gap-1">
                                        <span>{mappedKey.label}</span>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            removeMapping(mappedKey.id);
                                          }}
                                          className="hover:text-red-200 font-bold"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                      <span className="text-[8px] opacity-90 font-medium">
                                        {mappedColumns[mappedKey.id].startRow === mappedColumns[mappedKey.id].endRow
                                          ? `${mappedColumns[mappedKey.id].startRow + 1}행`
                                          : `${mappedColumns[mappedKey.id].startRow + 1}~${mappedColumns[mappedKey.id].endRow + 1}행`}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {verifierGridData.map((row, rowIndex) => (
                          <tr key={rowIndex} className="hover:bg-slate-50 dark:hover:bg-slate-900/30 transition">
                            {/* 좌측 컬럼: 1, 2, 3... */}
                            <td className="sticky left-0 z-10 p-2 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 text-center font-bold text-slate-400 select-none">
                              {rowIndex + 1}
                            </td>
                            {/* 데이터 셀 */}
                            {row.map((cellVal, colIndex) => {
                              const isSelected = selectedColIndices.includes(colIndex);
                              const isDragOver = dragOverColIndex === colIndex;
                              const mappedKeys = getMappedKeys(colIndex);
                              const isDuplicateToLeft = colIndex > 0 && cellVal !== null && cellVal !== undefined && cellVal !== "" && cellVal === row[colIndex - 1];
                              const displayVal = isDuplicateToLeft
                                ? ""
                                : (cellVal === null || cellVal === undefined ? "" : String(cellVal));

                              const isHighlighted = isCellInSelection(rowIndex, colIndex);
                              const cellBadges = getBadgesForKeyAtCell(rowIndex, colIndex);
                              const isMappedCell = mappedKeys.some(k => {
                                const mapping = mappedColumns[k.id];
                                return mapping.activeRows ? mapping.activeRows.includes(rowIndex) : (rowIndex >= mapping.startRow && rowIndex <= mapping.endRow);
                              });

                              return (
                                <td
                                  key={colIndex}
                                  className={`p-2.5 border whitespace-normal break-all max-w-[250px] transition select-none ${isHighlighted
                                      ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-400 dark:border-indigo-700 text-indigo-900 dark:text-indigo-100 font-bold'
                                      : isSelected
                                        ? 'bg-blue-50/70 dark:bg-blue-950/10 border-slate-200 dark:border-slate-800'
                                        : isDragOver
                                          ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-slate-200 dark:border-slate-800'
                                          : cellBadges.length > 0 // 배지가 위치하는 라벨 셀에 부드러운 강조 배경
                                            ? 'bg-blue-100 dark:bg-blue-900/50 border-2 border-blue-400 dark:border-blue-700'
                                            : isMappedCell
                                              ? 'bg-blue-50 dark:bg-blue-900/20 border-x border-dashed border-blue-300 dark:border-blue-800'
                                              : 'border-slate-200 dark:border-slate-800'
                                    }`}
                                  onMouseDown={(e) => handleCellMouseDown(rowIndex, colIndex, e)}
                                  onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e)}
                                  onDragOver={(e) => { e.preventDefault(); setDragOverColIndex(colIndex); }}
                                  onDragLeave={() => setDragOverColIndex(null)}
                                  onDrop={(e) => handleColDrop(colIndex, rowIndex, e)}
                                  title={displayVal}
                                >
                                  {cellBadges.map(cb => (
                                    <div key={cb.id} className={`mb-1.5 text-[9.5px] px-1.5 py-0.5 rounded font-extrabold flex items-center justify-between gap-1 shadow-sm ${cb.color}`}>
                                      <span>{cb.label}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeMapping(cb.id);
                                        }}
                                        className="hover:text-red-200 font-bold ml-1"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  ))}
                                  <span className={isMappedCell ? "font-bold text-blue-900 dark:text-blue-200" : "text-slate-900 dark:text-slate-100 font-medium"}>
                                    {displayVal}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 오른쪽: 키 뱃지 및 실시간 미리보기 */}
              <div className="w-full lg:w-96 flex flex-col gap-6">

                {/* 뱃지 패널 */}
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-850 shadow-sm flex flex-col gap-2">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1"><Sparkles size={13} className="text-indigo-500" /> 정보 키 매핑</h4>
                  <p className="text-[10px] text-slate-400">뱃지를 드래그하여 컬럼 헤더에 올려놓거나, 열을 클릭한 상태로 아래 뱃지를 클릭해 매핑하세요.</p>

                  {selectedColIndices.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-950/40 p-2.5 rounded border border-blue-100 dark:border-blue-900/30 text-[11px] space-y-1.5 mt-1">
                      <div className="font-bold text-slate-700 dark:text-slate-300">
                        {selectedColIndices.length}개 범위 선택 ({getColLetter(selectedColIndices[0])}~{getColLetter(selectedColIndices[selectedColIndices.length - 1])})
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {selectedColIndices.length === 3 && (
                          <button onClick={() => handleBatchMap(['vin', 'make', 'model'])} className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">VIN+제조사+모델</button>
                        )}
                        {selectedColIndices.length === 4 && (
                          <button onClick={() => handleBatchMap(['vin', 'make', 'model', 'year'])} className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">VIN+제조사+모델+연식</button>
                        )}
                        {selectedColIndices.length === 5 && (
                          <button onClick={() => handleBatchMap(['vin', 'make', 'model', 'year', 'weight'])} className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">VIN+제조사+모델+연식+중량</button>
                        )}
                        <button onClick={() => setSelectedColIndices([])} className="text-slate-500 px-1">취소</button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {EXTRACTION_KEYS.map((key) => {
                      const mapping = mappedColumns[key.id];
                      const isMapped = mapping !== undefined;
                      const queueIndex = clickedBadgeQueue.indexOf(key.id);
                      const isInQueue = queueIndex !== -1;

                      return (
                        <div
                          key={key.id}
                          draggable
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", key.id)}
                          onClick={() => handleBadgeClick(key.id)}
                          className={`flex items-center justify-between p-2 border rounded-lg cursor-grab active:cursor-grabbing transition text-[11px] font-bold shadow-sm select-none ${isMapped
                              ? `${key.color} border-slate-300 dark:border-slate-700`
                              : isInQueue
                                ? "bg-indigo-50 border-indigo-400 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300"
                                : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                            }`}
                          title={key.desc}
                        >
                          <span>
                            {key.label}
                            {isInQueue && (
                              <span className="ml-1 text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-extrabold">
                                {queueIndex + 1}
                              </span>
                            )}
                          </span>
                          {isMapped ? (
                            <span className="bg-white/20 px-1.5 py-0.5 rounded text-[9px]">
                              {getColLetter(mapping.col)} ({mapping.startRow === mapping.endRow ? `${mapping.startRow + 1}행` : `${mapping.startRow + 1}~${mapping.endRow + 1}행`})
                            </span>
                          ) : (
                            <span className="opacity-30">::</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 실시간 미리보기 */}
                <div className="flex-1 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-850 shadow-sm flex flex-col overflow-hidden">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Check size={13} className="text-indigo-500" /> 실시간 추출 미리보기
                  </h4>

                  {Object.keys(extractedRows).length === 0 ? (
                    <div className="flex-1 border border-dashed rounded-lg flex flex-col items-center justify-center p-4 text-center text-slate-400 text-[11px]">
                      <AlertCircle size={24} className="mb-1 opacity-40" />
                      <span>매핑된 데이터가 없습니다.</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-auto space-y-3 p-1">
                      {Object.keys(extractedRows).some(k => k !== "items") && (
                        <div className="bg-slate-50 dark:bg-slate-950 p-2 text-[10px] rounded border border-slate-150 dark:border-slate-850 space-y-1">
                          <div className="font-extrabold text-slate-500 dark:text-slate-400 mb-1 border-b pb-0.5">단일 데이터 필드 (스칼라)</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-semibold text-slate-700 dark:text-slate-300">
                            {Object.entries(extractedRows).map(([keyId, val]) => {
                              if (keyId === "items") return null;
                              const keyInfo = EXTRACTION_KEYS.find(k => k.id === keyId);
                              return (
                                <div key={keyId} className="flex items-start gap-2 border-b border-dashed border-slate-100 dark:border-slate-900 pb-0.5">
                                  <span className="text-slate-400 whitespace-nowrap">{keyInfo?.label || keyId}:</span>
                                  <span className="break-all">{String(val)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 2. 테이블 품목 데이터 출력 */}
                      {extractedRows.items && extractedRows.items.length > 0 ? (
                        <div className="overflow-auto border rounded bg-slate-50 dark:bg-slate-950 p-2 text-[10px] border-slate-150 dark:border-slate-850 max-h-[300px]">
                          <div className="font-extrabold text-slate-500 dark:text-slate-400 mb-1.5 border-b pb-1">테이블 품목 데이터 ({extractedRows.items.length}건)</div>
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="border-b text-slate-700 dark:text-slate-200 font-extrabold text-[10px] uppercase">
                                <th className="p-1">행</th>
                                {EXTRACTION_KEYS.map(key => {
                                  const mapping = mappedColumns[key.id];
                                  if (mapping === undefined || mapping.startRow === mapping.endRow || ["company_name", "hs_code", "origin"].includes(key.id)) return null;
                                  return <th key={key.id} className="p-1">{key.label}</th>;
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-900">
                              {extractedRows.items.map((row: any, idx: number) => (
                                <tr key={idx} className="text-slate-600 dark:text-slate-300 font-semibold">
                                  <td className="p-1 font-mono font-bold text-slate-455">{row._rowIndex}</td>
                                  {EXTRACTION_KEYS.map(key => {
                                    const mapping = mappedColumns[key.id];
                                    if (mapping === undefined || mapping.startRow === mapping.endRow || ["deregistration_no"].includes(key.id)) return null;
                                    return <td key={key.id} className="p-1 truncate max-w-[60px]" title={row[key.id]}>{row[key.id]}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 border border-dashed rounded p-3 text-center">
                          차량 데이터 열 매핑이 없습니다. (차대번호, 제조사, 모델 등 범위를 드래그해 매핑하세요.)
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* JSON 코드 생성 성공 모달창 */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-fade-in-up">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Check size={18} className="text-green-600" />
                <h3 className="text-base font-bold text-slate-800 dark:text-white">관세사 데이터 추출 완료</h3>
              </div>
              <button onClick={() => setShowSaveModal(false)} className="text-slate-400">✕</button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300">
                추출된 스칼라 데이터 및 **{extractedRows.items ? extractedRows.items.length : 0}건**의 품목 데이터가 매핑 구조에 맞춰 JSON 데이터로 추출되었습니다.
              </p>

              <div className="relative">
                <div className="absolute right-2 top-2 flex items-center gap-1.5">
                  <button
                    onClick={handleCopyToClipboard}
                    className="bg-white hover:bg-slate-50 dark:bg-slate-800 border p-1 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Copy size={11} />
                    {copied ? "복사됨!" : "복사"}
                  </button>
                  <button
                    onClick={handleDownloadJson}
                    className="bg-white hover:bg-slate-50 dark:bg-slate-800 border p-1 rounded text-[10px] font-bold flex items-center gap-1 shadow-sm"
                  >
                    <Download size={11} />
                    다운로드
                  </button>
                </div>
                <pre className="bg-slate-900 text-green-400 p-4 rounded-xl text-[9px] font-mono overflow-auto max-h-[200px]">
                  {JSON.stringify(extractedRows, null, 2)}
                </pre>
              </div>
            </div>

            <div className="p-5 bg-slate-50 dark:bg-slate-950 border-t flex justify-end gap-2 text-xs">
              <button onClick={() => setShowSaveModal(false)} className="bg-white border text-slate-650 px-4 py-2 rounded-xl font-bold">닫기</button>
            </div>
          </div>
        </div>
      )}
      {/* 로로선 차량 현황 모달 */}
      {activeDashboardShipment && (
        <VehicleDashboardModal
          shipmentId={activeDashboardShipment.id}
          blNumber={activeDashboardShipment.blNumber}
          onClose={() => setActiveDashboardShipment(null)}
        />
      )}

      {/* 화주 서류 업로드 알림 토스트 */}
      {docAlert && (
        <>
          <style>{`
            @keyframes wiggle-horizontal {
              0%, 100%, 50% { transform: translateX(0); }
              60%, 80% { transform: translateX(-6px); }
              70%, 90% { transform: translateX(6px); }
            }
            .animate-wiggle-horizontal {
              animation: wiggle-horizontal 2s ease-in-out infinite;
            }
          `}</style>
          <div className="fixed bottom-6 right-6 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border-l-4 border-blue-500 p-5 w-80 z-[100] animate-wiggle-horizontal">
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-full h-fit">
                  <BellRing size={20} className="animate-pulse" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-white text-sm">
                    {docAlert.photoType === 'docs' ? '새로운 서류/차대 사진 도착' : '새로운 차량 외관 사진 도착'}
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    {docAlert.photoType === 'docs' 
                      ? <><span className="font-bold text-slate-700 dark:text-slate-350">{docAlert.shipperName || '화주'}</span>로부터 말소증/차대각인사진이 도착</>
                      : <><span className="font-bold text-slate-700 dark:text-slate-350">{docAlert.shipperName || '화주'}</span>로부터 차량 외관 사진 도착</>
                    }
                    <span className="block text-[10px] text-slate-400 mt-0.5">B/L: {docAlert.blNumber}</span>
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  // 알림창 닫기를 눌렀을 때도 히스토리에 저장
                  setMissedAlerts(prev => {
                    if (prev.some(a => a.id === docAlert.id)) return prev;
                    return [...prev, { ...docAlert, saved: true }];
                  });
                  setDocAlert(null);
                }} 
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={18} />
              </button>
            </div>
            <button 
              onClick={() => {
                setActiveDashboardShipment({ id: docAlert.shipmentId, blNumber: docAlert.blNumber });
                setDocAlert(null);
              }}
              className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              확인하러가기
            </button>
          </div>
        </>
      )}
      {/* 정산서 발행 및 데빗노트 생성 모달 */}
      {isBillingModalOpen && billingShipment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl overflow-hidden border border-slate-100 my-8">
            <div className="px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">데빗노트 정산서 발행</h3>
                <p className="text-xs text-slate-300 mt-0.5">B/L 번호: {billingShipment.bl_number} | 선박: {billingShipment.vessel_name}</p>
              </div>
              <button 
                onClick={() => setIsBillingModalOpen(false)}
                className="text-white/60 hover:text-white transition font-bold"
              >
                닫기
              </button>
            </div>

            <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Parameters input grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">인보이스 번호</label>
                  <input
                    type="text"
                    value={invoiceNoInput}
                    onChange={(e) => setInvoiceNoInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">정산 대상 화주 선택</label>
                  <select
                    value={selectedBillingClientId}
                    onChange={(e) => setSelectedBillingClientId(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold bg-white"
                  >
                    {billingClients.map((c) => (
                      <option key={c.client_id} value={c.client_id}>
                        {c.client_name} ({c.client_id})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-500">적용 환율 (USD ➔ KRW)</label>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          setBillingError("");
                          const res = await axios.get("http://localhost:5000/api/billing/exchange-rate", { withCredentials: true });
                          if (res.data.success) {
                            setExchangeRateInput(String(res.data.rate));
                          }
                        } catch (err: any) {
                          setBillingError("실시간 환율을 가져오지 못했습니다.");
                        }
                      }}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold transition flex items-center gap-0.5"
                    >
                      <RefreshCw size={10} /> 실시간 갱신
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      value={exchangeRateInput}
                      onChange={(e) => setExchangeRateInput(e.target.value)}
                      className="w-full pl-3 pr-10 py-2 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold bg-white"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-slate-400 text-xs font-bold">₩</div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">납기일 (Due Date)</label>
                  <input
                    type="date"
                    value={dueDateInput}
                    onChange={(e) => setDueDateInput(e.target.value)}
                    className="w-full px-3 py-2 border rounded-xl focus:outline-none focus:border-indigo-500 text-sm font-semibold bg-white"
                  />
                </div>

                <div className="md:col-span-2 flex items-end">
                  <button
                    onClick={handleCalculateInvoice}
                    disabled={calculating}
                    className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-xl text-sm transition active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                  >
                    {calculating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        계산 중...
                      </>
                    ) : (
                      <>정산 금액 계산하기 (CBM / 마진 적용)</>
                    )}
                  </button>
                </div>
              </div>

              {/* Error box */}
              {billingError && (
                <div className="p-4 bg-red-50 text-red-800 rounded-xl border border-red-200 text-xs font-bold flex items-center gap-2">
                  <AlertCircle size={16} />
                  <span>{billingError}</span>
                </div>
              )}

              {/* Calculation results */}
              {calculationResult && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                      <p className="text-xs font-bold text-slate-400">총 해상 운임 (USD)</p>
                      <p className="text-xl font-black text-slate-800 mt-1">
                        ${Number(calculationResult.master.total_ocean_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-slate-50/50 p-4 border border-slate-100 rounded-2xl">
                      <p className="text-xs font-bold text-slate-400">로컬 비용 합계 (KRW)</p>
                      <p className="text-xl font-black text-slate-800 mt-1">
                        ₩{Number(calculationResult.master.total_local_krw).toLocaleString()}
                      </p>
                    </div>
                    <div className="bg-indigo-50 p-4 border border-indigo-100 rounded-2xl">
                      <p className="text-xs font-bold text-indigo-500">최종 청구 금액 (KRW 절사)</p>
                      <p className="text-2xl font-black text-indigo-700 mt-1">
                        ₩{Number(calculationResult.master.final_amount_krw).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Vehicles breakdown table */}
                  <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-4 py-3 border-b">
                      <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">차량별 청구 상세 정보 ({calculationResult.items.length}대)</h4>
                    </div>
                    <div className="overflow-x-auto max-h-[30vh]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                          <tr>
                            <th className="p-3 pl-4">차대번호 (VIN)</th>
                            <th className="p-3">차종 / 모델</th>
                            <th className="p-3 text-right">해상운임 (USD)</th>
                            <th className="p-3 text-right">고박료 (KRW)</th>
                            <th className="p-3 text-right">THC (KRW)</th>
                            <th className="p-3 text-right">부두사용료 (KRW)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {calculationResult.items.map((item: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50 transition font-medium">
                              <td className="p-3 pl-4 font-bold text-slate-800">{item.vin}</td>
                              <td className="p-3 text-slate-600">
                                <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded mr-1 font-bold text-[10px]">{item.cargo_type}</span>
                                {item.model_name}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-700">
                                ${Number(item.applied_ocean_usd).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-700">
                                ₩{Number(item.applied_lashing_krw).toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-700">
                                ₩{Number(item.applied_thc_krw).toLocaleString()}
                              </td>
                              <td className="p-3 text-right font-bold text-slate-700">
                                ₩{Number(item.applied_wharfage_krw || 0).toLocaleString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Document metadata (B/L Fee & Customs fee) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 border rounded-xl bg-slate-50 border-slate-100 text-xs font-bold text-slate-600 flex justify-between">
                      <span>Pass-through 서류비 (B/L Fee):</span>
                      <span>₩{Number(calculationResult.master.bl_fee_krw).toLocaleString()}</span>
                    </div>
                    <div className="p-3 border rounded-xl bg-slate-50 border-slate-100 text-xs font-bold text-slate-600 flex justify-between">
                      <span>Pass-through 관세사 수수료 (Customs):</span>
                      <span>₩{Number(calculationResult.master.customs_fee_krw).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t flex justify-end gap-3">
              <button
                onClick={() => setIsBillingModalOpen(false)}
                className="px-4 py-2 border rounded-xl hover:bg-slate-100 font-bold text-xs text-slate-600 transition"
              >
                취소
              </button>
              {calculationResult && (
                <button
                  onClick={handleSaveInvoice}
                  disabled={savingInvoice}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl transition shadow-md shadow-indigo-600/10 flex items-center gap-1.5"
                >
                  {savingInvoice ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      발행 중...
                    </>
                  ) : (
                    <>최종 청구서(데빗노트) 저장 및 발행</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
