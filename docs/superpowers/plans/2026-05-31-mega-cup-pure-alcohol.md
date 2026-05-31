# メガ杯＋純アルコール量（缶ビール換算） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メガ杯を普通杯と別カウントで記録し、各ドリンクの容量/度数から純アルコール量を算出して集計画面に「メガ杯数」と「🍺缶ビール換算」を表示する。

**Architecture:** `Member` に任意の `megaDrinks` を追加（後方互換）。`constants.ts` の `DRINK_TYPES` に容量/度数を持たせ、純関数 `lib/alcohol.ts` で純アルコール量・メガ合計・缶ビール換算を算出。`MembersTab` にメガモードのトグル、`MemberStatsList` に集約表示を足す。db.ts は members 配列ごと保存しているため変更不要。

**Tech Stack:** React 18 + TypeScript、Vitest（Firebase Emulator 上で実行）

---

## File Structure

- Modify: `src/types/index.ts` — `Member.megaDrinks?` 追加
- Modify: `src/constants.ts` — `DRINK_TYPES` に `ml/abv`、`MEGA_VOLUME_FACTOR`・`BEER_CAN_GRAMS` 追加
- Create: `src/lib/alcohol.ts` — `pureAlcoholGrams` / `megaTotal` / `beerCans`（純関数）
- Create: `src/lib/alcohol.test.ts` — 上記のテスト
- Modify: `src/lib/party.ts` — `megaDrinks` の初期化・補完
- Modify: `src/views/PartyView/MembersTab.tsx` — メガモードのトグル入力
- Modify: `src/components/MemberStatsList.tsx` — メガ杯数・缶ビール換算の表示

## テスト実行についての注意

`src/test/setup.ts` の共通 `beforeAll` がエミュレータ未起動だと失敗する。純関数テストでも必ず `npm run test:emulators`（エミュレータ起動込み）で実行する。単独 `vitest run <file>` は使わない。

---

## Task 1: 定数・型・純関数 lib/alcohol.ts（TDD）

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/constants.ts`
- Create: `src/lib/alcohol.ts`
- Test: `src/lib/alcohol.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/alcohol.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest';
import { pureAlcoholGrams, megaTotal, beerCans } from './alcohol';
import type { Member } from '../types';

function member(over: Partial<Member>): Member {
  return {
    id: 'x', name: 'X',
    drinks: { beer: 0, highball: 0, sour: 0, other: 0 },
    totalDrinks: 0,
    ...over,
  };
}

describe('alcohol', () => {
  it('pureAlcoholGrams: 普通＋メガ混在を合算する', () => {
    const m = member({
      drinks: { beer: 3, highball: 2, sour: 0, other: 0 },
      megaDrinks: { beer: 1, highball: 0, sour: 0, other: 0 },
    });
    // ビール普通3×14 + ビールメガ1×28 + ハイボール普通2×19.6 = 42 + 28 + 39.2 = 109.2
    expect(pureAlcoholGrams(m)).toBeCloseTo(109.2, 1);
  });

  it('pureAlcoholGrams: megaDrinks 未定義でも普通杯から算出する', () => {
    const m = member({ drinks: { beer: 2, highball: 0, sour: 0, other: 0 } });
    expect(pureAlcoholGrams(m)).toBeCloseTo(28.0, 1); // 2×14
  });

  it('megaTotal: 全ドリンク種のメガ杯を合計する', () => {
    const m = member({ megaDrinks: { beer: 1, highball: 2, sour: 0, other: 0 } });
    expect(megaTotal(m)).toBe(3);
  });

  it('megaTotal: megaDrinks 未定義は0', () => {
    expect(megaTotal(member({}))).toBe(0);
  });

  it('beerCans: 純アルコールgを缶ビール本数に換算する', () => {
    expect(beerCans(109.2)).toBeCloseTo(7.8, 1);
    expect(beerCans(14)).toBe(1);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:emulators`
Expected: `alcohol.test.ts` が `./alcohol` を解決できず FAIL（5件）。既存の db テストは PASS。

- [ ] **Step 3: 型に megaDrinks を追加**

`src/types/index.ts` の `Member` を変更。現在:

```ts
export interface Member {
  id: string;
  name: string;
  drinks: Record<DrinkType, number>;
  totalDrinks: number;
}
```

を次に置き換える:

```ts
export interface Member {
  id: string;
  name: string;
  drinks: Record<DrinkType, number>;
  megaDrinks?: Record<DrinkType, number>;
  totalDrinks: number;
}
```

- [ ] **Step 4: 定数に容量/度数・倍率・換算基準を追加**

`src/constants.ts` の `DRINK_TYPES` を変更。現在:

```ts
export const DRINK_TYPES: { id: DrinkType; emoji: string; name: string }[] = [
  { id: 'beer', emoji: '🍺', name: 'ビール' },
  { id: 'highball', emoji: '🥃', name: 'ハイボール' },
  { id: 'sour', emoji: '🍋', name: 'サワー' },
  { id: 'other', emoji: '🍷', name: 'その他' },
];
```

を次に置き換える:

```ts
export const DRINK_TYPES: { id: DrinkType; emoji: string; name: string; ml: number; abv: number }[] = [
  { id: 'beer', emoji: '🍺', name: 'ビール', ml: 350, abv: 5 },
  { id: 'highball', emoji: '🥃', name: 'ハイボール', ml: 350, abv: 7 },
  { id: 'sour', emoji: '🍋', name: 'サワー', ml: 350, abv: 6 },
  { id: 'other', emoji: '🍷', name: 'その他', ml: 180, abv: 12 },
];

export const MEGA_VOLUME_FACTOR = 2; // メガ = 通常容量の2倍
export const BEER_CAN_GRAMS = 14;    // 缶ビール1本(350ml/5%)の純アルコール量。換算基準
```

（`SPLIT_ROLES` と `CLAUDE_MODEL` の定義はそのまま残す。）

- [ ] **Step 5: 純関数を実装**

`src/lib/alcohol.ts` を新規作成:

```ts
import { DRINK_TYPES, MEGA_VOLUME_FACTOR, BEER_CAN_GRAMS } from '../constants';
import type { Member } from '../types';

const ETHANOL_DENSITY = 0.8;

// 純アルコール量(g) = Σ (普通杯 + メガ杯×倍率) × ml × abv/100 × 0.8
export function pureAlcoholGrams(member: Member): number {
  return DRINK_TYPES.reduce((sum, d) => {
    const regular = member.drinks?.[d.id] || 0;
    const mega = member.megaDrinks?.[d.id] || 0;
    const perCup = (d.ml * d.abv / 100) * ETHANOL_DENSITY;
    return sum + regular * perCup + mega * perCup * MEGA_VOLUME_FACTOR;
  }, 0);
}

// メガ杯の合計（全ドリンク種）
export function megaTotal(member: Member): number {
  return DRINK_TYPES.reduce((sum, d) => sum + (member.megaDrinks?.[d.id] || 0), 0);
}

// 缶ビール換算本数
export function beerCans(grams: number): number {
  return grams / BEER_CAN_GRAMS;
}
```

- [ ] **Step 6: テストを実行して成功を確認**

Run: `npm run test:emulators`
Expected: 全テスト PASS（alcohol 5件 + 既存 db テスト）。

- [ ] **Step 7: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラーなし。

- [ ] **Step 8: コミット**

```bash
git add src/types/index.ts src/constants.ts src/lib/alcohol.ts src/lib/alcohol.test.ts
git commit -m "feat: ドリンクに容量/度数を追加し純アルコール量・缶ビール換算のalcohol.tsを追加"
```

---

## Task 2: party.ts の megaDrinks 初期化・補完

**Files:**
- Modify: `src/lib/party.ts`

プラミングのため自動テストは無し。tsc + build で担保。

- [ ] **Step 1: createInitialMembers で megaDrinks を初期化**

`src/lib/party.ts` の `createInitialMembers` を変更。現在:

```ts
export function createInitialMembers(roster: Roster): Member[] {
  return roster.map((m) => ({ id: m.id, name: m.name, drinks: emptyDrinks(), totalDrinks: 0 }));
}
```

を次に置き換える:

```ts
export function createInitialMembers(roster: Roster): Member[] {
  return roster.map((m) => ({ id: m.id, name: m.name, drinks: emptyDrinks(), megaDrinks: emptyDrinks(), totalDrinks: 0 }));
}
```

- [ ] **Step 2: buildEditPartyState で旧記録の megaDrinks を補完**

同じく `src/lib/party.ts` の `buildEditPartyState` 内、現在:

```ts
    members: party.members,
```

を次に置き換える（旧記録に `megaDrinks` が無い場合に空で補完し、編集時にメガボタンが0始まりで動くようにする）:

```ts
    members: party.members.map((m) => ({ ...m, megaDrinks: m.megaDrinks ?? emptyDrinks() })),
```

- [ ] **Step 3: 型チェックとビルド**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc エラーなし、build 成功（既存の chunk-size 警告のみ）。

- [ ] **Step 4: コミット**

```bash
git add src/lib/party.ts
git commit -m "feat: party.tsでmegaDrinksを初期化し旧記録を補完"
```

---

## Task 3: MembersTab メガモードのトグル入力

**Files:**
- Modify: `src/views/PartyView/MembersTab.tsx`

UIのため自動テストは無し。tsc + build + 目視で担保。

- [ ] **Step 1: import を追加**

`src/views/PartyView/MembersTab.tsx` の1行目を変更。現在:
```ts
import { useRef } from 'react';
```
を:
```ts
import { useRef, useState } from 'react';
```

`import { DRINK_TYPES } from '../../constants';` の下に2行追加:
```ts
import { emptyDrinks } from '../../lib/party';
import { megaTotal } from '../../lib/alcohol';
```

- [ ] **Step 2: megaMode state と updateDrink の target 対応**

`export function MembersTab(...) {` 直後の `const pressTimerRef = ...` の下に追加:
```ts
  const [megaMode, setMegaMode] = useState(false);
```

`updateDrink` を次に置き換える（現在は `target` 引数なし）:
```ts
  function updateDrink(mId: string, type: string, delta: 1 | -1, target: 'regular' | 'mega') {
    const members = partyState.members.map((m): Member => {
      if (m.id !== mId) return m;
      if (target === 'mega') {
        const current = m.megaDrinks ?? emptyDrinks();
        const count = Math.max(0, (current[type as keyof Member['drinks']] || 0) + delta);
        return { ...m, megaDrinks: { ...current, [type]: count } };
      }
      const count = Math.max(0, (m.drinks[type as keyof Member['drinks']] || 0) + delta);
      const prev = m.drinks[type as keyof Member['drinks']] || 0;
      const diff = count - prev;
      return { ...m, drinks: { ...m.drinks, [type]: count }, totalDrinks: m.totalDrinks + diff };
    });
    const updated = { ...partyState, members };
    onUpdate(updated);
    if (partyState.id) updatePartyMemberDrinks(partyState.id, members).catch(console.error);
  }
```

- [ ] **Step 3: 長押し/タップハンドラで megaMode を渡す**

`handlePressStart` 内の `updateDrink(mId, type, -1);` を:
```ts
      updateDrink(mId, type, -1, megaMode ? 'mega' : 'regular');
```
`handlePressEnd` 内の `updateDrink(mId, type, 1);` を:
```ts
      updateDrink(mId, type, 1, megaMode ? 'mega' : 'regular');
```

- [ ] **Step 4: ヘッダにメガ入力トグルを追加**

現在の操作説明:
```tsx
      <p className="text-center mb-4 text-muted" style={{ fontSize: '0.8rem' }}>
        各ドリンクをタップで＋１ / 長押しで－１
      </p>
```
を次に置き換える:
```tsx
      <div className="flex justify-between items-center mb-4">
        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
          タップ＋１ / 長押し－１
        </p>
        <button
          onClick={() => setMegaMode((v) => !v)}
          className="btn btn-sm"
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: megaMode ? '#fff' : 'var(--text-secondary)',
            background: megaMode ? 'var(--danger-color)' : 'transparent',
            border: `1px solid ${megaMode ? 'var(--danger-color)' : 'var(--border-color)'}`,
          }}
        >
          メガ入力 {megaMode ? 'ON' : 'OFF'}
        </button>
      </div>
```

- [ ] **Step 5: メンバー見出しにメガ合計を併記**

現在:
```tsx
              <span className="text-accent" style={{ fontWeight: 700 }}>計 {member.totalDrinks} 杯</span>
```
を次に置き換える:
```tsx
              <span className="text-accent" style={{ fontWeight: 700 }}>
                計 {member.totalDrinks} 杯{megaTotal(member) > 0 ? ` / メガ ${megaTotal(member)}` : ''}
              </span>
```

- [ ] **Step 6: ドリンクボタンの表示をメガモード対応に**

現在:
```tsx
              {DRINK_TYPES.map((drink) => {
                const count = member.drinks[drink.id] || 0;
                return (
                  <button
                    key={drink.id}
                    className="btn"
                    style={{
                      padding: '0.5rem',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      background: count > 0 ? 'var(--bg-surface)' : 'transparent',
                      borderColor: count > 0 ? 'var(--accent-color)' : 'var(--border-color)',
                    }}
```
を次に置き換える（表示数字をモードで切替、メガモード時は枠を赤に）:
```tsx
              {DRINK_TYPES.map((drink) => {
                const count = megaMode ? (member.megaDrinks?.[drink.id] || 0) : (member.drinks[drink.id] || 0);
                return (
                  <button
                    key={drink.id}
                    className="btn"
                    style={{
                      padding: '0.5rem',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      background: count > 0 ? 'var(--bg-surface)' : 'transparent',
                      borderColor: megaMode ? 'var(--danger-color)' : (count > 0 ? 'var(--accent-color)' : 'var(--border-color)'),
                    }}
```

（`onMouseDown` 以下のハンドラ・絵文字/名前/count の表示部分は変更しない。`count` の参照先が上記で切り替わる。）

- [ ] **Step 7: 型チェックとビルド**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc エラーなし、build 成功。

- [ ] **Step 8: コミット**

```bash
git add src/views/PartyView/MembersTab.tsx
git commit -m "feat: MembersTabにメガ入力モードのトグルを追加"
```

---

## Task 4: MemberStatsList メガ杯数・缶ビール換算の表示

**Files:**
- Modify: `src/components/MemberStatsList.tsx`

UIのため自動テストは無し。純アルコール算出ロジックは Task 1 でテスト済み。tsc + build + 目視で担保。

- [ ] **Step 1: import を追加**

`src/components/MemberStatsList.tsx` の `import { emptyDrinks, rosterOf } from '../lib/party';` の下に追加:
```ts
import { megaTotal, pureAlcoholGrams, beerCans } from '../lib/alcohol';
```

- [ ] **Step 2: MemberStat に集約フィールドを追加**

現在の interface:
```ts
interface MemberStat {
  name: string;
  totalDrinks: number;
  drinks: { beer: number; highball: number; sour: number; other: number };
  amount: number;
}
```
を次に置き換える:
```ts
interface MemberStat {
  name: string;
  totalDrinks: number;
  drinks: { beer: number; highball: number; sour: number; other: number };
  amount: number;
  megaCups: number;
  pureAlcohol: number;
}
```

- [ ] **Step 3: 初期化と集約に追加**

現在の初期化:
```ts
    stats[m.id] = { name: m.name, totalDrinks: 0, drinks: emptyDrinks(), amount: 0 };
```
を:
```ts
    stats[m.id] = { name: m.name, totalDrinks: 0, drinks: emptyDrinks(), amount: 0, megaCups: 0, pureAlcohol: 0 };
```

`p.members?.forEach((m) => { ... })` 内、`if (m.drinks) { ... }` ブロックの直後（同じ forEach 内、`if (!stats[m.id]) return;` のスコープ）に2行追加:
```ts
        stats[m.id].megaCups += megaTotal(m);
        stats[m.id].pureAlcohol += pureAlcoholGrams(m);
```

- [ ] **Step 4: 表示ガードに pureAlcohol を加味**

現在:
```ts
  if (statsArray.every((m) => m.amount === 0 && m.totalDrinks === 0)) return null;
```
を次に置き換える（メガのみ等の記録を隠さないため）:
```ts
  if (statsArray.every((m) => m.amount === 0 && m.totalDrinks === 0 && m.pureAlcohol === 0)) return null;
```

- [ ] **Step 5: 換算行を表示に追加**

現在のメンバー行（内訳行）:
```tsx
            <div className="flex justify-between text-sm text-muted" style={{ background: 'rgba(0,0,0,0.2)', padding: '0.3rem 0.5rem', borderRadius: 4 }}>
              <div className="flex gap-2">
                <span>🍺{m.drinks.beer}</span>
                <span>🥃{m.drinks.highball}</span>
                <span>🍋{m.drinks.sour}</span>
                <span>🍷{m.drinks.other}</span>
              </div>
              <span className="font-bold">計 {m.totalDrinks} 杯</span>
            </div>
```
の直後（同じ `<div key={m.name}>` の中、上記 `</div>` の下）に追加:
```tsx
            <div className="text-sm text-muted" style={{ marginTop: '0.3rem', textAlign: 'right' }}>
              {m.megaCups > 0 && <span>メガ {m.megaCups}杯 ・ </span>}
              🍺換算 約{beerCans(m.pureAlcohol).toFixed(1)}本
            </div>
```

- [ ] **Step 6: 型チェックとビルド**

Run: `npx tsc --noEmit && npm run build`
Expected: tsc エラーなし、build 成功。

- [ ] **Step 7: コミット**

```bash
git add src/components/MemberStatsList.tsx
git commit -m "feat: メンバー別集計にメガ杯数と缶ビール換算を表示"
```

---

## 完了後

- 全テスト（emulator）緑・`tsc --noEmit` クリーン・`npm run build` 成功を確認
- finishing-a-development-branch で main へマージ → デプロイ後に公開ページで目視:
  - 飲み会中: メガ入力トグルON → 枠が赤・数字がメガ count・タップでメガ+1、見出しに「計N杯 / メガM」
  - 集計（各期間タブ）: メンバー行に「メガ N杯 ・ 🍺換算 約X本」が出る
