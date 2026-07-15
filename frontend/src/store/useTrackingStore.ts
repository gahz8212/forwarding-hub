import api from '../api/axios';
import { create } from 'zustand';
import axios from 'axios';

interface TrackingEvent {
  date: string;
  location: string;
  status: string;
}

interface TrackingData {
  id?: number;
  bl_number: string;
  vessel_name: string;
  status: string;
  pol: string;
  pod: string;
  etd: string;
  eta: string;
  events?: TrackingEvent[];
  last_updated: string;
  doc_closing_date?: string;
  cargo_closing_date?: string;
  invoice_file_path?: string;
  packing_list_file_path?: string;
  invoice_file_key?: string;
  packing_list_file_key?: string;
  invoice_approved?: number;
  packing_approved?: number;
  truck_date?: string;
  truck_plate_number?: string;
  truck_driver_phone?: string;
  vehicleStats?: {
    total: number;
    yardInCount: number;
  };
}

interface TrackingState {
  data: TrackingData | null;
  shipments: TrackingData[];
  loading: boolean;
  error: string | null;
  fetchTracking: (blNumber: string) => Promise<void>;
  fetchAllShipments: () => Promise<void>;
  clearData: () => void;
}

export const useTrackingStore = create<TrackingState>((set) => ({
  data: null,
  shipments: [],
  loading: false,
  error: null,
  
  fetchTracking: async (blNumber: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/api/tracking/${blNumber}`, { withCredentials: true });
      if (response.data.success) {
        set({ data: response.data.data, loading: false });
      }
    } catch (err: any) {
      set({ 
        error: err.response?.data?.message || '트래킹 정보를 불러오는 데 실패했습니다.', 
        loading: false,
        data: null
      });
    }
  },

  fetchAllShipments: async () => {
    set({ loading: true, error: null });
    try {
      const response = await api.get('/api/tracking/all', { withCredentials: true });
      if (response.data.success) {
        // 날짜 포맷 변경 (yyyy-mm-dd)
        const formatted = response.data.data.map((item: any) => ({
          ...item,
          etd: item.etd ? item.etd.split('T')[0] : '',
          eta: item.eta ? item.eta.split('T')[0] : ''
        }));
        set({ shipments: formatted, loading: false });
      }
    } catch (err: any) {
      set({ error: '선적 목록을 불러오는 데 실패했습니다.', loading: false });
    }
  },

  clearData: () => set({ data: null, error: null })
}));
