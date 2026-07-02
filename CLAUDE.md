# drunk-manager

友人グループ向け飲み会管理PWA。ドリンクカウント・割り勘計算・履歴管理。

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | React 19 + TypeScript + Vite 8 |
| スタイリング | Tailwind CSS v4（`@tailwindcss/vite` プラグイン） |
| バックエンド | Firebase Auth（Google OAuth）+ Firestore |
| デプロイ | GitHub Pages（`git push origin main` → Actions 自動デプロイ） |

## 主要ファイル

```
src/
├── constants.ts        # FIXED_MEMBERS・DRINK_TYPES・SPLIT_ROLES
├── types/index.ts      # 全TypeScript型定義
├── index.css           # CSS変数 + @layer components（テーマ: 居酒屋アンバー）
├── context/
│   └── AppContext.tsx  # グローバル状態（useReducer）。editingExistingPartyフラグあり
├── lib/
│   └── db.ts           # Firestoreの全操作（**ステートレス。groupId は全関数の第一引数**）
└── views/
    ├── HomeView.tsx
    ├── PartyView/      # MembersTab・SplitTab・SummaryTab
    └── StatsView/      # DayStats・MonthStats・YearStats・AllStats
```

## メンバー構成

初期メンバーは `FIXED_MEMBERS`（グループ未設定時のフォールバック）。**名簿はグループごとに動的管理**（`roster.ts`・`MemberManageView`。追加・改名・ソフト削除に対応）

## 重要な既知事項（ハマりポイント）

### CSS
- Tailwind v4 では `@utility` 構文はブラウザで解釈されない
- カスタムクラスは必ず `@layer components { .class { ... } }` で定義する

### タッチイベント（Android）
- ドリンクボタンは `onTouchStart/onTouchEnd` に `e.preventDefault()` 必須
- ないと Android Chrome がタッチ後にマウスイベントも発火させ2重カウントになる

### 編集モードの判定
- `isEditing` は `historyData.some(...)` ではなく `editingExistingParty` フラグで判定
- 新規パーティ作成直後にFirestoreリスナーがhistoryDataを更新するため、historyData方式は誤動作する

### stale closure（PartyView）
- `listenToParty` のコールバック内では `partyStateRef.current` を使う
- `partyState` を直接使うとエリア・店名入力がリセットされる

### 同時編集（リアルタイム）
- party の `members` は Firestore 上ではマップ `Record<id, Member>` で保存（部分更新のため）。`Party` 型は `Member[]` 配列のまま。変換は `db.ts` の境界（保存=`membersToMap`／読取=`membersToArray`）に閉じ込める
- ドリンク更新は `updateMemberDrinks` で `members.<id>` だけを部分更新（他メンバーと衝突しない）。`members` 配列全体を上書きする書き込みパスを足さないこと（マップ形状が壊れ部分更新が崩れる）
- 購読マージは `mergeMembers` で「他メンバーの変化分だけ」取り込む（自分の入力中カウントを巻き戻さない）
- 「飲み会スタート」は endTime 無しの進行中 party があれば合流（`findActiveParty`）。cold-load 直後は `historyData` 未取得で重複作成されうる小さな窓がある（許容済み）
- 純粋関数テストは `npm run test:unit`（emulator 不要）、Firestore 込みは `npm run test:emulators`
- **db.ts はステートレス**。`activeGroupId` のような隠れ状態は持たない。groupId は全関数の第一引数で、呼び出し元は `state.groupInfo.id` を渡す
- **履歴リスナーの所有者は App.tsx の useEffect（キー: groupId）だけ**。ビューで `listenToParties` を呼ばない。`SET_GROUP` を dispatch すれば購読は自動で開始・切替・解除される
- リスナーの onError は「所属失効」として扱い groupSetup へ回復する。退出は「Firestore 更新成功 → state 破棄」の順（逆にすると退出失敗時に取り残される）

## 環境変数

```
# .env.local（gitignore済み・ローカル専用）
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

本番はGitHub Secretsで管理。`.env.local` にAPIキーを書いてもgit管理されない。

## デザイン

- テーマ: **DARK ARCADE 居酒屋**（提灯カウンター × 昭和レトロ × ゲーム風キャッチー）。背景 `#0c0805`、アクセント `#f0961a`〜`#d63f1e`、提灯の灯り `#ffb43d`/`#ffcf5e`、立体縁取り `--outline #6e2a06`・厚み影 `--depth #9c2a10`
- フォント: タイトル `Dela Gothic One`（`--font-display`）/ 本文 `M PLUS Rounded 1c`（`--font-family`）/ ポップ見出し `RocknRoll One`（`--font-pop`）/ 装飾 `Reggae One`（`--font-retro`）。**明朝は使わない**
- **タイトルロゴは英字 "Drunk" 固定**（和文ロゴ化しない）。`BrandLogo` コンポーネント（`logo-3d` 立体ロゴ＋任意で `lantern` 提灯＋`logo-sub` リボン）に集約。Login/Home/GroupSetup で使用
- 共通クラス（`src/index.css` の `@layer components`）: `glass`（立体パネル）/ `btn`・`btn-primary`（金の立体）/ `btn-3d`・`btn-3d-dark`（ヒーローCTA）/ `input-field` / `bottom-nav` / `sticker`（進行中）/ `sync-badge`（リアルタイム同期）/ `sec-divider`（点線見出し）/ `seat`（メンバー席）/ `lantern`。**カスタムクラスは必ず `@layer components`**（Tailwind v4）
- **データの無いUIは出さない**: ログインユーザー↔メンバーの紐付けが未実装のため「自分の席」ハイライトはしない。プレゼンス未実装のため「N人が編集中」の件数は出さず、購読中の事実のみ `sync-badge` で「リアルタイム同期」と表示する
- デザイン参照モック: `design-preview/arcade.html`（ビルド対象外の静的モック）

## ワークフロー

```bash
npm run dev        # ローカル開発サーバー
npm run build      # ビルド確認（push前に必ず実行）
git push origin main  # デプロイ（GitHub Actions が自動でGitHub Pagesに反映）
```

**push前は必ず `npm run build` でエラーなしを確認すること。**
