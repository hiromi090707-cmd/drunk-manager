# メガ杯（別カウント）＋ 純アルコール量の缶ビール換算表示 — 設計

作成日: 2026-05-31

## 背景・目的

居酒屋利用が前提のアプリ。実使用で2点の要望が出た（うち本specは①のみ対象）:

1. **メガ杯**: メガジョッキ等を飲んだとき、通常杯とは別に記録したい（暫定で2杯換算していた）。
2. （別機能・スコープ外）酔った時の集計忘れ対策。

あわせて「飲んだ量を純アルコール量で後から確認できると楽しい」という話があり、ただし「g」は直感的でないため **缶ビール換算（◯本ぶん）** で見せる。

## スコープ

- メガ杯を**普通杯と別カウント**で記録（後で「普通◯杯・メガ◯杯」が分かる）。
- 各ドリンクに容量(ml)・度数(%)を持たせ、純アルコール量を算出。
- 集計画面（ダッシュボード）のメンバー別集計に、メガ杯数と **🍺缶ビール換算** を表示。

### スコープ外
- ②自動集計（別spec）。
- 割り勘ロジック・SplitTab の「計N杯」表示（普通杯のまま変更なし）。
- 飲み会中のライブ純アルコール表示（集計画面のみ）。
- パーティ単位の純アルコール表示（メンバー別×期間のみ）。

## データモデル `src/types/index.ts`

`Member` にメガ専用カウントを追加。任意プロパティで、既存記録は未定義=0扱い（後方互換）。

```ts
export interface Member {
  id: string;
  name: string;
  drinks: Record<DrinkType, number>;       // 普通杯（既存）
  megaDrinks?: Record<DrinkType, number>;  // メガ杯（新規・任意）
  totalDrinks: number;                      // 普通杯の合計（意味そのまま）
}
```

`totalDrinks` は今まで通り**普通杯のみ**。メガ合計は `megaDrinks` の値の和として算出し別表示する。
`Party.members` / `PartyState.members` は `Member[]` なのでそのまま `megaDrinks` を載せて保存できる。**db.ts は `members` 配列ごと保存しているため変更不要**。

## 定数 `src/constants.ts`

各ドリンクに `ml`・`abv` を付与し、メガ倍率と缶ビール換算の基準量を定義する。

```ts
export const DRINK_TYPES: { id: DrinkType; emoji: string; name: string; ml: number; abv: number }[] = [
  { id: 'beer',     emoji: '🍺', name: 'ビール',     ml: 350, abv: 5 },
  { id: 'highball', emoji: '🥃', name: 'ハイボール', ml: 350, abv: 7 },
  { id: 'sour',     emoji: '🍋', name: 'サワー',     ml: 350, abv: 6 },
  { id: 'other',    emoji: '🍷', name: 'その他',     ml: 180, abv: 12 },
];

export const MEGA_VOLUME_FACTOR = 2;   // メガ = 通常容量の2倍
export const BEER_CAN_GRAMS = 14;      // 缶ビール1本(350ml/5%)の純アルコール量。換算基準
```

居酒屋寄せの値。1杯あたり純アルコール量と缶ビール換算:

| ドリンク | ml | 度数 | g/杯 | 🍺換算/杯 | メガ1杯 |
|---------|----|----|------|----------|--------|
| 🍺ビール（中ジョッキ） | 350 | 5% | 14.0g | 1.0本 | 28.0g |
| 🥃ハイボール | 350 | 7% | 19.6g | 1.4本 | 39.2g |
| 🍋サワー | 350 | 6% | 16.8g | 1.2本 | 33.6g |
| 🍷その他 | 180 | 12% | 17.3g | 1.2本 | 34.6g |

数値は概算で `constants.ts` の1箇所のため、後から調整可能。

## 算出ロジック `src/lib/alcohol.ts`（新規・純関数）

React 非依存の純関数。エミュレータ不要で単体テストできる。

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

## 入力UI `src/views/PartyView/MembersTab.tsx`（メガモードのトグル）

- コンポーネントローカルに `const [megaMode, setMegaMode] = useState(false)`。
- ヘッダ（現状の操作説明 `<p>` 付近）に「メガ入力 OFF/ON」トグルを置く。
- `updateDrink` を `target: 'regular' | 'mega'` 対応にリファクタ:
  - `target==='regular'`: 既存通り `drinks[type]` と `totalDrinks` を更新。
  - `target==='mega'`: `megaDrinks[type]` のみ更新（`totalDrinks` は触らない）。
- タップ/長押しハンドラは `megaMode ? 'mega' : 'regular'` を渡す。
- ボタン表示:
  - `megaMode` ON のとき、各ボタンの**枠を赤**（`var(--danger-color)`）にし、**表示数字を `megaDrinks` の count に切り替える**（編集中の値が見える）。OFF時は従来通り `drinks` の count。
  - アクティブ配色は表示中の count>0 で判定。
- メンバー見出し: `計 {totalDrinks} 杯`（既存）に加え、メガ合計>0 のとき `/ メガ {megaTotal} 杯` を併記。例「計5杯 / メガ1」。
- 永続化は既存の `updatePartyMemberDrinks(partyState.id, members)` のまま（members に megaDrinks が含まれる）。

## 集計表示 `src/components/MemberStatsList.tsx`

`MemberStat` に集約値を追加し、各メンバー行に1行追記する。

- `MemberStat` に `megaTotal: number` と `pureAlcohol: number` を追加。
- `getMemberStats` 内の各メンバー集約で:
  ```ts
  stats[m.id].megaTotal += megaTotal(m);
  stats[m.id].pureAlcohol += pureAlcoholGrams(m);
  ```
- 表示: 既存の内訳行（🍺🥃🍋🍷 + 計N杯）の下に1行追加:
  - `(megaTotal>0 ? `メガ ${megaTotal}杯 ・ ` : '') + `🍺換算 約${beerCans(pureAlcohol).toFixed(1)}本``
  - 例: `メガ 1杯 ・ 🍺換算 約7.8本`、メガ無しなら `🍺換算 約3.0本`。
  - 純アルコールg そのものは表示しない。
- 表示ガード: 現状 `every((m) => m.amount === 0 && m.totalDrinks === 0)` を `&& m.pureAlcohol === 0` も加味（メガのみの記録を隠さないため）。

## 補助 `src/lib/party.ts`

- `createInitialMembers(roster)`: 各メンバーに `megaDrinks: emptyDrinks()` を初期化。
- `buildEditPartyState(party)`: 復元時に各メンバーへ `megaDrinks: m.megaDrinks ?? emptyDrinks()` を補完（旧記録の編集時にメガボタンが0始まりで動くように）。

## 後方互換

- 旧 `Party` 記録は `megaDrinks` 未定義 → すべて0として扱う（`pureAlcoholGrams`/`megaTotal` は `?? 0`/`|| 0` でガード済み）。マイグレーション不要。
- 旧記録も `pureAlcoholGrams` で純アルコール量を遡って算出・表示できる（普通杯のみから）。

## 検証

- `src/lib/alcohol.test.ts`（純関数・新規）:
  - `pureAlcoholGrams`: 普通＋メガ混在のメンバーで期待g（例: ビール普通3＋メガ1＋ハイボール普通2 → 109.2g）。
  - `pureAlcoholGrams`: `megaDrinks` 未定義のメンバーで普通杯のみから算出・例外なし。
  - `megaTotal`: メガ合計。
  - `beerCans`: g→本数。
  - 実行: `npx vitest run src/lib/alcohol.test.ts`（高速・エミュ不要）。最終は `npm run test:emulators` で全緑。
- `npx tsc --noEmit` ＋ `npm run build`。
- UI（MembersTab / MemberStatsList）は RTL ハーネス無しのため目視（マージ→公開ページ）。

## 影響範囲（変更ファイル）

- `src/types/index.ts`（`megaDrinks` 追加）
- `src/constants.ts`（`ml/abv`・`MEGA_VOLUME_FACTOR`・`BEER_CAN_GRAMS`）
- `src/lib/alcohol.ts`（新規）＋ `src/lib/alcohol.test.ts`（新規）
- `src/lib/party.ts`（`megaDrinks` 初期化・補完）
- `src/views/PartyView/MembersTab.tsx`（メガモード）
- `src/components/MemberStatsList.tsx`（メガ・缶ビール換算表示）

db.ts・SplitTab・割り勘ロジックは変更なし。
