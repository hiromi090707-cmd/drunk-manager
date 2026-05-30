# UI 部品の抽出リファクタリング 設計書

- 日付: 2026-05-30
- 対象: `src/views/StatsView/` 配下の重複 UI、および yen 表示の重複
- スコープ: UI 部品の抽出のみ（CSS 化・ドメイン初期化の一元化・FIXED_MEMBERS 集約・テストハーネス追加は対象外）

## 背景と目的

StatsView の各タブ（Day / Month / Year / All）に、ほぼ同一の UI が重複している。

- **履歴カード**（タイトル + 金額 + 要約 + 編集/削除ボタン）が `DayStats` と `MonthStats` で約20行ずつ重複
- **日付ナビ**（`◀ ラベル ▶`）が `DayStats` / `MonthStats` / `YearStats` で重複
- **数値表示**（ラベル + 大きな ¥ 値 + 任意の補足）が4タブで似た形
- `¥${x.toLocaleString()}` の組み立てが10箇所近くに散在

これらを presentational コンポーネントとヘルパーに抽出し、重複を解消する。スタイルは各コンポーネントに集約するだけで CSS 化はしない（インライン style のまま移動）。

## 非目標（明示）

- インライン style の CSS（`@layer components`）化 — 別スコープ
- `Member` / `PartyState` 生成ロジックの factory 化 — 別スコープ
- `FIXED_MEMBERS` 依存の集約 — 別スコープ
- React Testing Library 等の component テストハーネス導入 — YAGNI

## アーキテクチャ

`src/components/` に純粋な presentational コンポーネントを置く（既存の `MemberStatsList.tsx` と同階層）。データ取得・状態更新は親（StatsView / 各タブ）が担い、コンポーネントは props のみで描画する。

### 新規ファイル

#### 1. `src/lib/format.ts` — 表示ヘルパー

```ts
import type { Party } from '../types';

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

// 店名 → エリア名 → デフォルトのフォールバック
export function partyName(party: Party): string {
  return party.storeName || party.areaName || '名もなき飲み会';
}
```

#### 2. `src/components/DateNavigator.tsx`

```ts
interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}
```

`◀ {label} ▶` のガラスバーを描画。日付の加算ロジック（`changeDate` / `changeMonth` / `changeYear`）は粒度が異なるため各親に残し、`onPrev` / `onNext` として渡す。既存の見た目（`flex justify-between items-center mb-4 glass p-2`、ラベル `fontWeight:bold; fontSize:1.1rem`、ボタン `border:none; background:transparent`）をそのまま移植。

利用: DayStats / MonthStats / YearStats。

#### 3. `src/components/PartyHistoryCard.tsx`

```ts
import type { Party } from '../types';

interface Props {
  party: Party;
  title: string;                 // 親が組み立てる（例: "21:30 ~ 店名" / "15日: 店名"）
  onEdit: (party: Party) => void;
  onDelete: (party: Party) => void;
}
```

履歴1件のカード（タイトル + `formatYen(party.totalAmount)` + 要約 + 編集/削除ボタン）を描画。タイトル文字列は区切り（`~` / `:`）が異なるため親で組み立てて渡す。店名フォールバックは `partyName(party)` を使う。金額は `formatYen` を使う。既存の見た目をそのまま移植。

利用: DayStats / MonthStats。

#### 4. `src/components/StatMetric.tsx`

```ts
import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;              // 単位込みで渡す（例: formatYen(x)、<>{n}<span>回</span></>）
  accent?: boolean;              // true で値を accent-color
  caption?: string;              // 任意の補足行（例: "開催回数: 3回"）
  size?: 'lg' | 'md';            // lg=2rem(既定) / md=1.5rem
}
```

中央寄せの「ラベル + 大きな値 + 任意の補足」を描画。値は ReactNode で受け取り、単位（`円`・`回`）のインライン装飾は呼び出し側が制御する。

利用:
- DayStats: `label="この日の利用額" value={formatYen(totalSpent)} accent caption={`開催回数: ${n}回`}`
- YearStats: `label="{y}年の総利用額" value={formatYen(totalSpent)} accent caption={`開催回数: ${n}回`}`（DayStats と同形）
- MonthStats: 2カラム。`size="md"`、回数は default 色、金額は accent
- AllStats: 2段。回数は default 色、利用額は accent

### 変更ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/views/StatsView/index.tsx` | `handleDeleteParty(party)`（`confirm` + `deleteParty`）を追加し、`onEditParty` と並べて DayStats / MonthStats に渡す。`deleteParty` を import。 |
| `src/views/StatsView/DayStats.tsx` | DateNavigator / StatMetric / PartyHistoryCard を使用。インラインのナビ・カード・数値を削除。`deleteParty` import を削除し `onDeleteParty` prop を受け取る。`useApp`（dispatch）は日付変更のため保持。`partyName` / `formatYen` 使用。`buildEditPartyState` の export はこのファイルに残す（移動は別スコープ）。 |
| `src/views/StatsView/MonthStats.tsx` | 同上。カレンダーグリッドは他で重複しないため現状維持。`deleteParty` import 削除、`onDeleteParty` prop 追加。 |
| `src/views/StatsView/YearStats.tsx` | DateNavigator + StatMetric を使用。棒グラフは現状維持。`dispatch`（changeYear）は保持。 |
| `src/views/StatsView/AllStats.tsx` | StatMetric を2つ使用。`formatYen` 使用。 |
| `src/components/MemberStatsList.tsx` | `¥{m.amount.toLocaleString()}` を `formatYen` に置換。 |
| `src/views/PartyView/SplitTab.tsx` | お支払い額・集金合計・余りの3箇所を `formatYen` に置換。 |

DayStats / MonthStats の Props は現状 `{ historyData, statsDate, onEditParty }` に `onDeleteParty: (party: Party) => void` を追加する。

## データフロー

```
StatsView（historyData / 状態 / handleEditParty / handleDeleteParty を保持）
  ├─ DateNavigator      ← label, onPrev, onNext
  ├─ StatMetric         ← label, value, accent, caption, size
  └─ PartyHistoryCard   ← party, title, onEdit=handleEditParty, onDelete=handleDeleteParty
```

タブ（DayStats 等）は historyData の絞り込みと title 文字列の組み立てのみを担い、削除・編集の実処理は StatsView に集約する。これにより子からの `useApp` / `deleteParty` 依存を減らす。

## エラーハンドリング

変更なし。削除時の `confirm` と失敗時挙動は現行どおり StatsView 内に集約して維持する（新たな try/catch は追加しない＝現行と同じ）。

## 検証

1. `npm run build` — TypeScript エラーなしを確認（push 前必須）。
2. `npm run dev` — Stats の Day / Month / Year / All 各タブ、日付ナビ、履歴カードの編集・削除、SplitTab の金額表示、MemberStatsList を目視確認。
3. `npm test` — 既存の `db.test.ts` が引き続き通ることを確認（本変更は db に影響しないが念のため）。

## 既知の視覚的差分（意図的）

- AllStats の数値ラベルが 0.9rem → 0.8rem に統一される（StatMetric のラベルは 0.8rem 固定）。視覚的にはごく軽微。目視確認時に許容できるか確認する。
- これ以外の挙動・見た目の変更はない（純粋な presentational 抽出）。

## リスク

- 低。すべて presentational 抽出と純粋な文字列ヘルパーで、ロジック・データ層は不変。
- 唯一の振る舞い変更は削除/編集ハンドラの配置（DayStats/MonthStats → StatsView）だが、処理内容は同一。
