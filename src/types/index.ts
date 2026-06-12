export type DrinkType = 'beer' | 'highball' | 'sour' | 'other';
export type PartyTab = 'members' | 'split' | 'summary';
export type StatsTab = 'day' | 'month' | 'year' | 'all';
export type AppView = 'loading' | 'login' | 'groupSetup' | 'home' | 'party' | 'stats' | 'shareChoice' | 'memberManage';

export interface Member {
  id: string;
  name: string;
  drinks: Record<DrinkType, number>;
  megaDrinks?: Record<DrinkType, number>;
  totalDrinks: number;
}

export interface Party {
  _docId: string;
  id?: string;
  areaName: string;
  storeName: string;
  startTime: string;
  endTime?: string;
  members: Member[];
  totalAmount: number;
  splitRoles: Record<string, number>;
  memberAmounts?: Record<string, number>;
  summaryRaw?: string;
  summaryText?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupMember {
  id: string;
  name: string;
  removed?: boolean;
}

export interface Group {
  id: string;
  name: string;
  memberUids: string[];
  memberEmails: string[];
  members: GroupMember[];
  inviteCode: string;
  createdAt?: unknown;
  createdBy?: string;
}

export interface PartyState {
  id: string | null;
  areaName: string;
  storeName: string;
  startTime: string | null;
  endTime?: string;
  members: Member[];
  split: {
    totalAmount: number;
    roles: Record<string, number>;
  };
  summary: {
    rawText: string;
    result: string;
  };
}

export interface SplitResult {
  memberAmounts: Record<string, number>;
  collectedTotal: number;
  excess: number;
}
