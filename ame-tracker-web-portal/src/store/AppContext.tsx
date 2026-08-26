import React, { createContext, useContext, useEffect, useReducer, useState } from 'react';
import {
  PARTS, DISPATCHES, RECENT_EVENTS, DASHBOARD_KPI,
  type Part, type ScanEvent, type Dispatch, type TrackingStatus
} from '../data/mockData';
import { api, getAuthToken } from '../services/api';

interface AppState {
  parts: Part[];
  dispatches: Dispatch[];
  recentEvents: ScanEvent[];
  kpi: typeof DASHBOARD_KPI;
}

type Action =
  | { type: 'SCAN_EVENT'; payload: ScanEvent }
  | { type: 'MANUAL_TRACK'; payload: { trackingRecordId: string; newStatus: TrackingStatus; event: ScanEvent } }
  | { type: 'IMPORT_BATCH'; payload: unknown }
  | { type: 'SET_KPI'; payload: typeof DASHBOARD_KPI }
  | { type: 'RESET' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SCAN_EVENT': {
      const ev = action.payload;
      const newEvents = [ev, ...state.recentEvents].slice(0, 50);
      const newParts = state.parts.map(part => ({
        ...part,
        trackingRecords: part.trackingRecords.map(tr => {
          if (tr.id !== ev.trackingRecordId) return tr;
          return { ...tr, status: ev.newStatus, events: [ev, ...(tr.events || [])] };
        }),
      }));
      const shipped = newParts.flatMap(p => p.trackingRecords).filter(tr => tr.status === 'SHIPPED').length;
      const pending = newParts.flatMap(p => p.trackingRecords).filter(tr => tr.status === 'PENDING').length;
      return {
        ...state,
        parts: newParts,
        recentEvents: newEvents,
        kpi: { ...state.kpi, shippedParts: shipped, pendingParts: pending, todayScans: state.kpi.todayScans + 1 },
      };
    }
    case 'MANUAL_TRACK': {
      const { trackingRecordId, newStatus, event } = action.payload;
      const newEvents = [event, ...state.recentEvents].slice(0, 50);
      const newParts = state.parts.map(part => ({
        ...part,
        trackingRecords: part.trackingRecords.map(tr => {
          if (tr.id !== trackingRecordId) return tr;
          return { ...tr, status: newStatus, events: [event, ...(tr.events || [])] };
        }),
      }));
      return { ...state, parts: newParts, recentEvents: newEvents };
    }
    case 'SET_KPI':
      return { ...state, kpi: action.payload };
    case 'IMPORT_BATCH': return state;
    case 'RESET': return initialState;
    default: return state;
  }
}

const initialState: AppState = {
  parts: PARTS,
  dispatches: DISPATCHES,
  recentEvents: RECENT_EVENTS,
  kpi: DASHBOARD_KPI,
};

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  currentUser: { id: string; name: string; role: string; avatar: string };
  setCurrentUser: (u: { id: string; name: string; role: string; avatar: string }) => void;
  isLiveBackend: boolean;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [currentUser, setCurrentUser] = useState({ id: 'u1', name: 'System Admin', role: 'ADMIN', avatar: 'SA' });
  const [isLiveBackend, setIsLiveBackend] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (token) {
      api.getMe()
        .then((user) => {
          if (user) {
            setCurrentUser({
              id: String(user.id),
              name: user.fullName || 'Admin',
              role: user.role || 'ADMIN',
              avatar: (user.fullName || 'A').slice(0, 2).toUpperCase(),
            });
            setIsLiveBackend(true);
          }
        })
        .catch(() => {
          setIsLiveBackend(false);
        });
    }
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, currentUser, setCurrentUser, isLiveBackend }}>
      {children}
    </AppContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components, react/only-export-components
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
