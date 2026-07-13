import { create } from 'zustand';

interface DispatchStoreState {
  selectedVins: string[];
  toggleVin: (vin: string) => void;
  selectAll: (vins: string[]) => void;
  clearSelection: () => void;
}

export const useDispatchStore = create<DispatchStoreState>((set) => ({
  selectedVins: [],
  toggleVin: (vin) => set((state) => ({
    selectedVins: state.selectedVins.includes(vin)
      ? state.selectedVins.filter((v) => v !== vin)
      : [...state.selectedVins, vin],
  })),
  selectAll: (vins) => set({ selectedVins: vins }),
  clearSelection: () => set({ selectedVins: [] }),
}));
