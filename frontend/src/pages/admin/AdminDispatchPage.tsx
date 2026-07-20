import api from '../../api/axios';
import React, { useEffect, useState } from 'react';
import { useDispatchStore } from '../../store/useDispatchStore';
import axios from 'axios';

interface Vehicle {
  id: number;
  vin: string;
  plate_number?: string;
  vehicle_type?: string;
  bl_number?: string;
  pod?: string;
  dispatch_method?: string;
  dispatch_status?: string;
  carrier_company?: string;
  truck_plate_number?: string;
  truck_driver_phone?: string;
  dispatch_date?: string;
  inland_cost_krw?: string;
}

export default function AdminDispatchPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const { selectedVins, toggleVin, selectAll, clearSelection } = useDispatchStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    dispatch_method: 'CAR_CARRIER',
    carrier_company: '',
    truck_plate_number: '',
    truck_driver_phone: '',
    dispatch_date: '',
    inland_cost_krw: '',
    surcharge_cost_krw: ''
  });

  const fetchVehicles = async () => {
    try {
      const res = await api.get('/api/dispatch/vehicles', { withCredentials: true });
      setVehicles(res.data);
    } catch (e) {
      alert('차량 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVehicles();
  }, []);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      selectAll(vehicles.map(v => v.vin));
    } else {
      clearSelection();
    }
  };

  const handleAssignDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedVins.length === 0) {
      alert('선택된 차량이 없습니다.');
      return;
    }

    try {
      await api.post('/api/dispatch/assign', {
        vins: selectedVins,
        ...formData
      }, { withCredentials: true });
      alert('일괄 배차 성공!');
      setModalOpen(false);
      clearSelection();
      fetchVehicles();
    } catch (error) {
      alert('배차 할당 실패');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-slate-800 dark:text-white">내륙 배차 관리</h1>
        <p className="text-xs font-bold text-slate-400 mt-1">탁송 차량들의 내륙 배차 상태와 요금을 관리합니다.</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-3xs">
        <div className="flex items-center gap-2">
          <input 
            type="checkbox" 
            id="select-all-checkbox"
            onChange={handleSelectAll} 
            checked={vehicles.length > 0 && selectedVins.length === vehicles.length} 
            className="h-4 w-4 rounded border-slate-350 dark:border-slate-700 text-blue-600 accent-blue-600 cursor-pointer"
          />
          <label htmlFor="select-all-checkbox" className="text-sm font-bold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
            전체 선택 ({vehicles.length}대)
          </label>
        </div>
        <button 
          disabled={selectedVins.length === 0}
          onClick={() => setModalOpen(true)}
          className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs md:text-sm font-bold transition duration-150 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center cursor-pointer"
        >
          {selectedVins.length}대 일괄 배차 지정
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : vehicles.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl p-8 text-center border border-slate-200/80 dark:border-slate-800 text-sm font-bold text-slate-400">
          등록된 차량이 없습니다.
        </div>
      ) : (
        {/* 데스크탑: 테이블형 */}
        <div className="hidden md:block overflow-x-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-3xs">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 font-bold w-10"></th>
                <th className="px-4 py-3 font-bold">차대번호 (VIN)</th>
                <th className="px-4 py-3 font-bold">번호판</th>
                <th className="px-4 py-3 font-bold">B/L 번호</th>
                <th className="px-4 py-3 font-bold">도착지 (POD)</th>
                <th className="px-4 py-3 font-bold">탁송방식</th>
                <th className="px-4 py-3 font-bold">운송사</th>
                <th className="px-4 py-3 font-bold text-center">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {vehicles.map(v => (
                <tr
                  key={v.vin}
                  onClick={() => toggleVin(v.vin)}
                  className={`cursor-pointer transition-colors ${
                    selectedVins.includes(v.vin)
                      ? 'bg-blue-50/60 dark:bg-blue-950/20'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedVins.includes(v.vin)}
                      onChange={(e) => { e.stopPropagation(); toggleVin(v.vin); }}
                      className="h-4 w-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800 dark:text-slate-200 text-xs tracking-tight">{v.vin}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-medium">{v.plate_number || '-'}</td>
                  <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300 text-xs">{v.bl_number || '-'}</td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{v.pod || '-'}</td>
                  <td className="px-4 py-3 text-blue-600 dark:text-blue-400 font-bold text-xs">
                    {v.dispatch_method === 'CAR_CARRIER' ? '카캐리어' : v.dispatch_method === 'DRIVER_DISPATCH' ? '인탁송' : v.dispatch_method === 'SELF_LOADER' ? '셀프로더' : v.dispatch_method || '-'}
                  </td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-300 max-w-[140px] truncate">{v.carrier_company || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide ${
                      v.dispatch_status === 'DISPATCHED'
                        ? 'bg-emerald-500 text-white dark:bg-emerald-950/30 dark:text-emerald-400'
                        : 'bg-slate-100 text-slate-650 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {v.dispatch_status || 'PENDING'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일: 카드형 */}
        <div className="md:hidden grid grid-cols-1 gap-4">
          {vehicles.map(v => (
            <div
              key={v.vin}
              onClick={() => toggleVin(v.vin)}
              className={`relative p-4 rounded-xl border transition-all duration-150 cursor-pointer select-none bg-white dark:bg-slate-900 ${
                selectedVins.includes(v.vin)
                  ? 'border-blue-500 bg-blue-50/20 dark:bg-blue-950/10 shadow-sm ring-1 ring-blue-500/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-350 dark:hover:border-slate-700 shadow-3xs'
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedVins.includes(v.vin)}
                    onChange={(e) => { e.stopPropagation(); toggleVin(v.vin); }}
                    className="h-4 w-4 rounded text-blue-600 accent-blue-600 cursor-pointer"
                  />
                  <span className="font-mono font-bold text-slate-850 dark:text-slate-200 text-xs tracking-tight truncate max-w-[180px]" title={v.vin}>{v.vin}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black tracking-wide shrink-0 ${
                  v.dispatch_status === 'DISPATCHED'
                    ? 'bg-emerald-500 text-white dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-slate-100 text-slate-650 dark:bg-slate-800 dark:text-slate-400'
                }`}>
                  {v.dispatch_status || 'PENDING'}
                </span>
              </div>
              <div className="space-y-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-850 pb-1.5">
                  <span className="text-slate-400 font-medium">B/L 번호:</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">{v.bl_number || '-'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-850 pb-1.5">
                  <span className="text-slate-400 font-medium">도착지(POD):</span>
                  <span className="text-slate-700 dark:text-slate-300">{v.pod || '-'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-100 dark:border-slate-850 pb-1.5">
                  <span className="text-slate-400 font-medium">탁송방식:</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {v.dispatch_method === 'CAR_CARRIER' ? '카캐리어' : v.dispatch_method === 'DRIVER_DISPATCH' ? '인탁송' : v.dispatch_method === 'SELF_LOADER' ? '셀프로더' : v.dispatch_method || '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-medium">운송사:</span>
                  <span className="text-slate-700 dark:text-slate-300 truncate max-w-[120px]" title={v.carrier_company || ''}>{v.carrier_company || '-'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded-lg w-full max-w-md shadow-xl">
            <h2 className="text-xl font-bold mb-4">일괄 배차 정보 입력</h2>
            <form onSubmit={handleAssignDispatch} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-700 mb-1">탁송 방식</label>
                <select 
                  className="w-full border p-2 rounded" 
                  value={formData.dispatch_method} 
                  onChange={e => setFormData({...formData, dispatch_method: e.target.value})}
                >
                  <option value="CAR_CARRIER">카캐리어</option>
                  <option value="DRIVER_DISPATCH">인탁송</option>
                  <option value="SELF_LOADER">셀프로더</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">운송사 이름</label>
                <input type="text" className="w-full border p-2 rounded" value={formData.carrier_company} onChange={e => setFormData({...formData, carrier_company: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm text-gray-700 mb-1">기사 연락처</label>
                <input type="text" className="w-full border p-2 rounded" value={formData.truck_driver_phone} onChange={e => setFormData({...formData, truck_driver_phone: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-700 mb-1 font-bold">내륙 탁송료 (대당 원가, ₩)</label>
                  <input type="number" placeholder="예: 100000" className="w-full border p-2 rounded" value={formData.inland_cost_krw} onChange={e => setFormData({...formData, inland_cost_krw: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1 font-bold">할증료 (대당, ₩)</label>
                  <input type="number" placeholder="예: 0" className="w-full border p-2 rounded" value={formData.surcharge_cost_krw} onChange={e => setFormData({...formData, surcharge_cost_krw: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 border rounded text-gray-600">취소</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded">저장</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
