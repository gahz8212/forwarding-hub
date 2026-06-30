import React from "react";
import { UploadCloud, FileSpreadsheet, Check } from "lucide-react";

export default function AdminSchedulePage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setSuccess(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setSuccess(false);
    }
  };

  const handleUpload = () => {
    if (!file) return;
    setUploading(true);
    // Simulate backend Excel parsing
    setTimeout(() => {
      setUploading(false);
      setSuccess(true);
      setFile(null);
      alert("선박 스케줄 엑셀 파싱 및 DB 업데이트가 정상적으로 완료되었습니다!");
    }, 2000);
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-3xl">
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-2">선박 스케줄 업로드</h3>
        <p className="text-slate-500 text-sm">
          선사(Carrier)에서 전달받은 스케줄 엑셀 파일(.xlsx)을 업로드하여 일괄적으로 스케줄 데이터베이스를 갱신할 수 있습니다.
        </p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className="bg-white border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl p-12 text-center transition cursor-pointer flex flex-col items-center justify-center"
      >
        <FileSpreadsheet size={48} className="text-slate-400 mb-4" />
        
        <p className="text-slate-700 font-bold mb-1">
          파일을 이곳에 드래그 앤 드롭 하거나 클릭하여 선택해 주세요.
        </p>
        <p className="text-slate-400 text-xs mb-6">
          지원되는 파일: .xls, .xlsx (최대 10MB)
        </p>

        <label className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2 rounded-lg text-sm transition cursor-pointer">
          파일 선택
          <input
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        {file && (
          <div className="mt-6 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 border border-blue-100">
            <span>선택된 파일: {file.name}</span>
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1 rounded transition text-xs disabled:opacity-50"
            >
              {uploading ? "업로드 중..." : "파싱 시작"}
            </button>
          </div>
        )}

        {success && (
          <div className="mt-6 bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 border border-green-200 animate-bounce">
            <Check size={16} />
            <span>최신 스케줄이 데이터베이스에 정상 적용되었습니다.</span>
          </div>
        )}
      </div>
    </div>
  );
}
