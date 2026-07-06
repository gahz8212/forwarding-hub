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

interface DocumentItem {
  id: string; // bl_number + type
  blNumber: string;
  docType: string; // Commercial Invoice or Packing List
  fileName: string;
  filePath: string;
  uploadedAt: string;
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

  // 선적 데이터 불러온 후 문서 리스트로 추출 및 그룹화
  const fetchDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get("http://localhost:5000/api/tracking/all", {
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
              uploadedAt: formattedDate
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
              uploadedAt: formattedDate
            });
          }
        });

        // B/L 번호로 그룹화 진행
        const grouped: { [key: string]: DocumentItem[] } = {};
        docList.forEach(doc => {
          if (!grouped[doc.blNumber]) {
            grouped[doc.blNumber] = [];
          }
          grouped[doc.blNumber].push(doc);
        });

        const list: GroupedDocuments[] = Object.keys(grouped).map(bl => ({
          blNumber: bl,
          items: grouped[bl]
        }));

        setGroupedDocs(list);
        
        // 기본값으로 첫 번째 아코디언 열어두기
        if (list.length > 0) {
          setOpenAccordions({ [list[0].blNumber]: true });
        }
      }
    } catch (err: any) {
      console.error("문서 목록 조회 실패:", err);
      setError("문서 목록을 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

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
                  <div className="border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead className="bg-slate-50/30 dark:bg-slate-950/20 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="p-4 font-bold w-1/2">파일명 (Document Title)</th>
                          <th className="p-4 font-bold w-1/4">업로드 일시</th>
                          <th className="p-4 font-bold text-center w-1/4">다운로드</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {group.items.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/30 dark:hover:bg-slate-800/20 transition font-semibold">
                            <td className="p-4 text-slate-800 dark:text-slate-200">
                              <span className="flex items-center gap-2">
                                {doc.docType.includes("Invoice") ? (
                                  <FileText size={16} className="text-blue-500 shrink-0" />
                                ) : (
                                  <FileSpreadsheet size={16} className="text-emerald-500 shrink-0" />
                                )}
                                <span className="font-bold text-slate-800 dark:text-slate-300">{doc.fileName}</span>
                              </span>
                            </td>
                            <td className="p-4 text-slate-500 dark:text-slate-400 text-xs">{doc.uploadedAt}</td>
                            <td className="p-4 text-center">
                              <a
                                href={`http://localhost:5000/api/files/download?path=${encodeURIComponent(doc.filePath)}&name=${encodeURIComponent(doc.fileName)}`}
                                className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700 px-3.5 py-2 rounded-xl border border-blue-100 dark:border-slate-700 text-xs font-bold transition"
                                title="파일 다운로드"
                              >
                                <FileDown size={14} />
                                다운로드
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
