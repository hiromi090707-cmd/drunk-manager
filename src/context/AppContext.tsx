import { createContext, useContext, useReducer, type ReactNode } from 'react';
import { FIXED_MEMBERS, SPLIT_ROLES } from '../constants';
import type { AppView, Group, Party, PartyState, PartyTab, StatsTab } from '../types';

function makeInitialPartyState(): PartyState {
  const roles: Record<string, number> = {};
  FIXED_MEMBERS.forEach((m) => (roles[m.id] = SPLIT_ROLES[1].id));
  return {
    id: null, areaName: '', storeName: '', startTime: null,
    members: [],
    split: { totalAmount: 0, roles },
    summary: { rawText: '', result: '' },
  };
}

interface AppState {
  view: AppView;
  groupInfo: Group | null;
  historyData: Party[];
  partyState: PartyState;
  activePartyTab: PartyTab;
  activeStatsTab: StatsTab;
  statsDate: Date;
  sharedText: string;
  editingExistingParty: boolean;
}

type AppAction =
  | { type: 'SET_VIEW'; view: AppView }
  | { type: 'SET_GROUP'; group: Group | null }
  | { type: 'SET_HISTORY'; parties: Party[] }
  | { type: 'SET_PARTY_STATE'; party: PartyState }
  | { type: 'SET_PARTY_TAB'; tab: PartyTab }
  | { type: 'SET_STATS_TAB'; tab: StatsTab }
  | { type: 'SET_STATS_DATE'; date: Date }
  | { type: 'SET_SHARED_TEXT'; text: string }
  | { type: 'SET_EDITING_EXISTING'; value: boolean }
  | { type: 'LOGOUT' };

const initialState: AppState = {
  view: 'loading',
  groupInfo: null,
  historyData: [],
  partyState: makeInitialPartyState(),
  activePartyTab: 'members',
  activeStatsTab: 'month',
  statsDate: new Date(),
  sharedText: '',
  editingExistingParty: false,
};

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_VIEW': return { ...state, view: action.view };
    case 'SET_GROUP': return { ...state, groupInfo: action.group };
    case 'SET_HISTORY': return { ...state, historyData: action.parties };
    case 'SET_PARTY_STATE': return { ...state, partyState: action.party };
    case 'SET_PARTY_TAB': return { ...state, activePartyTab: action.tab };
    case 'SET_STATS_TAB': return { ...state, activeStatsTab: action.tab };
    case 'SET_STATS_DATE': return { ...state, statsDate: action.date };
    case 'SET_SHARED_TEXT': return { ...state, sharedText: action.text };
    case 'SET_EDITING_EXISTING': return { ...state, editingExistingParty: action.value };
    case 'LOGOUT':
      return { ...initialState, view: 'login', partyState: makeInitialPartyState() };
    default: return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    sharedText: (() => {
      const p = new URLSearchParams(window.location.search);
      const t = p.get('text') || p.get('title') || p.get('url') || '';
      if (t) window.history.replaceState({}, document.title, window.location.pathname);
      return t;
    })(),
  });
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
