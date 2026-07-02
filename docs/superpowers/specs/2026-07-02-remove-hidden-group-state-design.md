# グループ退出バグ修正＋隠れ状態（activeGroupId）の廃止 設計

作成日: 2026-07-02

## 背景・目的

設計レビュー（2026-07-02、秘書室ノート）で、**グループ退出が実際には退出しないバグ**が見つかった。

- `HomeView.tsx` の `handleLeaveGroup` は `cleanup()` → `leaveGroup()` の順で呼ぶ
- `cleanup()` が先に `activeGroupId = null` にするため、`leaveGroup()` は冒頭の `if (!activeGroupId) return;` で**何もせず正常終了**する
- UI はグループ設定画面に戻るが Firestore の `memberUids` は残ったまま。次回ログインで元のグループに戻される

### 根本原因

バグの本質は呼び出し順ではなく、**関数が必要とする情報（groupId）が引数に現れず、モジュール変数 `activeGroupId` として隠れている**こと。隠れ状態への時間的依存（「先に何かを呼ぶと壊れる」）は型でもテストでも守れない。db 層の `leaveGroup` 自体はエミュレーターテストで検証済みで正しく動く。壊れたのは UI 層の呼び出し順であり、そこにテストが無い。

### 決定

1. `db.ts` の隠れ状態（`activeGroupId`・`historyUnsubscribe`）を**廃止**し、全関数が `groupId` を第一引数で受け取るステートレス設計にする
2. 同じコードに触る隣接バグ3件を同梱して直す:
   - ① `joinGroupByCode` が更新前の Group を返す（参加直後に自分を含まない名簿が state に入る）
   - ② リスナーの permission-denied が `console.error` のみで、グループから外されると UI が静かに更新停止する
   - ③ `findUserGroup` が複数グループ所属時に不定の1件を返す

## 確定した方針

| 論点 | 決定 |
|------|------|
| 真実の在り処 | AppContext の `state.groupInfo` ただ1つ。db.ts はステートレス化 |
| groupId の受け渡し | 全 db 関数の第一引数。呼び出し元は `state.groupInfo.id` を渡す |
| 履歴リスナーの所有権 | App.tsx の `useEffect`（キー: `state.groupInfo?.id`）。グループ変更・null 化で自動解除 |
| 退出の順序 | Firestore 更新（`leaveGroup`）成功 → state 破棄。失敗時は state 無傷でその場に留まる |
| リスナー onError | 「所属失効」と解釈し `SET_GROUP null` → groupSetup 画面へ（alert なし・console.error は残す） |
| 1人1グループ不変条件 | `joinGroupByCode` 冒頭で `findUserGroup` を確認し、別グループ所属なら throw |
| findUserGroup の決定化 | 複数ヒット時は `createdAt` 最古を採用（クライアント側ソート、インデックス追加不要） |
| データ・ルール | Firestore のデータ形状・セキュリティルールは**一切変更しない**。移行不要 |

### 採用しなかった案

- **最小修正（呼び出し順の入れ替えのみ）**: 実質1〜2行で直るが、「静かに no-op する」構造と隠れ状態が残り、同種バグの再発を防げない
- **GroupSession オブジェクト**: リスナーのライフサイクルをセッションに閉じ込める案。利点は useEffect 所有でも同等に得られ、5人規模のアプリにはクラス抽象が過剰。React context にインスタンスを持つのは HMR とも相性が悪い
- **fail-loud（モジュール状態は残して null なら throw）**: 差分最小だが隠れ状態そのものが残る。「根本解消」というスコープ決定と矛盾

## 1. db.ts のステートレス化

**削除するもの**: `activeGroupId`・`historyUnsubscribe`（モジュール変数）、`setActiveGroup`・`getActiveGroup`・`cleanup`・`partiesCollection`（現形）。

**新シグネチャ**（挙動変更があるもののみ備考）:

| 関数 | 新シグネチャ | 備考 |
|------|-------------|------|
| `createGroup` | `(name, members, uid, email, code?)` | 変更なし（状態セットの副作用だけ消える） |
| `joinGroupByCode` | `(code, uid, email)` | 同梱①③: 別グループ所属なら throw。返り値は自分を含めた更新後 Group をローカル合成（再読取なし）。対象グループに参加済みならそのまま返す |
| `findUserGroup` | `(uid)` | 同梱③: 複数ヒット時は `createdAt` 最古（欠損は最古扱い）を採用 |
| `leaveGroup` | `(groupId, uid, email)` | 引数必須化により no-op 不能。これが退出バグの根治 |
| `updateInviteCode` | `(groupId, code)` | |
| `updateGroupMembers` | `(groupId, members)` | |
| `createParty` | `(groupId, data)` | |
| `saveParty` | `(groupId, party)` | |
| `deleteParty` | `(groupId, partyId)` | |
| `listenToParties` | `(groupId, onData, onError)` | 同梱②: onError 追加。「前のリスナーを自動解除する」隠れ挙動も廃止（解除は返り値の Unsubscribe を呼び出し元が管理） |
| `listenToParty` | `(groupId, partyId, onData)` | |
| `updateMemberDrinks` | `(groupId, partyId, member)` | 「null なら黙って return」も消える |
| `migrateLocalData` | `(groupId)` | |

`lib/party.ts` の `createNewParty` は `(groupId, roster, rawText?)` になる。

## 2. リスナーの所有権と App.tsx の再構成

- 履歴リスナーは `onAuthStateChanged` コールバック内ではなく、**`useEffect`（キー: `state.groupInfo?.id`）で購読**する
  - groupInfo が set → 購読開始。変更・null 化（退出/ログアウト/追放）→ React が cleanup で自動解除
  - `onAuthStateChanged` の責務は「認証確認 → `findUserGroup` → `SET_GROUP` → 画面遷移」に縮小
- `onError`（permission-denied 等、SDK が購読を恒久停止した時のみ発火。ネットワーク断では発火しない）:
  - `console.error` → `SET_GROUP null` → `SET_HISTORY []` → view を groupSetup へ
  - 意図的な退出中に発火しても `handleLeaveGroup` 自身の dispatch と着地点が同じ（冪等）なのでレースはどちらが勝っても安全
  - 他メンバーに外された場合も「静かに停止」ではなく groupSetup へ回復する（同梱②）
- PartyView の `listenToParty` は現状どおり PartyView の `useEffect` 所有。groupId 引数だけ追加

## 3. 退出・ログアウトのフロー

**退出（HomeView.handleLeaveGroup）**:

1. confirm（現状どおり）
2. `await leaveGroup(state.groupInfo.id, user.uid, user.email)`
3. 成功: `SET_GROUP null` → `SET_HISTORY []` → groupSetup へ（useEffect が購読解除）
4. 失敗: alert してその場に留まる。state 無傷なので「抜けたつもりで抜けてない」は構造上起きない

**ログアウト（HomeView.handleLogout）**: `logout()` を呼ぶだけ。auth 変化 → `LOGOUT` dispatch → groupInfo null → effect が購読解除。onError が先に発火しても着地点は login/groupSetup でいずれも安全。

## 4. 呼び出し元の改修（機械的）

`state.groupInfo.id`（または直前に取得した `group.id`）を渡すだけの修正:

- `App.tsx`（リスナー移設含む）・`GroupSetupView`・`HomeView`・`PartyView/index`・`MembersTab`・`MemberManageView`・`StatsView` 系（`deleteParty` 使用箇所）・`lib/party.ts`
- `MembersTab` の `updateMemberDrinks` が fire-and-forget の場合は `.catch(console.error)` を付けて unhandled rejection を防ぐ（UX は現状維持）

## 5. テスト

**既存の改修（機械的）**: `db.test.ts` から `setActiveGroup`/`getActiveGroup`/`cleanup()` 依存を除去し、テストが `group.id` を持ち回る形へ。純関数テスト（alcohol/party/roster/onboarding/search）は無影響。

**新規回帰テスト（エミュレーター）**:

- `joinGroupByCode` の返り値に自分の uid/email が含まれる（同梱①）
- 既に別グループ所属での `joinGroupByCode` が throw（同梱③）
- `findUserGroup` が複数グループ所属時に createdAt 最古を返す（同梱③）
- 購読中にルール無効化で memberUids から外す → `onError` が発火する（同梱②）。エミュレーターの権限再評価タイミングが不安定でフレーキーになる場合は、このテストのみ削除して手動検証（2端末で退出→他端末の画面遷移確認）に切り替えてよい

**完了条件**: `npm run test:unit` → `npm run test:emulators` → `npm run build` 全通過。

## 6. 付随変更

- **CLAUDE.md 更新**:
  - 今回の変更で嘘になる記述の書き換え（db.ts の説明、および「同時編集」ハマりポイントのうちリスナー管理に触れる箇所）
  - 新しい約束事を明記: 「db.ts はステートレス。groupId は明示渡し。リスナーは useEffect が所有し、解除は React の cleanup に任せる」
  - 既知ドリフトの修正（React 18→19 表記、AI要約撤去済みの反映、5人固定→動的名簿実装済み、`CLAUDE_MODEL`・`lib/claude.ts` の記述削除）
- **デプロイ**: 通常の main push（GitHub Actions → Pages）。ルール・データ変更なしのため手動デプロイ作業は無し。ロールバックは revert のみ
