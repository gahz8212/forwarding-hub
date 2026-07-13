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
      const res = await axios.get('http://localhost:5000/api/dispatch/vehicles', { withCredentials: true });
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
      await axios.post('http://localhost:5000/api/dispatch/assign', {
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">내륙 배차 관리</h1>
        <button 
          disabled={selectedVins.length === 0}
          onClick={() => setModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:bg-gray-400"
        >
          {selectedVins.length}대 일괄 배차 지정
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="p-4"><input type="checkbox" onChange={handleSelectAll} checked={selectedVins.length > 0 && selectedVins.length === vehicles.length} /></th>
                <th className="p-4">차대번호(VIN)</th>
                <th className="p-4">B/L 번호</th>
                <th className="p-4">도착지(POD)</th>
                <th className="p-4">탁송방식</th>
                <th className="p-4">상태</th>
                <th className="p-4">운송사</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-4 text-center">로딩 중...</td></tr>
              ) : vehicles.map(v => (
                <tr key={v.vin} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-4">
                    <input 
                      type="checkbox" 
                      checked={selectedVins.includes(v.vin)}
                      onChange={() => toggleVin(v.vin)}
                    />
                  </td>
                  <td className="p-4 font-medium">{v.vin}</td>
                  <td className="p-4 text-gray-500">{v.bl_number}</td>
                  <td className="p-4">{v.pod}</td>
                  <td className="p-4">{v.dispatch_method || '-'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${v.dispatch_status === 'DISPATCHED' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {v.dispatch_status || 'PENDING'}
                    </span>
                  </td>
                  <td className="p-4">{v.carrier_company || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
