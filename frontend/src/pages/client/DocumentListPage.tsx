import React from "react";
import { FolderOpen, FileDown, UploadCloud } from "lucide-react";

export default function DocumentListPage() {
  const mockDocs = [
    {
      id: 1,
      blNumber: "KMTC1234",
      docType: "Commercial Invoice / Packing List",
      fileName: "CI_PL_KMTC1234_v2.pdf",
      size: "1.2 MB",
      updatedAt: "2026-06-29 14:20",
    },
    {
      id: 2,
      blNumber: "KMTC1234",
      docType: "Export Declaration (수출신고필증)",
      fileName: "EXP_DECLARATION_KMTC1234.pdf",
      size: "680 KB",
      updatedAt: "2026-06-29 16:30",
    },
    {
      id: 3,
      blNumber: "KMTC9999",
      docType: "Surrendered B/L",
      fileName: "Surrendered_BL_KMTC9999.pdf",
      size: "820 KB",
      updatedAt: "2026-06-25 11:05",
    },
  ];

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">서류함 업로드</h3>
          <p className="text-slate-500 text-sm mt-1">
            관련 세관 서류, 상업 송장, 패킹 리스트 등의 문서를 업로드해 주세요.
          </p>
        </div>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-5 py-2.5 rounded-xl transition flex items-center gap-2 shadow-sm">
          <UploadCloud size={18} />
          파일 업로드
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden">
        <div className="p-6 border-b bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">선적 문서 보관소</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-sm uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="p-4 font-bold">B/L 번호</th>
                <th className="p-4 font-bold">문서 종류</th>
                <th className="p-4 font-bold">파일명</th>
                <th className="p-4 font-bold">파일 용량</th>
                <th className="p-4 font-bold">업로드 일시</th>
                <th className="p-4 font-bold text-center">다운로드</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mockDocs.map((doc) => (
                <tr key={doc.id} className="hover:bg-slate-50 transition">
                  <td className="p-4 font-bold text-slate-800">{doc.blNumber}</td>
                  <td className="p-4 text-slate-600 text-sm font-semibold">{doc.docType}</td>
                  <td className="p-4 text-slate-800 text-sm truncate max-w-[200px]">{doc.fileName}</td>
                  <td className="p-4 text-slate-500 text-sm">{doc.size}</td>
                  <td className="p-4 text-slate-500 text-sm">{doc.updatedAt}</td>
                  <td className="p-4 text-center">
                    <button className="text-blue-600 hover:text-blue-700 p-1.5 rounded-lg border border-blue-100 hover:bg-blue-50 transition">
                      <FileDown size={16} />
                    </button>
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
