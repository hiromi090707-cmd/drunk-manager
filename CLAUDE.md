# drunk-manager

友人グループ（5人固定）向け飲み会管理PWA。ドリンクカウント・割り勘計算・AI要約・履歴管理。

## 技術スタック

| 項目 | 内容 |
|------|------|
| フレームワーク | React 18 + TypeScript + Vite 8 |
| スタイリング | Tailwind CSS v4（`@tailwindcss/vite` プラグイン） |
| バックエンド | Firebase Auth（Google OAuth）+ Firestore |
| AI | Anthropic SDK / `claude-haiku-4-5-20251001` |
| デプロイ | GitHub Pages（`git push origin main` → Actions 自動デプロイ） |

## 主要ファイル

```
src/
├── constants.ts        # FIXED_MEMBERS・DRINK_TYPES・SPLIT_ROLES・CLAUDE_MODEL
├── types/index.ts      # 全TypeScript型定義
├── index.css           # CSS変数 + @layer components（テーマ: 居酒屋アンバー）
├── context/
│   └── AppContext.tsx  # グローバル状態（useReducer）。editingExistingPartyフラグあり
├── lib/
│   ├── db.ts           # Firestoreの全操作（createParty/saveParty/deleteParty/listen系）
│   └── claude.ts       # AI要約（dangerouslyAllowBrowser: true）
└── views/
    ├── HomeView.tsx
    ├── PartyView/      # MembersTab・SplitTab・SummaryTab
    └── StatsView/      # DayStats・MonthStats・YearStats・AllStats
```

## メンバー構成（固定）

```typescript
// src/constants.ts
FIXED_MEMBERS = [hiromi, souga, takumi, takuto, rui]  // 5人固定
```

メンバー追加・動的化は将来対応予定。

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

- テーマ: 居酒屋アンバー（背景: `#120c08`、アクセント: `#e8890a`〜`#d63f1e`）
- タイトルフォント: Dela Gothic One
- 本文フォント: M PLUS Rounded 1c

## ワークフロー

```bash
npm run dev        # ローカル開発サーバー
npm run build      # ビルド確認（push前に必ず実行）
git push origin main  # デプロイ（GitHub Actions が自動でGitHub Pagesに反映）
```

**push前は必ず `npm run build` でエラーなしを確認すること。**

## 今後の予定

- 友人追加・グループ共有機能（現状はFIXED_MEMBERSの5人固定）
