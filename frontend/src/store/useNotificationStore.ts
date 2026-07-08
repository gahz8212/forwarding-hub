import { create } from 'zustand';

export interface NotificationAlert {
  id: string;
  type: 'booking' | 'document' | 'chat' | 'pdf' | 'general' | 'shipper_docs';
  title: string;
  message?: string;
  time: string;
  meta?: any; // blNumber, bookingId, senderName, requestTime, username, etc.
}

interface NotificationState {
  alerts: NotificationAlert[];
  missedAlerts: any[];
  showWindowsAlertDrawer: boolean;
  activeDashboardShipment: { id: number; blNumber: string } | null;
  addAlert: (alert: Omit<NotificationAlert, 'id' | 'time'>) => void;
  removeAlert: (id: string) => void;
  clearAll: () => void;
  setMissedAlerts: (updater: any[] | ((prev: any[]) => any[])) => void;
  setShowWindowsAlertDrawer: (val: boolean) => void;
  setActiveDashboardShipment: (shipment: { id: number; blNumber: string } | null) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  alerts: [],
  missedAlerts: [],
  showWindowsAlertDrawer: false,
  activeDashboardShipment: null,
  addAlert: (alert) => set((state) => {
    const id = `${alert.type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const time = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    return {
      alerts: [...state.alerts, { ...alert, id, time }]
    };
  }),
  removeAlert: (id) => set((state) => ({
    alerts: state.alerts.filter((a) => a.id !== id)
  })),
  clearAll: () => set({ alerts: [] }),
  setMissedAlerts: (updater) => set((state) => {
    const nextVal = typeof updater === 'function' ? updater(state.missedAlerts) : updater;
    return { missedAlerts: nextVal };
  }),
  setShowWindowsAlertDrawer: (val) => set({ showWindowsAlertDrawer: val }),
  setActiveDashboardShipment: (shipment) => set({ activeDashboardShipment: shipment })
}));
