import React from "react";
import axios from "axios";
import { UploadCloud, FileSpreadsheet, Check, Globe, Ship } from "lucide-react";

export default function AdminSchedulePage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  // MSC API 스케줄 수집 상태 관리
  const [mscQuery, setMscQuery] = React.useState({
    pol: "KRPUS",
    pod: "USLGB",
    token: localStorage.getItem("msc_bearer_token") || "",
  });
  const [mscLoading, setMscLoading] = React.useState(false);
  const [mscMessage, setMscMessage] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  const handleMscFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    setMscLoading(true);
    setMscMessage(null);

    // 사용성 개선을 위해 토큰을 로컬스토리지에 캐시
    if (mscQuery.token) {
      localStorage.setItem("msc_bearer_token", mscQuery.token);
    } else {
      localStorage.removeItem("msc_bearer_token");
    }

    try {
      const res = await axios.post(
        "http://localhost:5000/api/schedules/fetch-msc",
        {
          pol: mscQuery.pol.toUpperCase().trim(),
          pod: mscQuery.pod.toUpperCase().trim(),
          token: mscQuery.token.trim(),
        },
        { withCredentials: true }
      );

      if (res.data.success) {
        setMscMessage({ type: 'success', text: res.data.message });
        alert(res.data.message);
      }
    } catch (err: any) {
      console.error(err);
      setMscMessage({
        type: 'error',
        text: err.response?.data?.message || "MSC 스케줄 수집 중 서버 에러가 발생했습니다.",
      });
    } finally {
      setMscLoading(false);
    }
  };

  return (
    <div className="animate-fade-in-up space-y-6 max-w-3xl">
      {/* 엑셀 업로드 방식 */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800 mb-2">선박 스케줄 관리</h3>
          <p className="text-slate-500 text-sm">
            선사(Carrier)에서 전달받은 스케줄 엑셀 파일(.xlsx)을 업로드하여 일괄적으로 스케줄 데이터베이스를 갱신할 수 있습니다.
          </p>
        </div>

        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-2xl p-10 text-center transition cursor-pointer flex flex-col items-center justify-center bg-slate-50/50"
        >
          <FileSpreadsheet size={40} className="text-slate-400 mb-3" />
          
          <p className="text-slate-700 font-bold text-sm mb-1">
            파일을 이곳에 드래그 앤 드롭 하거나 클릭하여 선택해 주세요.
          </p>
          <p className="text-slate-400 text-xs mb-4">
            지원되는 파일: .xls, .xlsx (최대 10MB)
          </p>

          <label className="bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold px-4 py-2 rounded-lg text-xs transition cursor-pointer shadow-sm">
            파일 선택
            <input
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          {file && (
            <div className="mt-4 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border border-blue-100">
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
            <div className="mt-4 bg-green-50 text-green-700 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 border border-green-200 animate-bounce">
              <Check size={14} />
              <span>최신 스케줄이 데이터베이스에 정상 적용되었습니다.</span>
            </div>
          )}
        </div>
      </div>

      {/* MSC API 실시간 수집 방식 */}
      <div className="bg-slate-900 rounded-2xl shadow-lg p-8 text-white relative overflow-hidden border border-slate-800">
        <div className="absolute right-0 top-0 opacity-10">
          <Globe size={180} className="transform rotate-12" />
        </div>
        <h3 className="text-lg font-bold mb-2 relative z-10 flex items-center gap-2">
          🚢 MSC 실시간 선박 스케줄 수집 (API 연동)
        </h3>
        <p className="text-slate-400 mb-6 relative z-10 text-xs leading-relaxed">
          MSC 선사의 실시간 스케줄 API를 직접 조회하여 데이터베이스에 연동합니다.
          동작을 위해 F12 개발자 도구의 Network 탭에서 가져온 Authorization Bearer 토큰이 필요합니다.
        </p>

        <form onSubmit={handleMscFetch} className="space-y-4 relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                출발항 (POL UN/LOCODE)
              </label>
              <input
                type="text"
                list="msc-admin-pol-list"
                placeholder="예: KRPUS (부산)"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500 text-sm transition uppercase"
                value={mscQuery.pol}
                onChange={(e) => setMscQuery({ ...mscQuery, pol: e.target.value })}
                required
              />
              <datalist id="msc-admin-pol-list">
                <option value="KRPUS">BUSAN (KRPUS) - 대한민국</option>
                <option value="KRINC">INCHEON (KRINC) - 대한민국</option>
                <option value="CNSHA">SHANGHAI (CNSHA) - 중국</option>
                <option value="CNTSN">TIANJIN (CNTSN) - 중국</option>
                <option value="SGPIN">SINGAPORE (SGPIN) - 싱가포르</option>
              </datalist>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 self-center">자주 찾음:</span>
                {['KRPUS', 'KRINC', 'CNSHA'].map(port => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => setMscQuery(prev => ({ ...prev, pol: port }))}
                    className="text-[10px] bg-slate-850 hover:bg-slate-750 border border-slate-700 text-slate-300 px-2 py-0.5 rounded transition"
                  >
                    {port === 'KRPUS' ? '부산' : port === 'KRINC' ? '인천' : '상하이'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                도착항 (POD UN/LOCODE)
              </label>
              <input
                type="text"
                list="msc-admin-pod-list"
                placeholder="예: USLGB (롱비치)"
                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500 text-sm transition uppercase"
                value={mscQuery.pod}
                onChange={(e) => setMscQuery({ ...mscQuery, pod: e.target.value })}
                required
              />
              <datalist id="msc-admin-pod-list">
                <option value="USLGB">LONG BEACH (USLGB) - 미국 서안</option>
                <option value="USLAX">LOS ANGELES (USLAX) - 미국 서안</option>
                <option value="USSEA">SEATTLE (USSEA) - 미국 서안</option>
                <option value="NLRTM">ROTTERDAM (NLRTM) - 네덜란드</option>
                <option value="DEHAM">HAMBURG (DEHAM) - 독일</option>
              </datalist>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-[10px] text-slate-400 self-center">자주 찾음:</span>
                {['USLGB', 'USLAX', 'NLRTM'].map(port => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => setMscQuery(prev => ({ ...prev, pod: port }))}
                    className="text-[10px] bg-slate-855 hover:bg-slate-750 border border-slate-700 text-slate-300 px-2 py-0.5 rounded transition"
                  >
                    {port === 'USLGB' ? '롱비치' : port === 'USLAX' ? 'LA' : '로테르담'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              인증 토큰 또는 쿠키 (Bearer Token / Cookie)
            </label>
            <input
              type="password"
              placeholder="F12에서 복사한 cookie 헤더 전체 또는 Bearer 토큰을 입력하세요"
              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder-slate-500 text-sm transition"
              value={mscQuery.token}
              onChange={(e) => setMscQuery({ ...mscQuery, token: e.target.value })}
              required
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs">
              {mscMessage && (
                <span className={mscMessage.type === 'success' ? "text-emerald-400 font-medium" : "text-rose-400 font-medium"}>
                  {mscMessage.text}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={mscLoading}
              className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl font-bold text-xs transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {mscLoading ? "실시간 동기화 중..." : "MSC 스케줄 가져오기"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

