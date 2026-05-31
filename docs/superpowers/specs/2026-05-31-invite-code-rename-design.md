# 招待コードのリネーム機能 — 設計

作成日: 2026-05-31

## 背景・目的

カスタム招待コードは「グループ作成時」だけ対応済み（`createGroup` の `customInviteCode`、GroupSetupView の入力欄）。
すでに自動生成コードで運用中の既存グループのコードを、後から好きな名前に変更する手段がない。これを追加する。

`parties` は `groups/{groupId}` 配下のサブコレクションで groupId 紐付けのため、`inviteCode` を変更しても履歴には一切影響しない。

スコープ外（今回はやらない）: エクスポート/インポート、グループのマージ。具体的な困りごとがないため YAGNI で見送り。

## スコープ

既存グループの招待コードを、メンバーが好きな文字列に変更できるようにする。

## 設計

### 1. データ層 `src/lib/db.ts`

新関数 `updateInviteCode(newCode: string): Promise<string>`

- アクティブグループが無ければ throw
- 正規化: `newCode.trim().toUpperCase()`（作成時と同じ不変条件: 全コードは大文字）
- バリデーション: 長さ 2〜16。範囲外は throw
  - 下限 2 は作成時の `code.length < 2` チェックに、上限 16 は入力欄の `maxLength={16}` に合わせる
- ユニークチェック: `query(groups, where('inviteCode','==',code))` で検索
  - ヒットした doc が自グループ以外なら「この招待コードはすでに使われています。別のコードを指定してください。」で throw
  - ヒットが自グループのみ（＝現コードと同じ no-op を含む）なら許可
- `updateDoc(doc(db,'groups',activeGroupId), { inviteCode: code })`
- 正規化後のコードを返す（呼び出し側が state 更新に使う）

非アトミック性（check→write の TOCTOU）は既存 `createGroup` と同じ。友人5人規模のため、トランザクション化はしない（既存挙動に合わせる・YAGNI）。

### 2. UI層 `src/views/HomeView.tsx`

招待コード表示ブロック（現状 read-only）に編集導線を追加。

- コンポーネントローカルの `useState`: 編集モード on/off ＋ 入力値
- 表示時: コード ＋ 小さな「変更」ボタン（既存 `btn-ghost text-muted` を流用）
- 編集時: `input-field`（大文字化・letter-spacing は既存の招待コード入力欄に合わせる）＋「保存」「キャンセル」
- 保存成功: `dispatch({ type:'SET_GROUP', group: {...groupInfo, inviteCode: 返り値} })` → 編集モード解除 → `alert` で確認
- 失敗: `catch(e)` で `alert(e instanceof Error ? e.message : '変更に失敗しました。')`
- 変更権限: 任意のメンバー（退出・記録保存と同じ信頼モデル。Firestore ルールも `isMember` で update を許可済み）。作成者限定にはしない

エラーハンドリングはシステム境界（ユーザー入力 ＋ Firestore）のみに置く。

### 3. テスト `src/lib/db.test.ts`

`updateInviteCode` の emulator テストを追加（既存パターンに合わせる）。

- 正常系: `createGroup` → `updateInviteCode('NEWCODE')` → `withSecurityRulesDisabled` で直接 get し、`inviteCode` が `'NEWCODE'` になっていることを確認
- 重複系: 別グループを用意（`withSecurityRulesDisabled` で別コードのグループを作る）→ アクティブグループから既存他グループのコードへ変更しようとすると reject されることを確認

## 検証

- `npx tsc --noEmit`（型チェック。`vite build` は型を見ないため別途必須）
- `npm run build`
- `npm run test:emulators`
- UI は前回同様、main にマージ → デプロイ後に公開ページで目視確認

## 影響範囲

- 変更: `src/lib/db.ts`（関数追加）、`src/views/HomeView.tsx`（編集UI追加）、`src/lib/db.test.ts`（テスト追加）
- 既存の `createGroup` のカスタムコード処理・ユニークチェックロジックとは独立。`parties` サブコレクション・既存履歴には影響なし
