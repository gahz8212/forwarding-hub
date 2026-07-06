import React, { useState, useEffect } from 'react';
import { X, CheckCircle, Image as ImageIcon, Loader2 } from 'lucide-react';

interface PendingDocsModalProps {
  isOpen: boolean;
  onClose: () => void;
  unclassifiedPhotos: string[];
  onConfirm: (selectedUrls: string[]) => Promise<void>;
}

// URL이 상대경로인 경우 localhost 기준으로 보정
function normalizeUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('/uploads/')) {
    return `http://localhost:5000${url}`;
  }
  return url;
}

const HoverZoomImage = ({ url, isSelected, onClick }: { url: string, isSelected: boolean, onClick: () => void }) => {
  const [zoomStyle, setZoomStyle] = useState<React.CSSProperties>({});
  const [isHovered, setIsHovered] = useState(false);
  const [hasError, setHasError] = useState(false);

  const normalizedUrl = normalizeUrl(url);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { left, top, width, height } = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - left) / width) * 100;
    const y = ((e.clientY - top) / height) * 100;
    
    setZoomStyle({
      transformOrigin: `${x}% ${y}%`,
      transform: 'scale(3)'
    });
  };

  return (
    <div 
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setZoomStyle({}); }}
      onMouseMove={handleMouseMove}
      className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all duration-200 ${
        isSelected 
          ? 'border-blue-500 shadow-lg shadow-blue-200' 
          : 'border-transparent opacity-70 hover:opacity-100 hover:border-slate-300'
      }`}
    >
      {hasError ? (
        <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs text-center px-2 leading-tight">사진을 불러올 수 없습니다</span>
        </div>
      ) : (
        <img 
          src={normalizedUrl} 
          alt="대기 사진" 
          className="w-full h-full object-cover transition-transform duration-[50ms] ease-out"
          style={isHovered ? zoomStyle : {}}
          onError={(e) => {
            console.warn('[PendingDocsModal] 이미지 로드 실패:', normalizedUrl);
            setHasError(true);
          }}
        />
      )}
      
      {/* Checkbox Overlay */}
      <div className="absolute top-2 right-2 pointer-events-none">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center border-2 shadow-sm ${
          isSelected 
            ? 'bg-blue-500 border-blue-500 text-white' 
            : 'bg-white/80 border-slate-300 text-transparent'
        }`}>
          <CheckCircle size={18} className={isSelected ? 'block' : 'hidden'} />
        </div>
      </div>

      {/* Filename tooltip at bottom */}
      {!isSelected && !hasError && (
        <div 
          className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none transition-opacity duration-200"
          style={{ opacity: isHovered ? 0 : 1 }}
        >
          <span className="bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
            제외됨
          </span>
        </div>
      )}
    </div>
  );
};

export default function PendingDocsModal({ isOpen, onClose, unclassifiedPhotos, onConfirm }: PendingDocsModalProps) {
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // By default, select all photos
      setSelectedUrls(new Set(unclassifiedPhotos));
    }
  }, [isOpen, unclassifiedPhotos]);

  if (!isOpen) return null;

  const toggleSelection = (url: string) => {
    const newSet = new Set(selectedUrls);
    if (newSet.has(url)) {
      newSet.delete(url);
    } else {
      newSet.add(url);
    }
    setSelectedUrls(newSet);
  };

  const handleConfirm = async () => {
    if (selectedUrls.size === 0) {
      alert("분석할 사진을 최소 1장 이상 선택해주세요.");
      return;
    }
    setLoading(true);
    try {
      await onConfirm(Array.from(selectedUrls));
      onClose();
    } catch (err) {
      console.error(err);
      alert("AI 분석 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <CheckCircle className="text-blue-500" />
              대기 중인 사진 검수 및 AI 분석
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              화주가 업로드한 사진 중, <b>말소증이나 차대번호 서류</b>에만 체크(✅)한 뒤 분석을 실행하세요.<br/>
              체크를 해제한 외관 사진들은 미분류 사진함에 그대로 보관됩니다.
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content - Image Grid */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50 dark:bg-slate-900/50">
          {unclassifiedPhotos.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ImageIcon size={48} className="mx-auto mb-4 opacity-50" />
              <p>대기 중인 사진이 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-5">
              {unclassifiedPhotos.map((url, idx) => {
                const isSelected = selectedUrls.has(url);
                return (
                  <HoverZoomImage 
                    key={idx}
                    url={url}
                    isSelected={isSelected}
                    onClick={() => toggleSelection(url)}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-between items-center">
          <div className="text-sm font-bold text-slate-600 dark:text-slate-400">
            총 <span className="text-blue-600">{unclassifiedPhotos.length}</span>장 중 
            <span className="text-emerald-600 ml-1">{selectedUrls.size}</span>장 선택됨
          </div>
          <div className="flex gap-3">
            <button 
              onClick={onClose}
              className="px-5 py-2.5 rounded-lg font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              취소
            </button>
            <button 
              onClick={handleConfirm}
              disabled={loading || selectedUrls.size === 0}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold shadow-sm transition-colors disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  AI 분석 진행 중...
                </>
              ) : (
                <>
                  <CheckCircle size={18} />
                  선택한 사진 AI 분석 실행
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
