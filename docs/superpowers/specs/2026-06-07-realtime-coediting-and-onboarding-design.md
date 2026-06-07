# 飲み会記録のリアルタイム同時編集 + 初回オンボーディング 設計

- 日付: 2026-06-07
- 対象: `src/types/index.ts` / `src/lib/db.ts` / `src/lib/party.ts` / `src/views/PartyView/*` / `src/views/HomeView.tsx` / `src/components/MemberStatsList.tsx` / 新規 `src/components/OnboardingOverlay.tsx`

## 背景・目的

友人グループ（5人固定）の飲み会記録を、**全メンバーが同時に編集**できるようにする。あわせて、初回ログイン時にアプリの使い方を案内する**オンボーディング**を追加する。

### 機能① 同時編集 — 現状の問題

1. **party の乱立**: 各自が「飲み会スタート」を押すと、それぞれ別の party ドキュメントが作られる。進行中の飲み会に「参加」する導線がない。
2. **更新の消し合い**: ドリンク更新が `updatePartyMemberDrinks`（`members` 配列**全体**を `updateDoc` で上書き）のため、2人が同時に押すと後勝ちで互いの更新を消す（last-write-wins）。
3. **構造的制約**: Firestore は配列フィールドの**要素単位の部分更新ができない**（`members.0.drinks.beer` のような添字パス更新は不可）。配列モデルのままでは同時編集を安全に実現できない。

### 機能② オンボーディング — 現状

初回ユーザー向けの使い方案内が無い。一般的なアプリ同様、初回のみ簡単な説明を出したい。

## 決定事項

| 論点 | 決定 |
|------|------|
| 編集権限 | **全員が全員分を編集可**（グループメンバーなら誰でもどのメンバーのカウントも変更可）。ログインユーザーと各メンバーの紐付けは行わない |
| データ形式 | party の `members` を Firestore 上で **マップ `Record<memberId, Member>`** に統一。部分更新を可能にする |
| 既存履歴の移行 | **不要**。読み取り境界の正規化ヘルパーで配列形式の旧データも吸収する（後方互換） |
| 反映方式 | `onSnapshot` のリアルタイム購読で**画面リロード不要の即時反映**。自分の操作は楽観更新で即座、他メンバーの操作はネットワーク往復後（体感1秒以内） |
| Firestore ルール | **変更不要**（権限モデルが「メンバーなら read/write 可」のままで部分更新・進行中共有をカバー） |

## 機能① 設計

### データモデル（`src/types/index.ts`）

Firestore 保存形式の `members` をマップにする。アプリ内部状態（`PartyState.members`）は**配列のまま維持**し、UI・集計ロジックへの影響を最小化する。

```typescript
// Firestore に保存される Party（永続形式）
export interface Party {
  // ...既存フィールド...
  members: Record<string, Member>;   // 旧: Member[] → マップへ。キーは Member.id
}
```

`PartyState.members: Member[]`（内部表現）は変更しない。Firestore とアプリ内部の境界で配列⇄マップを変換する。

### 正規化ヘルパー（`src/lib/party.ts`）

読み取り境界に1つ置き、**マップ・旧配列・欠損のいずれでも `Member[]` を返す**。これで既存履歴（配列）も新規（マップ）も透過的に扱え、データ移行が不要になる。

```typescript
// Firestore から読んだ raw members（マップ or 旧配列 or undefined）を配列に正規化
export function membersToArray(raw: unknown): Member[] {
  if (Array.isArray(raw)) return raw as Member[];          // 旧形式（履歴）
  if (raw && typeof raw === 'object') return Object.values(raw as Record<string, Member>);
  return [];
}

// 内部の Member[] を Firestore 保存用マップに変換（id をキー）
export function membersToMap(members: Member[]): Record<string, Member> {
  return Object.fromEntries(members.map((m) => [m.id, m]));
}
```

`buildEditPartyState`（履歴編集）と `MemberStatsList`（統計集計）は `membersToArray(party.members)` 経由にする（各1〜数行の差し替え）。

### ドリンクの部分更新（`src/lib/db.ts`）

`updatePartyMemberDrinks`（配列全体上書き）を、**触れたメンバーのフィールドだけ**を送る部分更新に置き換える。

```typescript
// 1メンバーの drinks/megaDrinks/totalDrinks のみ部分更新（他メンバーのフィールドに触れない）
export async function updateMemberDrinks(partyId: string, member: Member): Promise<void> {
  const ref = doc(db, 'groups', activeGroupId!, 'parties', partyId);
  await updateDoc(ref, {
    [`members.${member.id}`]: member,   // 当該メンバーのサブツリーのみ置換
    updatedAt: serverTimestamp(),
  });
}
```

ポイント: `members.${id}` 単位の更新は、Firestore 側で**別メンバーの `members.${otherId}` と自動マージ**される。これにより同時更新が消し合わない。1メンバーオブジェクト全体を置換するため、そのメンバー自身の連打は last-write-wins になるが、**1メンバーを同時に複数人が操作する状況は想定しない**ため許容する（メンバー間の競合だけ解消できればよい）。

`createParty` / `saveParty` も `membersToMap` でマップ形式に保存する。

### 進行中の飲み会の共有（`src/lib/db.ts` / `src/views/HomeView.tsx`）

- **進行中の定義**: `endTime` を持たない party。
- **乱立防止**: 「飲み会スタート」時、`listenToParties` の購読結果から endTime 無しの party を探し、**あればそれに参加（その partyState を開く）、無ければ新規作成**する。
- **参加導線**: ホームに進行中 party があれば「🍺 進行中の飲み会に参加」ボタンを出す。購読は既存の `listenToParties`（App.tsx で起動済み）を流用し、`historyData` から `endTime` 無しを導出する。新規リスナーは追加しない。

### リアルタイム購読のマージ（`src/views/PartyView/index.tsx`）

既存の `listenToParty` 購読を維持しつつ、マージ方針を「**他メンバーのフィールドだけ取り込む**」に厳密化する。

- スナップショットの members（マップ）を `membersToArray` で配列化。
- `partyStateRef.current.members` を基準に、**自分が直前に押したメンバー以外**はサーバー値で更新、というより「サーバー値を正としつつ、ローカルの楽観更新中の差分を保持」する。実装は、各メンバーごとに `JSON.stringify` 比較で変化したものだけ差し替える既存方式を踏襲し、`partyStateRef.current` を基準にすることで自分の入力中フィールドのリセットを防ぐ（CLAUDE.md の stale closure 対策と同じ考え方）。

### タッチイベント

ドリンクボタンは既存の `onTouchStart/onTouchEnd` + `e.preventDefault()`（Android の2重カウント対策）を維持する。

## 機能② 設計

### コンポーネント（新規 `src/components/OnboardingOverlay.tsx`）

- ログイン後ホーム到達時、`localStorage` の既読フラグ（`drunk_onboarding_seen`）が無ければ全画面オーバーレイを表示。
- 使い方を3〜4枚のスライドで案内（例: ①飲み会スタート／進行中に参加 ②タップで＋1・長押しで－1・メガ入力 ③割り勘の傾斜配分 ④AI要約・履歴と集計）。「次へ」で進み、「スキップ」または最終ページの「はじめる」で閉じる。
- 閉じた時点で `localStorage.setItem('drunk_onboarding_seen', '1')`。**2回目以降は表示しない**。
- App のビュー遷移には手を入れず、HomeView（またはルート）に重ねるオーバーレイとして実装。テーマ（居酒屋アンバー）に合わせる。文言・レイアウトは実装側で作成。

### 表示タイミング

HomeView レンダリング時に未読判定。ログイン直後の初回ホーム表示で1度だけ。ログアウト/別端末では `localStorage` がリセットされるため再表示されうるが、初回案内としては許容（YAGNI、サーバー保存はしない）。

## テスト設計

| 対象 | テスト |
|------|--------|
| `membersToArray` | マップ／旧配列／`undefined`／空 を正規化して `Member[]` を返す（単体・vitest） |
| `membersToMap` | `Member[]` → id キーのマップに変換（単体） |
| 部分更新の非破壊性 | emulator で2メンバーを別々に部分更新し、互いの値が保持されることを確認（`@firebase/rules-unit-testing` 既存基盤） |
| 進行中検出 | `endTime` 無しの party が「進行中」として導出される（単体） |
| オンボーディング既読 | フラグ有無で表示/非表示が切り替わる（コンポーネント or ロジック単体） |

## デプロイ手順

```bash
npm run test           # 単体テスト
npm run test:emulators # ルール/部分更新テスト
npm run build          # ビルド確認（CLAUDE.md ワークフロー）
git push origin main   # GitHub Actions → GitHub Pages
```

Firestore ルールは**変更しないため `firebase deploy` 不要**。既存グループの party データも移行不要（後方互換）。

## リスク・注意

- **同一メンバーの同時操作**: 1人のメンバーのカウントを複数人が同時に押すと last-write-wins。友人グループの実利用では稀かつ実害が小さいため許容する。完全な要素単位の整合が必要になれば `drinks.${type}` 単位の `increment()` 部分更新へ将来拡張可能。
- **進行中 party の終了忘れ**: endTime を付けずに放置すると、次回も「参加」になる。これは「同じ飲み会の継続」とみなせるため許容。明示的な「保存（終了）」で endTime が付く。
- **マップキーと Member.id**: マップのキーは `Member.id`（FIXED_MEMBERS の固定文字列）。id にドット等の Firestore フィールドパス禁止文字が無いことを前提とする（現行の id は英小文字のみで安全）。

## 影響ファイル一覧

- `src/types/index.ts` — `Party.members` をマップ型へ
- `src/lib/party.ts` — `membersToArray` / `membersToMap` 追加、`buildEditPartyState` 修正
- `src/lib/db.ts` — `updateMemberDrinks`（部分更新）、`createParty`/`saveParty` のマップ化、進行中 party 検出
- `src/views/PartyView/index.tsx` — 購読マージの厳密化、保存形式
- `src/views/PartyView/MembersTab.tsx` — 部分更新呼び出しへ差し替え
- `src/components/MemberStatsList.tsx` — `membersToArray` 経由に
- `src/views/HomeView.tsx` — 「進行中の飲み会に参加」導線
- `src/components/OnboardingOverlay.tsx`（新規） — 初回オンボーディング
- 各種テストファイル

## 将来の拡張

- ログインユーザー ↔ メンバーの紐付けを導入すれば「各自は自分の分だけ編集」へ移行可能（今回は不要と判断）。
- `drinks.${type}` 単位の `increment()` 更新にすれば同一メンバーの同時操作も非破壊にできる。
