import React, { useEffect, useState } from "react";
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
  X
} from "lucide-react";

interface ExtractionKey {
  id: string;
  label: string;
  desc: string;
  color: string;
}

const EXTRACTION_KEYS: ExtractionKey[] = [
  // { id: "company_name", label: "회사명", desc: "회사명/바이어명", color: "bg-cyan-600 text-white hover:bg-cyan-700 border-cyan-700" },
  { id: "prod_name", label: "품명", desc: "물품의 품명/상세명칭", color: "bg-blue-600 text-white hover:bg-blue-700 border-blue-700" },
  { id: "quantity", label: "수량", desc: "물품의 수량", color: "bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700" },
  { id: "unit", label: "단위", desc: "수량 단위 (PCS, BOX 등)", color: "bg-teal-600 text-white hover:bg-teal-700 border-teal-700" },
  { id: "unit_price", label: "단가", desc: "물품 개당 단가", color: "bg-amber-600 text-white hover:bg-amber-700 border-amber-700" },
  { id: "amount", label: "금액", desc: "총 금액 (수량 x 단가)", color: "bg-violet-600 text-white hover:bg-violet-700 border-violet-700" },
  { id: "spec", label: "규격", desc: "규격/모델명", color: "bg-indigo-600 text-white hover:bg-indigo-700 border-indigo-700" },
  { id: "hs_code", label: "HS코드", desc: "수출입 세관 HS Code", color: "bg-pink-600 text-white hover:bg-pink-700 border-pink-700" },
  { id: "origin", label: "제조국", desc: "원산지 (Origin)", color: "bg-rose-600 text-white hover:bg-rose-700 border-rose-700" }
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
  const [mappedColumns, setMappedColumns] = useState<Record<string, { col: number; startRow: number; endRow: number }>>({}); // keyId -> mapping details
  const [selectedColIndices, setSelectedColIndices] = useState<number[]>([]);
  const [dragOverColIndex, setDragOverColIndex] = useState<number | null>(null);

  // 셀 드래깅 영역 및 배지 큐
  const [dragStartCell, setDragStartCell] = useState<{ row: number; col: number } | null>(null);
  const [dragEndCell, setDragEndCell] = useState<{ row: number; col: number } | null>(null);
  const [clickedBadgeQueue, setClickedBadgeQueue] = useState<string[]>([]);

  // 최종 추출 데이터 모달 상태
  const [showSaveModal, setShowSaveModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

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
        alert(res.data.message);
        setIsVerifierOpen(false);
        fetchShipments();
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

  const getMappedKey = (colIndex: number): ExtractionKey | null => {
    const entry = Object.entries(mappedColumns).find(([_, mapping]) => mapping.col === colIndex);
    if (entry) {
      return EXTRACTION_KEYS.find(k => k.id === entry[0]) || null;
    }
    return null;
  };

  // 현재 셀이 어떤 매핑 데이터의 startRow 한 칸 위(라벨 위치)인지 식별하는 헬퍼
  const getBadgeForKeyAtCell = (r: number, c: number): ExtractionKey | null => {
    const entry = Object.entries(mappedColumns).find(([_, mapping]) => {
      return mapping.col === c && (mapping.startRow - 1 === r);
    });
    if (entry) {
      return EXTRACTION_KEYS.find(k => k.id === entry[0]) || null;
    }
    return null;
  };

  const isCellInSelection = (rowIdx: number, colIdx: number): boolean => {
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
      // 기존에 이 열(colIndex)에 매핑되어 있던 다른 키 삭제
      Object.keys(updated).forEach(k => {
        if (updated[k].col === colIndex) delete updated[k];
      });
      updated[keyId] = { col: colIndex, startRow, endRow };
      return updated;
    });
  };

  const handleCellMouseDown = (rowIdx: number, colIdx: number) => {
    setDragStartCell({ row: rowIdx, col: colIdx });
    setDragEndCell({ row: rowIdx, col: colIdx });
    setSelectedColIndices([colIdx]);
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
      setSelectedColIndices(cols);

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

  const handleHeaderMouseDown = (colIndex: number) => {
    setDragStartCell({ row: -1, col: colIndex });
    setDragEndCell({ row: -1, col: colIndex });
    setSelectedColIndices([colIndex]);
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
      setSelectedColIndices(cols);

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
          // 기존에 이 열(colIdx)에 매핑되어 있던 다른 키 삭제
          Object.keys(updated).forEach(k => {
            if (updated[k].col === colIdx) delete updated[k];
          });
          updated[keyId] = { col: colIdx, startRow: minRow, endRow: maxRow };
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
            clickedBadgeQueue.forEach((keyId) => {
              const colIdx = minCol + colOffset;
              if (colIdx <= maxCol) {
                // 기존 매핑 제거
                Object.keys(updated).forEach(k => {
                  if (updated[k].col === colIdx) delete updated[k];
                });
                updated[keyId] = { col: colIdx, startRow: minRow, endRow: maxRow };
              }
              colOffset++;
            });
            return updated;
          });
          setClickedBadgeQueue([]);
          setSelectedColIndices([]);
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
        result[k] = rowVal[mapping.col] || "";
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
            if (r >= mapping.startRow && r <= mapping.endRow) {
              const val = rowVal[mapping.col];
              if (val !== undefined && val !== null && val !== "") {
                rowObj[k] = val;
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
    <div className="space-y-6">
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
                              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-sm"
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
                            const mappedKey = getMappedKey(colIndex);

                            return (
                              <th
                                key={colIndex}
                                className={`min-w-[130px] p-2 border border-slate-200 dark:border-slate-800 text-center relative select-none cursor-pointer transition ${isSelected
                                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 font-bold border-blue-300 dark:border-blue-700'
                                    : isDragOver
                                      ? 'bg-indigo-50 dark:bg-indigo-950/40 border-dashed border-indigo-400'
                                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                  }`}
                                onMouseDown={() => handleHeaderMouseDown(colIndex)}
                                onMouseEnter={(e) => handleHeaderMouseEnter(colIndex, e)}
                                onDragOver={(e) => { e.preventDefault(); setDragOverColIndex(colIndex); }}
                                onDragLeave={() => setDragOverColIndex(null)}
                                onDrop={(e) => handleColDrop(colIndex, -1, e)}
                              >
                                <div className="flex flex-col items-center justify-center min-h-[44px]">
                                  <span className="text-sm font-extrabold">{letter}</span>
                                  {/* startRow가 0(첫 번째 행)이라 위쪽 칸이 없을 때만 최상단 고정 헤더에 배지 렌더링 */}
                                  {mappedKey && mappedColumns[mappedKey.id].startRow === 0 && (
                                    <div className={`mt-1 text-[9px] px-1.5 py-0.5 rounded font-bold flex flex-col items-center gap-0.5 shadow-sm ${mappedKey.color}`}>
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
                                  )}
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
                              const mappedKey = getMappedKey(colIndex);
                              const isDuplicateToLeft = colIndex > 0 && cellVal !== null && cellVal !== undefined && cellVal !== "" && cellVal === row[colIndex - 1];
                              const displayVal = isDuplicateToLeft
                                ? ""
                                : (cellVal === null || cellVal === undefined ? "" : String(cellVal));

                              const isHighlighted = isCellInSelection(rowIndex, colIndex);
                              const cellBadge = getBadgeForKeyAtCell(rowIndex, colIndex);

                              return (
                                <td
                                  key={colIndex}
                                  className={`p-2.5 border whitespace-normal break-all max-w-[250px] transition select-none ${isHighlighted
                                      ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-400 dark:border-indigo-700 text-indigo-900 dark:text-indigo-100 font-bold'
                                      : isSelected
                                        ? 'bg-blue-50/70 dark:bg-blue-950/10 border-slate-200 dark:border-slate-800'
                                        : isDragOver
                                          ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-slate-200 dark:border-slate-800'
                                          : cellBadge // 배지가 위치하는 라벨 셀에 부드러운 강조 배경
                                            ? 'bg-indigo-50/20 dark:bg-indigo-950/10 border-2 border-indigo-400 dark:border-indigo-700'
                                            : mappedKey
                                              ? 'bg-indigo-50/20 dark:bg-indigo-950/5 border-x border-dashed border-indigo-200 dark:border-indigo-850'
                                              : 'border-slate-200 dark:border-slate-800'
                                    }`}
                                  onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                                  onMouseEnter={(e) => handleCellMouseEnter(rowIndex, colIndex, e)}
                                  onDragOver={(e) => { e.preventDefault(); setDragOverColIndex(colIndex); }}
                                  onDragLeave={() => setDragOverColIndex(null)}
                                  onDrop={(e) => handleColDrop(colIndex, rowIndex, e)}
                                  title={displayVal}
                                >
                                  {cellBadge && (
                                    <div className={`mb-1.5 text-[9.5px] px-1.5 py-0.5 rounded font-extrabold flex items-center justify-between gap-1 shadow-sm ${cellBadge.color}`}>
                                      <span>{cellBadge.label}</span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          removeMapping(cellBadge.id);
                                        }}
                                        className="hover:text-red-200 font-bold ml-1"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  )}
                                  <span className={mappedKey ? "font-bold text-indigo-850 dark:text-indigo-300" : "text-slate-900 dark:text-slate-100 font-medium"}>
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
                          <button onClick={() => handleBatchMap(['prod_name', 'quantity', 'unit'])} className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">품명+수량+단위</button>
                        )}
                        {selectedColIndices.length === 4 && (
                          <button onClick={() => handleBatchMap(['prod_name', 'quantity', 'unit', 'unit_price'])} className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">품명+수량+단위+단가</button>
                        )}
                        {selectedColIndices.length === 5 && (
                          <button onClick={() => handleBatchMap(['prod_name', 'quantity', 'unit', 'unit_price', 'amount'])} className="bg-blue-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">품명+수량+단위+단가+금액</button>
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
                      {/* 1. 단일 셀 스칼라 값 출력 */}
                      {Object.keys(extractedRows).some(k => k !== "items") && (
                        <div className="bg-slate-50 dark:bg-slate-950 p-2 text-[10px] rounded border border-slate-150 dark:border-slate-850 space-y-1">
                          <div className="font-extrabold text-slate-500 dark:text-slate-400 mb-1 border-b pb-0.5">단일 데이터 필드 (스칼라)</div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-semibold text-slate-700 dark:text-slate-300">
                            {Object.entries(extractedRows).map(([keyId, val]) => {
                              if (keyId === "items") return null;
                              const keyInfo = EXTRACTION_KEYS.find(k => k.id === keyId);
                              return (
                                <div key={keyId} className="flex justify-between border-b border-dashed border-slate-100 dark:border-slate-900 pb-0.5">
                                  <span className="text-slate-400">{keyInfo?.label || keyId}:</span>
                                  <span>{String(val)}</span>
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
                                  if (mapping === undefined || ["company_name", "hs_code", "origin"].includes(key.id)) return null;
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
                                    if (mapping === undefined || ["company_name", "hs_code", "origin"].includes(key.id)) return null;
                                    return <td key={key.id} className="p-1 truncate max-w-[60px]" title={row[key.id]}>{row[key.id]}</td>;
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 border border-dashed rounded p-3 text-center">
                          품목 데이터 열 매핑이 없습니다. (품명, 수량, 단위 등 범위를 드래그해 매핑하세요.)
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
    </div>
  );
}
