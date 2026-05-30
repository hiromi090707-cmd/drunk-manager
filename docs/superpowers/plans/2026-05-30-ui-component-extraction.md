# UI 部品の抽出リファクタリング Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** StatsView 配下の重複 UI（履歴カード・日付ナビ・数値表示）と yen 表示の重複を、再利用可能な presentational コンポーネントとヘルパーに抽出する。

**Architecture:** `src/components/` に純粋な presentational コンポーネント（`DateNavigator` / `PartyHistoryCard` / `StatMetric`）を追加し、データ取得・状態更新・削除/編集アクションは親（StatsView と各タブ）が担う。スタイルは各コンポーネントへ集約するのみで CSS 化はしない（挙動・見た目は不変、唯一 AllStats のラベルが 0.9rem→0.8rem に軽微統一）。

**Tech Stack:** React 18 + TypeScript + Vite 8。テストは既存の vitest（`db.test.ts`）のみで、新規テストは追加しない。

---

## 環境・検証についての前提

- このリポジトリの `build` は `vite build` のみで、**TypeScript の型エラーを検出しない**。型チェックは別途 `npx tsc --noEmit` を実行する。
- node が PATH にない環境では実行できないため、各タスクの検証コマンドは **node が利用可能な環境**（Claude Code セッション内なら `! npm run build` のように `!` プレフィックスで実行）で行う。
- 本リファクタリングは presentational 抽出のみで挙動を変えないため、最終的な真の検証は **`npm run dev` での目視確認**。

## File Structure

新規ファイル:
- `src/lib/format.ts` — 表示ヘルパー（`formatYen` / `partyName`）。純粋関数のみ。
- `src/components/DateNavigator.tsx` — `◀ ラベル ▶` バー。
- `src/components/StatMetric.tsx` — ラベル + 大きな値 + 任意の補足。
- `src/components/PartyHistoryCard.tsx` — 履歴1件のカード（編集/削除ボタン付き）。

変更ファイル:
- `src/views/StatsView/index.tsx` — 削除アクションを集約し props で配布。
- `src/views/StatsView/DayStats.tsx` — 抽出コンポーネントを使用。
- `src/views/StatsView/MonthStats.tsx` — 同上。
- `src/views/StatsView/YearStats.tsx` — DateNavigator + StatMetric を使用。
- `src/views/StatsView/AllStats.tsx` — StatMetric を使用。
- `src/components/MemberStatsList.tsx` — `formatYen` 使用。
- `src/views/PartyView/SplitTab.tsx` — `formatYen` 使用。

---

### Task 1: 表示ヘルパー `src/lib/format.ts`

**Files:**
- Create: `src/lib/format.ts`

- [ ] **Step 1: ファイルを作成**

```ts
import type { Party } from '../types';

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

// 店名 → エリア名 → デフォルト の順でフォールバック
export function partyName(party: Party): string {
  return party.storeName || party.areaName || '名もなき飲み会';
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし（exit 0）。未使用 export は型エラーにならない。

- [ ] **Step 3: コミット**

```bash
git add src/lib/format.ts
git commit -m "refactor: 表示ヘルパー formatYen/partyName を追加"
```

---

### Task 2: `DateNavigator` コンポーネント

**Files:**
- Create: `src/components/DateNavigator.tsx`

- [ ] **Step 1: ファイルを作成**

```tsx
interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}

export function DateNavigator({ label, onPrev, onNext }: Props) {
  return (
    <div className="flex justify-between items-center mb-4 glass p-2">
      <button onClick={onPrev} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>◀</button>
      <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{label}</span>
      <button onClick={onNext} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>▶</button>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add src/components/DateNavigator.tsx
git commit -m "refactor: DateNavigator コンポーネントを追加"
```

---

### Task 3: `StatMetric` コンポーネント

**Files:**
- Create: `src/components/StatMetric.tsx`

- [ ] **Step 1: ファイルを作成**

```tsx
import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;        // 単位込みで渡す（例: formatYen(x)、<>{n}<span>回</span></>）
  accent?: boolean;        // true で値を accent-color
  caption?: string;        // 任意の補足行
  size?: 'lg' | 'md';      // lg=2rem(既定) / md=1.5rem
}

export function StatMetric({ label, value, accent, caption, size = 'lg' }: Props) {
  return (
    <div className="text-center">
      <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{label}</div>
      <div style={{ fontSize: size === 'lg' ? '2rem' : '1.5rem', fontWeight: 'bold', color: accent ? 'var(--accent-color)' : undefined }}>
        {value}
      </div>
      {caption && <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.9rem' }}>{caption}</div>}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add src/components/StatMetric.tsx
git commit -m "refactor: StatMetric コンポーネントを追加"
```

---

### Task 4: `PartyHistoryCard` コンポーネント

**Files:**
- Create: `src/components/PartyHistoryCard.tsx`

- [ ] **Step 1: ファイルを作成**

```tsx
import type { Party } from '../types';
import { formatYen } from '../lib/format';

interface Props {
  party: Party;
  title: string;
  onEdit: (party: Party) => void;
  onDelete: (party: Party) => void;
}

export function PartyHistoryCard({ party, title, onEdit, onDelete }: Props) {
  return (
    <div className="glass p-3" style={{ fontSize: '0.9rem' }}>
      <div className="flex justify-between items-center mb-1">
        <span style={{ fontWeight: 'bold' }}>{title}</span>
        <span style={{ color: 'var(--accent-color)', fontWeight: 'bold' }}>{formatYen(party.totalAmount || 0)}</span>
      </div>
      {party.summaryText && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
          {party.summaryText}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
        <button onClick={() => onEdit(party)} className="btn btn-sm" style={{ flex: 1, border: '1px dashed var(--border-color)', background: 'transparent' }}>📝 編集</button>
        <button onClick={() => onDelete(party)} className="btn btn-sm" style={{ border: '1px dashed var(--danger-color)', background: 'transparent', color: 'var(--danger-color)' }}>🗑 削除</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add src/components/PartyHistoryCard.tsx
git commit -m "refactor: PartyHistoryCard コンポーネントを追加"
```

---

### Task 5: 削除アクション集約 — StatsView/index.tsx + DayStats.tsx + MonthStats.tsx

> StatsView が DayStats と MonthStats を同一ファイルで描画するため、`onDeleteParty`（必須 prop）の追加と受け取りは3ファイルを一括で変更する（途中で型が壊れないようにするため）。

**Files:**
- Modify: `src/views/StatsView/index.tsx`（全体置換）
- Modify: `src/views/StatsView/DayStats.tsx`（全体置換）
- Modify: `src/views/StatsView/MonthStats.tsx`（全体置換）

- [ ] **Step 1: `src/views/StatsView/index.tsx` を以下で全置換**

```tsx
import { useApp } from '../../context/AppContext';
import { DayStats, buildEditPartyState } from './DayStats';
import { MonthStats } from './MonthStats';
import { YearStats } from './YearStats';
import { AllStats } from './AllStats';
import { deleteParty } from '../../lib/db';
import type { Party } from '../../types';

const STAT_TABS = [
  { id: 'day' as const, label: '日別' },
  { id: 'month' as const, label: '月別' },
  { id: 'year' as const, label: '年別' },
  { id: 'all' as const, label: '全期間' },
];

export function StatsView() {
  const { state, dispatch } = useApp();
  const { historyData, activeStatsTab, statsDate } = state;

  function handleEditParty(party: Party) {
    const partyState = buildEditPartyState(party);
    dispatch({ type: 'SET_EDITING_EXISTING', value: true });
    dispatch({ type: 'SET_PARTY_STATE', party: partyState });
    dispatch({ type: 'SET_PARTY_TAB', tab: 'summary' });
    dispatch({ type: 'SET_VIEW', view: 'party' });
  }

  async function handleDeleteParty(party: Party) {
    if (!confirm('この飲み会の記録を削除しますか？')) return;
    await deleteParty(party._docId);
  }

  return (
    <div className="view">
      <div className="flex justify-between items-center mb-4">
        <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'home' })} className="btn btn-sm">＜ 戻る</button>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>ダッシュボード</h2>
        <div style={{ width: 50 }} />
      </div>

      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '0.2rem', marginBottom: '1rem' }}>
        {STAT_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => dispatch({ type: 'SET_STATS_TAB', tab: tab.id })}
            style={{
              flex: 1, border: 'none', borderRadius: 6, padding: '0.4rem',
              background: activeStatsTab === tab.id ? 'var(--bg-surface)' : 'transparent',
              color: activeStatsTab === tab.id ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeStatsTab === 'day' && <DayStats historyData={historyData} statsDate={statsDate} onEditParty={handleEditParty} onDeleteParty={handleDeleteParty} />}
      {activeStatsTab === 'month' && <MonthStats historyData={historyData} statsDate={statsDate} onEditParty={handleEditParty} onDeleteParty={handleDeleteParty} />}
      {activeStatsTab === 'year' && <YearStats historyData={historyData} statsDate={statsDate} />}
      {activeStatsTab === 'all' && <AllStats historyData={historyData} />}
    </div>
  );
}
```

- [ ] **Step 2: `src/views/StatsView/DayStats.tsx` を以下で全置換**

```tsx
import type { Party, PartyState } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { useApp } from '../../context/AppContext';
import { FIXED_MEMBERS, SPLIT_ROLES } from '../../constants';
import { DateNavigator } from '../../components/DateNavigator';
import { StatMetric } from '../../components/StatMetric';
import { PartyHistoryCard } from '../../components/PartyHistoryCard';
import { formatYen, partyName } from '../../lib/format';

interface Props {
  historyData: Party[];
  statsDate: Date;
  onEditParty: (party: Party) => void;
  onDeleteParty: (party: Party) => void;
}

export function DayStats({ historyData, statsDate, onEditParty, onDeleteParty }: Props) {
  const { dispatch } = useApp();
  const y = statsDate.getFullYear(), m = statsDate.getMonth(), d = statsDate.getDate();
  const dayHistory = historyData.filter((p) => {
    const pd = new Date(p.startTime);
    return pd.getFullYear() === y && pd.getMonth() === m && pd.getDate() === d;
  });
  const totalSpent = dayHistory.reduce((s, p) => s + (p.totalAmount || 0), 0);
  const sorted = [...dayHistory].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  function changeDate(delta: number) {
    const next = new Date(statsDate);
    next.setDate(next.getDate() + delta);
    dispatch({ type: 'SET_STATS_DATE', date: next });
  }

  return (
    <div>
      <DateNavigator label={`${y}年 ${m + 1}月 ${d}日`} onPrev={() => changeDate(-1)} onNext={() => changeDate(1)} />
      <div className="mb-4">
        <StatMetric label="この日の利用額" value={formatYen(totalSpent)} accent caption={`開催回数: ${dayHistory.length}回`} />
      </div>
      <MemberStatsList historyArray={dayHistory} />
      <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>この日の履歴</h3>
      <div className="flex flex-col gap-3 mb-4">
        {dayHistory.length === 0 && <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>記録がありません</p>}
        {sorted.map((p) => {
          const time = new Date(p.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          return (
            <PartyHistoryCard
              key={p._docId}
              party={p}
              title={`${time} ~ ${partyName(p)}`}
              onEdit={onEditParty}
              onDelete={onDeleteParty}
            />
          );
        })}
      </div>
    </div>
  );
}

export function buildEditPartyState(party: Party): PartyState {
  const roles = { ...party.splitRoles };
  if (Object.keys(roles).length === 0) {
    FIXED_MEMBERS.forEach((m) => (roles[m.id] = SPLIT_ROLES[1].id));
  }
  return {
    id: party._docId, areaName: party.areaName || '', storeName: party.storeName || '',
    startTime: party.startTime, endTime: party.endTime,
    members: party.members,
    split: { totalAmount: party.totalAmount || 0, roles },
    summary: { rawText: party.summaryRaw || '', result: party.summaryText || '' },
  };
}
```

- [ ] **Step 3: `src/views/StatsView/MonthStats.tsx` を以下で全置換**

```tsx
import type { Party } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { useApp } from '../../context/AppContext';
import { DateNavigator } from '../../components/DateNavigator';
import { StatMetric } from '../../components/StatMetric';
import { PartyHistoryCard } from '../../components/PartyHistoryCard';
import { formatYen, partyName } from '../../lib/format';

interface Props {
  historyData: Party[];
  statsDate: Date;
  onEditParty: (party: Party) => void;
  onDeleteParty: (party: Party) => void;
}

export function MonthStats({ historyData, statsDate, onEditParty, onDeleteParty }: Props) {
  const { dispatch } = useApp();
  const y = statsDate.getFullYear(), m = statsDate.getMonth();
  const monthHistory = historyData.filter((p) => {
    const d = new Date(p.startTime);
    return d.getFullYear() === y && d.getMonth() === m;
  });
  const totalSpent = monthHistory.reduce((s, p) => s + (p.totalAmount || 0), 0);

  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(y, m, 1).getDay();
  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);
  const partyDays = monthHistory.map((p) => new Date(p.startTime).getDate());
  const sorted = [...monthHistory].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  function changeMonth(delta: number) {
    const next = new Date(statsDate);
    next.setMonth(next.getMonth() + delta);
    dispatch({ type: 'SET_STATS_DATE', date: next });
  }

  return (
    <div>
      <DateNavigator label={`${y}年 ${m + 1}月`} onPrev={() => changeMonth(-1)} onNext={() => changeMonth(1)} />
      <div className="flex justify-between items-center mb-4 px-2">
        <StatMetric label="開催回数" size="md" value={<>{monthHistory.length}<span style={{ fontSize: '1rem', fontWeight: 'normal' }}>回</span></>} />
        <StatMetric label="利用金額" size="md" accent value={formatYen(totalSpent)} />
      </div>
      <MemberStatsList historyArray={monthHistory} />
      <div className="glass p-3 mb-4">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, textAlign: 'center', marginBottom: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {['日','月','火','水','木','金','土'].map((d) => <div key={d}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center' }}>
          {calendarDays.map((day, i) => {
            if (!day) return <div key={i} style={{ padding: '0.5rem' }} />;
            const hasParty = partyDays.includes(day);
            return (
              <div key={day} style={{ padding: '0.4rem 0', borderRadius: 4, background: hasParty ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)', color: hasParty ? '#fff' : 'inherit', fontWeight: hasParty ? 'bold' : 'normal', position: 'relative' }}>
                {day}
                {hasParty && <div style={{ position: 'absolute', bottom: -2, left: '50%', transform: 'translateX(-50%)', fontSize: '0.5rem' }}>🍺</div>}
              </div>
            );
          })}
        </div>
      </div>
      <h3 style={{ color: 'var(--text-secondary)', marginBottom: '0.5rem', fontSize: '0.9rem' }}>{m + 1}月の履歴</h3>
      <div className="flex flex-col gap-3 mb-4">
        {monthHistory.length === 0 && <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>記録がありません</p>}
        {sorted.map((p) => {
          const d = new Date(p.startTime);
          return (
            <PartyHistoryCard
              key={p._docId}
              party={p}
              title={`${d.getDate()}日: ${partyName(p)}`}
              onEdit={onEditParty}
              onDelete={onDeleteParty}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。`deleteParty` が DayStats/MonthStats から import されていないこと、`onDeleteParty` が両者に渡っていることを型が保証する。

- [ ] **Step 5: コミット**

```bash
git add src/views/StatsView/index.tsx src/views/StatsView/DayStats.tsx src/views/StatsView/MonthStats.tsx
git commit -m "refactor: 履歴カード・日付ナビ・数値表示を共通コンポーネント化し削除処理をStatsViewに集約"
```

---

### Task 6: `YearStats.tsx`

**Files:**
- Modify: `src/views/StatsView/YearStats.tsx`（全体置換）

- [ ] **Step 1: ファイルを以下で全置換**

```tsx
import type { Party } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { useApp } from '../../context/AppContext';
import { DateNavigator } from '../../components/DateNavigator';
import { StatMetric } from '../../components/StatMetric';
import { formatYen } from '../../lib/format';

interface Props {
  historyData: Party[];
  statsDate: Date;
}

export function YearStats({ historyData, statsDate }: Props) {
  const { dispatch } = useApp();
  const y = statsDate.getFullYear();
  const yearHistory = historyData.filter((p) => new Date(p.startTime).getFullYear() === y);
  const totalSpent = yearHistory.reduce((s, p) => s + (p.totalAmount || 0), 0);
  const monthTotals = Array(12).fill(0) as number[];
  yearHistory.forEach((p) => { monthTotals[new Date(p.startTime).getMonth()] += p.totalAmount || 0; });
  const maxMonth = Math.max(...monthTotals, 1);

  function changeYear(delta: number) {
    const next = new Date(statsDate);
    next.setFullYear(next.getFullYear() + delta);
    dispatch({ type: 'SET_STATS_DATE', date: next });
  }

  return (
    <div>
      <DateNavigator label={`${y}年`} onPrev={() => changeYear(-1)} onNext={() => changeYear(1)} />
      <div className="mb-4">
        <StatMetric label={`${y}年の総利用額`} value={formatYen(totalSpent)} accent caption={`開催回数: ${yearHistory.length}回`} />
      </div>
      <MemberStatsList historyArray={yearHistory} />
      <div className="glass p-4 mb-4">
        <h3 className="text-center mb-4" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>月別利用額</h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: 150, paddingBottom: 20, borderBottom: '1px solid var(--border-color)' }}>
          {monthTotals.map((amount, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '6%', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
              {amount > 0 && <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginBottom: 2, writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)' }}>{Math.round(amount / 1000)}k</div>}
              <div style={{ width: '100%', height: `${(amount / maxMonth) * 100}%`, background: 'var(--accent-gradient)', borderRadius: '4px 4px 0 0', minHeight: amount > 0 ? 4 : 0 }} />
              <div style={{ position: 'absolute', bottom: -20, left: 0, right: 0, textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add src/views/StatsView/YearStats.tsx
git commit -m "refactor: YearStats を DateNavigator/StatMetric で再構成"
```

---

### Task 7: `AllStats.tsx`

**Files:**
- Modify: `src/views/StatsView/AllStats.tsx`（全体置換）

- [ ] **Step 1: ファイルを以下で全置換**

> 注: 元はラベルが 0.9rem だが StatMetric のラベルは 0.8rem に統一される（意図的な軽微変更）。

```tsx
import type { Party } from '../../types';
import { MemberStatsList } from '../../components/MemberStatsList';
import { StatMetric } from '../../components/StatMetric';
import { formatYen } from '../../lib/format';

interface Props {
  historyData: Party[];
}

export function AllStats({ historyData }: Props) {
  const totalParties = historyData.length;
  const totalSpent = historyData.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

  return (
    <div>
      <div className="glass p-4 mb-4" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <StatMetric label="累計開催回数" value={<>{totalParties} 回</>} />
        <StatMetric label="累計利用額" value={formatYen(totalSpent)} accent />
      </div>
      <MemberStatsList historyArray={historyData} />
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 3: コミット**

```bash
git add src/views/StatsView/AllStats.tsx
git commit -m "refactor: AllStats を StatMetric で再構成"
```

---

### Task 8: yen 表示の統一（MemberStatsList + SplitTab）

**Files:**
- Modify: `src/components/MemberStatsList.tsx`
- Modify: `src/views/PartyView/SplitTab.tsx`

- [ ] **Step 1: `MemberStatsList.tsx` に import を追加**

ファイル先頭の import 群に1行追加:

```tsx
import { formatYen } from '../lib/format';
```

- [ ] **Step 2: `MemberStatsList.tsx` の金額表示を置換**

次の行:

```tsx
            <span className="font-bold" style={{ color: 'var(--accent-color)' }}>¥{m.amount.toLocaleString()}</span>
```

を以下に変更:

```tsx
            <span className="font-bold" style={{ color: 'var(--accent-color)' }}>{formatYen(m.amount)}</span>
```

- [ ] **Step 3: `SplitTab.tsx` に import を追加**

`import { SPLIT_ROLES } from '../../constants';` の下に1行追加:

```tsx
import { formatYen } from '../../lib/format';
```

- [ ] **Step 4: `SplitTab.tsx` の3箇所の金額表示を置換**

(a) お支払い額:

```tsx
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: amount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    ¥{amount.toLocaleString()}
                  </span>
```

を:

```tsx
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: amount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {formatYen(amount)}
                  </span>
```

(b)(c) 集金合計・余り:

```tsx
            <span>集金合計: ¥{result.collectedTotal.toLocaleString()}</span>
            <span>余り: ¥{result.excess.toLocaleString()}</span>
```

を:

```tsx
            <span>集金合計: {formatYen(result.collectedTotal)}</span>
            <span>余り: {formatYen(result.excess)}</span>
```

- [ ] **Step 5: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 6: コミット**

```bash
git add src/components/MemberStatsList.tsx src/views/PartyView/SplitTab.tsx
git commit -m "refactor: 金額表示を formatYen に統一"
```

---

### Task 9: 最終検証

**Files:** なし（検証のみ）

- [ ] **Step 1: 型チェック（全体）**

Run: `npx tsc --noEmit`
Expected: エラーなし（exit 0）。

- [ ] **Step 2: ビルド**

Run: `npm run build`
Expected: 成功（dist 出力、エラーなし）。

- [ ] **Step 3: 既存テスト**

Run: `npm test`
Expected: `db.test.ts` が全 PASS（本変更は db に無関係だが回帰がないことを確認）。

- [ ] **Step 4: 目視確認**

Run: `npm run dev`
確認項目:
- Stats > 日別: 日付ナビ（◀▶）、利用額メトリック、履歴カードの編集/削除が従来どおり動く。
- Stats > 月別: 日付ナビ、開催回数/利用金額の2カラム、カレンダー、履歴カードの編集/削除。
- Stats > 年別: 年ナビ、総利用額メトリック、棒グラフ。
- Stats > 全期間: 累計回数/利用額（ラベルが 0.8rem に統一されている点を許容できるか確認）。
- 割り勘タブ: お支払い額・集金合計・余りの `¥` 表示が従来どおり。
- 削除確認ダイアログ（「この飲み会の記録を削除しますか？」）が出ること。

---

## Self-Review 結果

- **Spec coverage:** format.ts(T1) / DateNavigator(T2) / StatMetric(T3) / PartyHistoryCard(T4) / 削除集約+Day+Month(T5) / Year(T6) / All(T7) / formatYen 適用(T8) / 検証(T9) — spec の全項目に対応タスクあり。
- **Placeholder scan:** TBD/TODO・曖昧指示なし。各コード手順に完全なコードを記載。
- **Type consistency:** `onDeleteParty: (party: Party) => void` は StatsView の配布と DayStats/MonthStats の受け取りで一致。`StatMetric` の props（label/value/accent/caption/size）は全利用箇所で整合。`formatYen`/`partyName` のシグネチャは全タスクで一致。
