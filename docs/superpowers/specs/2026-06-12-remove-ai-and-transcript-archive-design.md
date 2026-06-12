# AI要約撤去＋全文アーカイブ・検索 設計

作成日: 2026-06-12

## 背景・目的

もともとの目的は「飲み会の会話の曖昧な記憶を残し、後から思い出せるようにする」こと。現状はその手段として、ブラウザから Anthropic API を直接呼ぶ要約機能があり、APIキーをグループ共有で Firestore に平文保存している。

### 現状の問題（コード調査で判明）

- `claudeApiKey` はグループ doc に平文保存され、グループ doc は `isAllowed()`（許可リストの全ユーザー）が読める。**メンバー外の許可ユーザーでもキーを取り出せる**
- 課金は1人の Anthropic アカウントに紐づくが、利用は全員。料金・責任の所在が曖昧
- 一方、**全文（`summaryRaw`）はすでに Firestore に保存されているのに、読む UI が無い**。要約は最も情報が落ちる形式で、「完全に残す」目的には全文こそ価値がある

### 決定

1. **アプリから AI 呼び出しを撤去する**。要約は各自が端末側で実施（Pixel レコーダー内蔵の要約、または Claude アプリ等に貼って要約）し、テキストとして共有・貼り付けでアップロードする。アプリは「テキストを受け取って保存する箱」に徹する
2. すでに保存されている全文を活かす **全文アーカイブ（閲覧）＋検索** を追加する

## 確定した方針

| 論点 | 決定 |
|------|------|
| AI 呼び出し | アプリから完全撤去（SDK 依存ごと削除） |
| 要約の作り方 | 端末側で各自作成 → 共有インテント or 貼り付けで取り込み（既存フロー流用） |
| APIキーの後始末 | Firestore フィールド削除＋Anthropic コンソールでキーを revoke |
| 検索の置き場所 | ダッシュボード（StatsView）の5番目のタブ「検索」 |
| 全文の表示形式 | 履歴カードの「📜 全文」ボタンから開くモーダル |
| データ移行 | 不要（`summaryRaw`/`summaryText` はそのまま使う） |

### 採用しなかった案

- **Cloudflare Workers プロキシでキーを隠す**: 無料枠で実現可能だが、インフラが1つ増え管理対象が増える。5人規模の用途に対して過剰で、そもそも「アプリ内でAI要約する」必要性が薄い（端末側で済む）
- **spend limit 付きキーで現状維持**: 被害額は抑えられるが「全員がキーを読める」構造自体は残る
- **音声ファイル保存**: Firebase Storage は Blaze プラン必須（2024年10月以降）。テキストで十分

## 1. AI 呼び出しの撤去

- **削除**: `src/lib/claude.ts`、`package.json` の `@anthropic-ai/sdk`
- `src/constants.ts`: `CLAUDE_MODEL` を削除
- `src/views/PartyView/SummaryTab.tsx`:
  - APIキー入力欄・`persistApiKey`・`handleGenerate`・「✨ Claudeで要約を生成」ボタンを削除
  - 残るのは「文字起こしテキスト」「要約結果」の2つの textarea のみ
  - ラベル・プレースホルダを手動フロー向けに更新（例: 要約結果欄は「Pixelレコーダーの要約や、Claudeアプリで作った要約を貼り付け」）
- `src/lib/db.ts`: `saveClaudeApiKey` を削除。あわせてレビューで見つけた dead code（`getClaudeApiKey` → `getGroupInfo` の連鎖）も削除。`createGroup` のシード `claudeApiKey: ''` も削除
- `src/types/index.ts`: `Group.claudeApiKey` / `Group.geminiApiKey` を削除
- **変更しないもの**: 共有インテント → `ShareChoiceView` → パーティ紐付けの取り込みフロー、`PartyState.summary`（`rawText`/`result`）、保存済みの `summaryRaw`/`summaryText`

## 2. Firestore ルール（⚠️ 手動デプロイ必須）

`editsSettings` からキーの編集許可を外す:

```
changedKeys().hasOnly(['inviteCode', 'claudeApiKey'])
→ changedKeys().hasOnly(['inviteCode'])
```

`src/lib/db.test.ts` の更新:

- グループ作成シードの `claudeApiKey: ''` を除去
- 「メンバーは claudeApiKey のみを変更できる」テストを `inviteCode` 版に置き換え
- **メンバーでも `claudeApiKey` を変更できない**（拒否される）ことを確認するテストを追加

**重要**: ルールは `git push` では反映されない（`firestore-rules-deploy.md`）。ユーザーが `! firebase deploy --only firestore:rules` を手動実行する。

## 3. データ・キーの後始末（ユーザー手作業）

1. **Anthropic コンソールで現在のキーを revoke**。全許可ユーザーが読める場所に置かれていた期間がある以上、ローテーションが原則
2. Firebase コンソールで groups doc の `claudeApiKey`（あれば `geminiApiKey`）フィールドを削除。コンソールはセキュリティルールを経由しないため、ルールデプロイとの順序は問わない
3. `firebase deploy --only firestore:rules`

## 4. 全文アーカイブ（モーダル）

- `src/components/PartyHistoryCard.tsx` に「📜 全文」ボタンを追加。**`party.summaryRaw` があるときだけ表示**（データの無いUIは出さない）
- 新コンポーネント `src/components/TranscriptModal.tsx`:
  - `OnboardingOverlay` と同じ `position: fixed; inset: 0` のオーバーレイパターン
  - ヘッダに日付＋店名（`partyName`）、本文に `summaryRaw` を `whiteSpace: pre-wrap` でスクロール表示、閉じるボタン
- モーダルの開閉 state は `PartyHistoryCard` 内の `useState` で完結させ、親（DayStats/MonthStats）には手を入れない

## 5. 検索タブ

- `src/types/index.ts`: `StatsTab` に `'search'` を追加
- `src/views/StatsView/index.tsx`: `STAT_TABS` に `{ id: 'search', label: '検索' }` を追加（5タブ）
- 新コンポーネント `src/views/StatsView/SearchStats.tsx`:
  - キーワード入力欄＋結果リスト。`historyData` は `listenToParties` で全件購読済みのため**バックエンド不要のクライアント内検索**
  - 結果カード: 日付・店名・ヒット箇所の前後スニペット（前後40字程度）。タップで `TranscriptModal` を開く
- 検索ロジックは純関数として `src/lib/search.ts` に切り出す:

```ts
searchParties(parties: Party[], query: string): { party: Party; snippet: string }[]
```

  - 対象フィールド: `summaryRaw` / `summaryText` / 店名 / エリア
  - 大文字小文字を無視した単純 `includes`。結果は新しい順

## 6. テスト

### ユニット（`npm run test:unit`・emulator 不要）

- `searchParties`: ヒット/非ヒット、大文字小文字無視、スニペット切り出し（先頭・末尾の境界）、複数ヒット時に新しい順、空クエリは空配列

### emulator（`npm run test:emulators`）

- ルールが `inviteCode` のみの変更を許可し、`claudeApiKey` の変更を（メンバーでも）拒否する

### ビルド

- `@anthropic-ai/sdk` 除去後に `npm run build` がエラーなしで通ること

## 7. スコープ外（YAGNI）

- AI 呼び出しの再導入（Workers プロキシ等）— 将来必要になったら別途設計
- 音声ファイル・写真の保存（Storage は Blaze 必須）
- 検索のかな/カナ正規化・形態素解析・ヒット箇所のハイライト表示
- 全文の編集 UI（全文の修正は従来どおり編集画面の文字起こし欄で可能）
