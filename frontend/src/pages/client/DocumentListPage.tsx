import api, { API_BASE_URL } from '../../api/axios';
import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  FileText, 
  FileSpreadsheet, 
  FileDown, 
  AlertCircle,
  FolderOpen,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { useTrackingStore } from '../../store/useTrackingStore';

interface DocumentItem {
  id: string; // bl_number + type
  blNumber: string;
  docType: string; // Commercial Invoice or Packing List
  fileName: string;
  filePath: string;
  uploadedAt: string;
  approved?: number;
  fileKey?: string;
}

interface GroupedDocuments {
  blNumber: string;
  items: DocumentItem[];
}

export default function DocumentListPage() {
  const [groupedDocs, setGroupedDocs] = useState<GroupedDocuments[]>([]);
  const [openAccordions, setOpenAccordions] = useState<{ [blNumber: string]: boolean }>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadedDocs, setDownloadedDocs] = useState<{ [docId: string]: boolean }>({});

  const { fetchAllShipments, fetchTracking } = useTrackingStore();

  // 선적 데이터 불러온 후 문서 리스트로 추출 및 그룹화
  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/tracking/all", {
        withCredentials: true
      });
      if (res.data.success) {
        const shipments = res.data.data || [];
        const docList: DocumentItem[] = [];

        shipments.forEach((s: any) => {
          const formattedDate = s.last_updated 
            ? s.last_updated.replace('T', ' ').slice(0, 16)
            : "-";

          // 1. 인보이스 서류가 업로드된 경우 추가
          if (s.invoice_file_path) {
            docList.push({
              id: `${s.bl_number}-invoice`,
              blNumber: s.bl_number,
              docType: "Commercial Invoice",
              fileName: "Commercial Invoice",
              filePath: s.invoice_file_path,
              uploadedAt: formattedDate,
              approved: s.invoice_approved,
              fileKey: s.invoice_file_key
            });
          }

          // 2. 패킹리스트 서류가 업로드된 경우 추가
          if (s.packing_list_file_path) {
            docList.push({
              id: `${s.bl_number}-packing`,
              blNumber: s.bl_number,
              docType: "Packing List",
              fileName: "Packing List",
              filePath: s.packing_list_file_path,
              uploadedAt: formattedDate,
              approved: s.packing_approved,
              fileKey: s.packing_list_file_key
            });
          }
        });

        // B/L 기준으로 그룹화
        const groupedMap = docList.reduce((acc: { [key: string]: DocumentItem[] }, curr) => {
          if (!acc[curr.blNumber]) {
            acc[curr.blNumber] = [];
          }
          acc[curr.blNumber].push(curr);
          return acc;
        }, {});

        const groupedArray = Object.keys(groupedMap).map(bl => ({
          blNumber: bl,
          items: groupedMap[bl]
        }));

        setGroupedDocs(groupedArray);
        
        // 처음 렌더링 시 모든 아코디언 열어두기
        if (Object.keys(openAccordions).length === 0) {
          const initialOpenState: { [key: string]: boolean } = {};
          groupedArray.forEach(g => {
            initialOpenState[g.blNumber] = true;
          });
          setOpenAccordions(initialOpenState);
        }
      } else {
        setError(res.data.message || "서류 데이터를 불러올 수 없습니다.");
      }
    } catch (err) {
      setError("서버 에러가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleApproveDocument = async (blNumber: string, docType: 'invoice' | 'packing') => {
    try {
      const res = await api.post("/api/tracking/approve-doc", {
        blNumber,
        docType
      }, { withCredentials: true });
      
      if (res.data.success) {
        alert(res.data.message);
        fetchDocuments();
        // Zustand 스토어 업데이트
        fetchAllShipments();
        fetchTracking(blNumber);
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "서류 승인 처리 중 에러가 발생했습니다.");
    }
  };

  const handleDeleteDocument = async (blNumber: string, docType: 'invoice' | 'packing') => {
    if (!confirm(`정말로 해당 ${docType === 'invoice' ? '상업송장' : '패킹리스트'} 서류를 삭제하시겠습니까?`)) {
      return;
    }
    try {
      const res = await api.post("/api/tracking/delete-doc", {
        blNumber,
        docType
      }, { withCredentials: true });
      
      if (res.data.success) {
        alert(res.data.message);
        fetchDocuments();
      }
    } catch (err: any) {
      alert(err.response?.data?.message || "서류 삭제 처리 중 에러가 발생했습니다.");
    }
  };

  const toggleAccordion = (blNumber: string) => {
    setOpenAccordions(prev => ({
      ...prev,
      [blNumber]: !prev[blNumber]
    }));
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      
      {/* 선적 문서 보관소 헤더 */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
          <FolderOpen size={24} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">선적 서류 보관소</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            등록된 B/L별로 업로드 및 생성 완료된 공식 선적 서류들을 모아서 다운로드하는 공간입니다.
          </p>
        </div>
      </div>

      {/* 아코디언 형태의 문서 보관함 리스트 */}
      <div className="space-y-4">
        {loading ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-12 text-center text-slate-500 font-bold">
            서류 리스트 로딩 중...
          </div>
        ) : error ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-12 text-center text-rose-500 font-bold">
            {error}
          </div>
        ) : groupedDocs.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border p-16 text-center text-slate-400 dark:text-slate-600 flex flex-col items-center justify-center gap-3">
            <AlertCircle size={32} className="opacity-45 text-slate-500" />
            <div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">보관된 선적 서류가 없습니다.</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">대시보드에서 선적에 대한 서류를 업로드해 주세요.</p>
            </div>
          </div>
        ) : (
          groupedDocs.map((group) => {
            const isOpen = !!openAccordions[group.blNumber];
            return (
              <div 
                key={group.blNumber} 
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm transition-all"
              >
                {/* Accordion Header */}
                <button
                  onClick={() => toggleAccordion(group.blNumber)}
                  className="w-full flex items-center justify-between p-5 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition font-bold text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">B/L Number</span>
                    <span className="font-mono text-base font-black text-blue-700 dark:text-blue-400">
                      {group.blNumber}
                    </span>
                    <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs px-2.5 py-0.5 rounded-full font-bold ml-2">
                      서류 {group.items.length}개
                    </span>
                  </div>
                  {isOpen ? (
                    <ChevronUp className="text-slate-500" size={20} />
                  ) : (
                    <ChevronDown className="text-slate-500" size={20} />
                  )}
                </button>

                {/* Accordion Body */}
                {isOpen && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {/* 모바일 카드 뷰 */}
                    <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/20">
                      {group.items.map((doc) => {
                        const docTypeKey = doc.docType.includes("Invoice") ? 'invoice' : 'packing';
                        const isDownloaded = !!downloadedDocs[doc.id];
                        const isApproved = doc.approved === 1;

                        return (
                          <div key={doc.id} className="p-4 space-y-3">
                            <div className="flex justify-between items-start gap-2">
                              <div className="flex items-center gap-2 truncate">
                                {docTypeKey === 'invoice' ? (
                                  <FileText size={16} className="text-blue-500 shrink-0" />
                                ) : (
                                  <FileSpreadsheet size={16} className="text-emerald-500 shrink-0" />
                                )}
                                <span className="font-bold text-slate-800 dark:text-slate-300 truncate">{doc.fileName}</span>
                              </div>
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">{doc.uploadedAt}</span>
                            </div>

                            <div className="flex flex-wrap gap-2 pt-1 justify-end">
                              <a
                                href={`${API_BASE_URL}/api/files/download?path=${encodeURIComponent(doc.filePath)}&name=${encodeURIComponent(doc.fileName)}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={() => setDownloadedDocs(prev => ({ ...prev, [doc.id]: true }))}
                                className="inline-flex items-center justify-center gap-1 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg border border-blue-100 dark:border-slate-700 text-xs font-bold transition"
                                title="파일 다운로드"
                              >
                                <FileDown size={14} />
                                다운로드
                              </a>
                              
                              {isApproved ? (
                                <span className="text-green-600 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-1.5 rounded-lg text-xs font-bold shrink-0">
                                  승인 완료
                                </span>
                              ) : (
                                !doc.fileKey && (
                                  <button
                                    onClick={() => handleApproveDocument(doc.blNumber, docTypeKey)}
                                    disabled={!isDownloaded}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition border flex items-center gap-1 shrink-0 ${
                                      isDownloaded 
                                        ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-sm cursor-pointer"
                                        : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
                                    }`}
                                  >
                                    승인
                                  </button>
                                )
                              )}
                              
                              <button
                                onClick={() => handleDeleteDocument(doc.blNumber, docTypeKey)}
                                className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-800 text-xs font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-slate-800 px-3 py-1.5 rounded-lg transition cursor-pointer shrink-0"
                              >
                                삭제
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 데스크탑 테이블 뷰 */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead className="bg-slate-50/30 dark:bg-slate-950/20 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                          <tr>
                            <th className="p-4 font-bold w-2/5">파일명 (Document Title)</th>
                            <th className="p-4 font-bold w-1/5">업로드 일시</th>
                            <th className="p-4 font-bold text-center w-2/5">작업</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {group.items.map((doc) => {
                            const docTypeKey = doc.docType.includes("Invoice") ? 'invoice' : 'packing';
                            const isDownloaded = !!downloadedDocs[doc.id];
                            const isApproved = doc.approved === 1;

                            return (
                              <tr key={doc.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition font-semibold">
                                <td className="p-4 text-slate-800 dark:text-slate-200">
                                  <span className="flex items-center gap-2">
                                    {docTypeKey === 'invoice' ? (
                                      <FileText size={16} className="text-blue-500 shrink-0" />
                                    ) : (
                                      <FileSpreadsheet size={16} className="text-emerald-500 shrink-0" />
                                    )}
                                    <span className="font-bold text-slate-800 dark:text-slate-300">{doc.fileName}</span>
                                  </span>
                                </td>
                                <td className="p-4 text-slate-500 dark:text-slate-400 text-xs">{doc.uploadedAt}</td>
                                <td className="p-4 text-center">
                                  <div className="flex gap-2 justify-center items-center">
                                    <a
                                      href={`${API_BASE_URL}/api/files/download?path=${encodeURIComponent(doc.filePath)}&name=${encodeURIComponent(doc.fileName)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={() => setDownloadedDocs(prev => ({ ...prev, [doc.id]: true }))}
                                      className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 px-3.5 py-1.5 rounded-lg border border-blue-100 dark:border-slate-700 text-xs font-bold transition"
                                      title="파일 다운로드"
                                    >
                                      <FileDown size={14} />
                                      다운로드 및 확인
                                    </a>
                                    {isApproved ? (
                                      <span className="text-green-600 bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 px-3 py-1.5 rounded-lg text-xs font-bold">
                                        승인 완료
                                      </span>
                                    ) : (
                                      !doc.fileKey && (
                                        <button
                                          onClick={() => handleApproveDocument(doc.blNumber, docTypeKey)}
                                          disabled={!isDownloaded}
                                          className={`text-xs font-bold px-3 py-1.5 rounded-lg transition border flex items-center gap-1 ${
                                            isDownloaded 
                                              ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-sm cursor-pointer"
                                              : "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500 dark:border-slate-700"
                                          }`}
                                        >
                                          승인
                                        </button>
                                      )
                                    )}
                                    <button
                                      onClick={() => handleDeleteDocument(doc.blNumber, docTypeKey)}
                                      className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-800 text-xs font-bold flex items-center gap-1 border border-rose-200 dark:border-rose-800 bg-rose-50/50 dark:bg-slate-800 px-3 py-1.5 rounded-lg transition cursor-pointer"
                                    >
                                      삭제
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
