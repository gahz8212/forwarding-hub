import { create } from 'zustand';

export interface NotificationAlert {
  id: string;
  type: 'booking' | 'document' | 'chat' | 'pdf' | 'general';
  title: string;
  message?: string;
  time: string;
  meta?: any; // blNumber, bookingId, senderName, requestTime, username, etc.
}

interface NotificationState {
  alerts: NotificationAlert[];
  addAlert: (alert: Omit<NotificationAlert, 'id' | 'time'>) => void;
  removeAlert: (id: string) => void;
  clearAll: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  alerts: [],
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
  clearAll: () => set({ alerts: [] })
}));
