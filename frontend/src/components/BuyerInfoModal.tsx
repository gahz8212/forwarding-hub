import React from 'react';
import { X, Save, Building, MapPin, Phone, Mail } from 'lucide-react';

interface BuyerInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  buyerInfo: { name: string; address: string; phone: string; email: string };
  setBuyerInfo: (info: any) => void;
  onSave: () => void;
}

const BuyerInfoModal: React.FC<BuyerInfoModalProps> = ({ isOpen, onClose, buyerInfo, setBuyerInfo, onSave }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="font-bold text-slate-800 dark:text-white text-lg">수입자(바이어) 정보 입력</h3>
          <button onClick={onClose} className="p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <div>
            <label className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5"><Building size={14} className="mr-1"/> 상호명 / 이름</label>
            <input type="text" value={buyerInfo.name} onChange={e => setBuyerInfo({...buyerInfo, name: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm" placeholder="수입자 회사명 또는 이름" />
          </div>
          <div>
            <label className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5"><MapPin size={14} className="mr-1"/> 주소</label>
            <input type="text" value={buyerInfo.address} onChange={e => setBuyerInfo({...buyerInfo, address: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm" placeholder="상세 주소" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5"><Phone size={14} className="mr-1"/> 연락처</label>
              <input type="text" value={buyerInfo.phone} onChange={e => setBuyerInfo({...buyerInfo, phone: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm" placeholder="전화번호" />
            </div>
            <div>
              <label className="flex items-center text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5"><Mail size={14} className="mr-1"/> 이메일</label>
              <input type="text" value={buyerInfo.email} onChange={e => setBuyerInfo({...buyerInfo, email: e.target.value})} className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded bg-white dark:bg-slate-800 outline-none focus:border-blue-500 text-sm" placeholder="이메일 주소" />
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">취소</button>
          <button onClick={onSave} className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 transition-colors"><Save size={16}/> 저장</button>
        </div>
      </div>
    </div>
  );
};

export default BuyerInfoModal;
