import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  FileText, 
  FileSpreadsheet, 
  FileDown, 
  AlertCircle,
  FolderOpen
} from "lucide-react";

interface DocumentItem {
  id: string; // bl_number + type
  blNumber: string;
  docType: string;
  fileName: string;
  filePath: string;
  uploadedAt: string;
}

export default function DocumentListPage() {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 선적 데이터 불러온 후 문서 리스트로 추출
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
              docType: "Commercial Invoice (상업송장)",
              fileName: s.invoice_file_path.split("/").pop() || "invoice.xlsx",
              filePath: s.invoice_file_path,
              uploadedAt: formattedDate
            });
          }

          // 2. 패킹리스트 서류가 업로드된 경우 추가
          if (s.packing_list_file_path) {
            docList.push({
              id: `${s.bl_number}-packing`,
              blNumber: s.bl_number,
              docType: "Packing List (포장명세서)",
              fileName: s.packing_list_file_path.split("/").pop() || "packing_list.xlsx",
              filePath: s.packing_list_file_path,
              uploadedAt: formattedDate
            });
          }
        });

        setDocuments(docList);
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
            화주 대시보드에서 등록된 부킹/BL별 제출 서류를 모아서 다운로드하는 공간입니다.
          </p>
        </div>
      </div>

      {/* 문서 보관 리스트 테이블 */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-500 font-bold">서류 리스트 로딩 중...</div>
          ) : error ? (
            <div className="p-12 text-center text-rose-500 font-bold">{error}</div>
          ) : documents.length === 0 ? (
            <div className="p-16 text-center text-slate-400 dark:text-slate-600 flex flex-col items-center justify-center gap-3">
              <AlertCircle size={32} className="opacity-45 text-slate-500" />
              <div>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300">보관된 선적 서류가 없습니다.</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">대시보드에서 선적에 대한 서류를 업로드해 주세요.</p>
              </div>
            </div>
          ) : (
            <table className="w-full text-left border-collapse text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="p-4 font-bold">B/L 번호</th>
                  <th className="p-4 font-bold">문서 종류</th>
                  <th className="p-4 font-bold">파일명</th>
                  <th className="p-4 font-bold">업로드 일시</th>
                  <th className="p-4 font-bold text-center">다운로드</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition font-semibold">
                    <td className="p-4 font-bold text-slate-800 dark:text-slate-200">{doc.blNumber}</td>
                    <td className="p-4 text-slate-600 dark:text-slate-400 text-xs flex items-center gap-1.5 mt-2">
                      {doc.docType.includes("Invoice") ? (
                        <FileText size={14} className="text-blue-500" />
                      ) : (
                        <FileSpreadsheet size={14} className="text-green-500" />
                      )}
                      {doc.docType}
                    </td>
                    <td className="p-4 text-slate-800 dark:text-slate-300 truncate max-w-[280px]" title={doc.fileName}>
                      {doc.fileName}
                    </td>
                    <td className="p-4 text-slate-500 dark:text-slate-400 text-xs">{doc.uploadedAt}</td>
                    <td className="p-4 text-center">
                      <a
                        href={`http://localhost:5000${doc.filePath}`}
                        target="_blank"
                        rel="noreferrer"
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
          )}
        </div>
      </div>

    </div>
  );
}
