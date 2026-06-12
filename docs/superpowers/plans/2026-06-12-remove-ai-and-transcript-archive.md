# AI要約撤去＋全文アーカイブ・検索 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アプリから Anthropic API 呼び出しとAPIキー保存を完全撤去し、代わりに保存済み全文（`summaryRaw`）の閲覧モーダルとクライアント内検索タブを追加する。

**Architecture:** 要約は端末側（Pixelレコーダー / Claudeアプリ）で各自作成し、既存の共有インテント・貼り付けフローでテキストとして取り込む。アプリは「テキストを受け取って保存する箱」に徹する。検索は `listenToParties` で購読済みの `historyData` に対する純関数 `searchParties`（`src/lib/search.ts`）で行い、バックエンド不要。

**Tech Stack:** React 19 + TypeScript + Vite 8、Firebase Firestore（rules は手動デプロイ）、vitest（unit は emulator 不要、rules テストは `npm run test:emulators`）

**設計書:** `docs/superpowers/specs/2026-06-12-remove-ai-and-transcript-archive-design.md`

**Subagent モデル方針（ユーザー指示）:** 各タスクは機械的な編集＋テストなので実装 subagent は **sonnet** で十分。レビューは opus 以上。

**注意（Tailwind v4）:** カスタムCSSクラスを足す場合は必ず `@layer components`。本計画では既存クラス（`glass`/`btn`/`input-field` 等）と inline style のみ使い、新規クラスは作らない。

---

### Task 1: AI呼び出しのUI撤去（SummaryTab・claude.ts・SDK・文言）

**Files:**
- Modify: `src/views/PartyView/SummaryTab.tsx`（全置換）
- Modify: `src/components/OnboardingOverlay.tsx:7`（AI文言の修正）
- Delete: `src/lib/claude.ts`
- Modify: `src/constants.ts:28`（`CLAUDE_MODEL` 削除）
- Modify: `package.json`（`@anthropic-ai/sdk` 削除）

- [ ] **Step 1: SummaryTab.tsx を全置換**

APIキー入力欄・`persistApiKey`・`handleGenerate`・生成ボタン・`useApp`/`useState`/`useEffect` 依存をすべて除去し、2つの textarea だけにする。ファイル全体を以下に置き換える:

```tsx
import type { PartyState } from '../../types';

interface Props {
  partyState: PartyState;
  onUpdate: (updated: PartyState) => void;
}

export function SummaryTab({ partyState, onUpdate }: Props) {
  return (
    <div className="glass p-4 mb-4">
      <h2 className="text-center mb-4" style={{ fontSize: '1.1rem' }}>会話の記録</h2>

      <div className="mb-5">
        <label className="text-muted" style={{ fontSize: '0.8rem' }}>文字起こしテキスト（全文）</label>
        <textarea
          className="input-field w-full mt-1"
          style={{ height: 130, resize: 'vertical', fontSize: '0.8rem' }}
          placeholder="Pixelレコーダーなどからの共有テキストがここに入ります"
          value={partyState.summary.rawText}
          onChange={(e) => onUpdate({ ...partyState, summary: { ...partyState.summary, rawText: e.target.value } })}
        />
      </div>

      <div className="mb-3">
        <label className="text-muted" style={{ fontSize: '0.8rem' }}>要約</label>
        <textarea
          className="input-field w-full mt-1"
          style={{ minHeight: 220, background: 'rgba(0,0,0,0.3)', fontSize: '0.9rem' }}
          placeholder="Pixelレコーダーの要約や、Claudeアプリで作った要約を貼り付け"
          value={partyState.summary.result}
          onChange={(e) => onUpdate({ ...partyState, summary: { ...partyState.summary, result: e.target.value } })}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: オンボーディングの「AIによる要約」文言を修正**

`src/components/OnboardingOverlay.tsx` の4枚目スライド（7行目）を変更:

```tsx
// 変更前
  { emoji: '💰', title: '割り勘と要約', body: '傾斜配分の割り勘、AIによる飲み会の要約、過去の集計もまとめて確認できます。' },
// 変更後
  { emoji: '💰', title: '割り勘と記録', body: '傾斜配分の割り勘、会話の文字起こしと要約の保存、過去の集計もまとめて確認できます。' },
```

- [ ] **Step 3: claude.ts を削除し、CLAUDE_MODEL を削除**

```bash
rm src/lib/claude.ts
```

`src/constants.ts` から末尾の1行を削除:

```ts
export const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
```

- [ ] **Step 4: Anthropic SDK をアンインストール**

```bash
npm uninstall @anthropic-ai/sdk
```

Expected: `package.json` の `dependencies` から `@anthropic-ai/sdk` が消える。

- [ ] **Step 5: ビルドとユニットテストで確認**

```bash
npm run build && npm run test:unit
```

Expected: ビルドはエラーなし（chunk size warning は既知で無視可）、テストは 32 件すべて PASS。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: アプリ内AI要約を撤去し手動貼り付け方式に変更"
```

---

### Task 2: db.ts / types からAPIキー関連を削除

**Files:**
- Modify: `src/lib/db.ts:43`（createGroup シード）、`src/lib/db.ts:96-101`（getGroupInfo）、`src/lib/db.ts:112-115`（saveClaudeApiKey）、`src/lib/db.ts:124-129`（getClaudeApiKey）
- Modify: `src/types/index.ts:44-45`

- [ ] **Step 1: db.ts から4箇所を削除**

`createGroup` の `groupData` から `claudeApiKey: '',` の行（43行目）を削除:

```ts
  const groupData = {
    name: groupName,
    memberUids: [creatorUid],
    memberEmails: [creatorEmail],
    members,
    inviteCode,
    createdAt: serverTimestamp(),
    createdBy: creatorUid,
  };
```

以下の3関数を丸ごと削除（`getClaudeApiKey` → `getGroupInfo` は dead code 連鎖、`saveClaudeApiKey` は Task 1 で唯一の呼び出し元が消えた）:

```ts
export async function getGroupInfo(): Promise<Group | null> {
  if (!activeGroupId) return null;
  const docSnap = await getDoc(doc(db, 'groups', activeGroupId));
  if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() } as Group;
  return null;
}
```

```ts
export async function saveClaudeApiKey(apiKey: string): Promise<void> {
  if (!activeGroupId) return;
  await updateDoc(doc(db, 'groups', activeGroupId), { claudeApiKey: apiKey });
}
```

```ts
export async function getClaudeApiKey(): Promise<string> {
  if (!activeGroupId) return '';
  const info = await getGroupInfo();
  // 旧Geminiキーからの移行サポート
  return info?.claudeApiKey || info?.geminiApiKey || '';
}
```

**注意:** `getDoc` は `listenToParty` ではなく `migrateLocalData`（198行目）でも使っているので、import から消さないこと。

- [ ] **Step 2: types/index.ts の Group からキーを削除**

```ts
export interface Group {
  id: string;
  name: string;
  memberUids: string[];
  memberEmails: string[];
  members: GroupMember[];
  inviteCode: string;
  createdAt?: unknown;
  createdBy?: string;
}
```

（`claudeApiKey?: string;` と `geminiApiKey?: string;` の2行を削除）

- [ ] **Step 3: ビルドとユニットテストで確認**

```bash
npm run build && npm run test:unit
```

Expected: エラーなし・32件 PASS。`tsc` が `claudeApiKey` 残参照を検出したらその箇所も削除（Task 1 完了済みなら残っていないはず）。

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts src/types/index.ts
git commit -m "refactor: APIキー保存関連のdb関数とGroup型フィールドを削除"
```

---

### Task 3: Firestore ルール最小化＋emulator テスト（TDD）

**Files:**
- Modify: `src/lib/db.test.ts:630-649`（テスト置換）、ほか seed 6箇所
- Modify: `firestore.rules:46-50`

**前提:** emulator テストは `npm run test:emulators`（firebase emulators を内部起動、unit テストも一緒に走る）。

- [ ] **Step 1: db.test.ts のテストを先に書き換える（RED にするため）**

`it('メンバーは claudeApiKey のみを変更できる', ...)` （630-638行）と `it('非メンバーは設定（claudeApiKey）を変更できない', ...)`（640-649行）の2件を、以下の3件に置き換える:

```ts
  it('メンバーでも claudeApiKey は変更できない（AI撤去後）', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'APIK01');

    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertFails(
      aCtx.firestore().collection('groups').doc(group.id).update({ claudeApiKey: 'sk-test' }),
    );
  });

  it('メンバーは inviteCode のみの変更ができる', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'APIK02');

    const aCtx = testEnv.authenticatedContext(USER_A.uid, { email: USER_A.email });
    await assertSucceeds(
      aCtx.firestore().collection('groups').doc(group.id).update({ inviteCode: 'APIK03' }),
    );
  });

  it('非メンバーは設定（inviteCode）を変更できない', async () => {
    await signInAs(USER_A);
    const group = await createGroup('G', TEST_MEMBERS, USER_A.uid, USER_A.email, 'APIK04');

    // USER_B は当グループの非メンバー
    const bCtx = testEnv.authenticatedContext(USER_B.uid, { email: USER_B.email });
    await assertFails(
      bCtx.firestore().collection('groups').doc(group.id).update({ inviteCode: 'EVIL01' }),
    );
  });
```

- [ ] **Step 2: db.test.ts の seed から `claudeApiKey: ''` を除去**

`withSecurityRulesDisabled` 内の seed オブジェクト6箇所（478・538・578・594・611・675行付近）から `claudeApiKey: '',` の行を削除する。ルールを経由しない seed だが、撤去後のデータ形状に揃える。

- [ ] **Step 3: emulator テストを実行して新テストの FAIL を確認**

```bash
npm run test:emulators
```

Expected: `メンバーでも claudeApiKey は変更できない（AI撤去後）` が **FAIL**（現行ルールはまだ claudeApiKey 変更を許可しているため）。他は PASS。

- [ ] **Step 4: firestore.rules の editsSettings を絞る**

```
// 変更前
    // 設定変更: 既存メンバーが招待コード / Claude APIキー のみ変更
    function editsSettings(groupId) {
      return isMember(groupId)
        && changedKeys().hasOnly(['inviteCode', 'claudeApiKey']);
    }
// 変更後
    // 設定変更: 既存メンバーが招待コードのみ変更
    function editsSettings(groupId) {
      return isMember(groupId)
        && changedKeys().hasOnly(['inviteCode']);
    }
```

- [ ] **Step 5: emulator テストを再実行して全 PASS を確認**

```bash
npm run test:emulators
```

Expected: 全件 PASS。

- [ ] **Step 6: Commit**

```bash
git add firestore.rules src/lib/db.test.ts
git commit -m "fix: Firestoreルールの設定変更許可をinviteCodeのみに最小化"
```

**注意（デプロイはまだしない）:** ルールは `git push` では反映されない。最終 Task 7 のチェックリストでユーザーが `! firebase deploy --only firestore:rules` を実行する。

---

### Task 4: 検索純関数 `searchParties`（TDD）

**Files:**
- Create: `src/lib/search.ts`
- Test: `src/lib/search.test.ts`
- Modify: `package.json:11`（`test:unit` に検索テストを追加）

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/search.test.ts` を新規作成:

```ts
import { describe, it, expect } from 'vitest';
import { searchParties } from './search';
import type { Party } from '../types';

function makeParty(over: Partial<Party>): Party {
  return {
    _docId: 'p1',
    areaName: '',
    storeName: '',
    startTime: '2026-06-01T19:00:00.000Z',
    members: [],
    totalAmount: 0,
    splitRoles: {},
    ...over,
  };
}

describe('searchParties', () => {
  it('空クエリ・空白のみのクエリは空配列を返す', () => {
    const parties = [makeParty({ summaryRaw: 'カラオケの話' })];
    expect(searchParties(parties, '')).toEqual([]);
    expect(searchParties(parties, '   ')).toEqual([]);
  });

  it('summaryRaw / summaryText / 店名 / エリアのいずれにもヒットする', () => {
    const parties = [
      makeParty({ _docId: 'a', summaryRaw: '旅行の計画で盛り上がった' }),
      makeParty({ _docId: 'b', summaryText: '・二次会はカラオケ' }),
      makeParty({ _docId: 'c', storeName: '鳥貴族' }),
      makeParty({ _docId: 'd', areaName: '渋谷' }),
    ];
    expect(searchParties(parties, '旅行').map((h) => h.party._docId)).toEqual(['a']);
    expect(searchParties(parties, 'カラオケ').map((h) => h.party._docId)).toEqual(['b']);
    expect(searchParties(parties, '鳥貴族').map((h) => h.party._docId)).toEqual(['c']);
    expect(searchParties(parties, '渋谷').map((h) => h.party._docId)).toEqual(['d']);
  });

  it('ヒットしなければ空配列を返す', () => {
    expect(searchParties([makeParty({ summaryRaw: 'もつ鍋の話' })], '存在しない語')).toEqual([]);
  });

  it('大文字小文字を無視してヒットする', () => {
    const parties = [makeParty({ summaryRaw: 'BBQ をやる話になった' })];
    expect(searchParties(parties, 'bbq')).toHaveLength(1);
  });

  it('結果は startTime の新しい順に並ぶ', () => {
    const parties = [
      makeParty({ _docId: 'old', summaryRaw: '旅行', startTime: '2026-01-01T19:00:00.000Z' }),
      makeParty({ _docId: 'new', summaryRaw: '旅行', startTime: '2026-06-01T19:00:00.000Z' }),
    ];
    expect(searchParties(parties, '旅行').map((h) => h.party._docId)).toEqual(['new', 'old']);
  });

  it('長文ではヒット位置の前後を切り出し、両端に省略記号を付ける', () => {
    const long = 'あ'.repeat(100) + '旅行' + 'い'.repeat(100);
    const [hit] = searchParties([makeParty({ summaryRaw: long })], '旅行');
    expect(hit.snippet).toContain('旅行');
    expect(hit.snippet.startsWith('…')).toBe(true);
    expect(hit.snippet.endsWith('…')).toBe(true);
    expect(hit.snippet.length).toBeLessThan(100);
  });

  it('短いテキストは省略記号なしでそのまま返す', () => {
    const [hit] = searchParties([makeParty({ summaryRaw: '旅行の話' })], '旅行');
    expect(hit.snippet).toBe('旅行の話');
  });

  it('1パーティにつきヒットは1件（summaryRaw 優先）', () => {
    const p = makeParty({ summaryRaw: '旅行A', summaryText: '旅行B' });
    const hits = searchParties([p], '旅行');
    expect(hits).toHaveLength(1);
    expect(hits[0].snippet).toBe('旅行A');
  });
});
```

- [ ] **Step 2: test:unit スクリプトに追加**

`package.json` の `test:unit` を変更（**ファイル列挙方式なので追加を忘れると永久に走らない**）:

```json
"test:unit": "SKIP_EMULATOR_CHECK=1 vitest run src/lib/alcohol.test.ts src/lib/party.test.ts src/lib/roster.test.ts src/lib/onboarding.test.ts src/lib/search.test.ts",
```

- [ ] **Step 3: テストを実行して FAIL を確認**

```bash
npm run test:unit
```

Expected: `search.test.ts` が「Cannot find module './search'」等で **FAIL**。既存32件は PASS のまま。

- [ ] **Step 4: 最小実装を書く**

`src/lib/search.ts` を新規作成:

```ts
import type { Party } from '../types';

export interface SearchHit {
  party: Party;
  snippet: string;
}

const SNIPPET_RADIUS = 40;

// 検索対象フィールド（summaryRaw 優先の順）
function fieldsOf(party: Party): string[] {
  return [party.summaryRaw, party.summaryText, party.storeName, party.areaName]
    .filter((s): s is string => !!s);
}

function makeSnippet(text: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + queryLength + SNIPPET_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

// historyData（購読済み・全件メモリ上）に対するクライアント内検索。
// 大文字小文字を無視した単純 includes。結果は startTime の新しい順。
export function searchParties(parties: Party[], query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const hits: SearchHit[] = [];
  for (const party of parties) {
    for (const text of fieldsOf(party)) {
      const index = text.toLowerCase().indexOf(q);
      if (index >= 0) {
        hits.push({ party, snippet: makeSnippet(text, index, q.length) });
        break;
      }
    }
  }
  return hits.sort(
    (a, b) => new Date(b.party.startTime).getTime() - new Date(a.party.startTime).getTime(),
  );
}
```

- [ ] **Step 5: テストを実行して PASS を確認**

```bash
npm run test:unit
```

Expected: 既存32件＋新規8件 = 40件すべて PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/search.ts src/lib/search.test.ts package.json
git commit -m "feat: 飲み会記録のクライアント内検索関数searchPartiesを追加"
```

---

### Task 5: TranscriptModal＋履歴カード「📜 全文」ボタン

**Files:**
- Create: `src/components/TranscriptModal.tsx`
- Modify: `src/components/PartyHistoryCard.tsx`（全置換）

UI コンポーネントのため自動テストなし（プロジェクト方針: テストは純関数と rules のみ）。ビルドで型検証する。

- [ ] **Step 1: TranscriptModal を新規作成**

`OnboardingOverlay` と同じ fixed-inset オーバーレイパターン。背景タップで閉じる。本文は `summaryRaw` を優先し、無ければ `summaryText` にフォールバック（検索ヒットが要約のみのパーティでも空にならないように）:

```tsx
import type { Party } from '../types';
import { partyName } from '../lib/format';

interface Props {
  party: Party;
  onClose: () => void;
}

export function TranscriptModal({ party, onClose }: Props) {
  const date = new Date(party.startTime).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'short', day: 'numeric',
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(12, 8, 5, 0.93)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      }}
    >
      <div
        className="glass p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 420, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="flex justify-between items-center mb-3">
          <div>
            <div style={{ fontWeight: 'bold' }}>{partyName(party)}</div>
            <div className="text-muted" style={{ fontSize: '0.8rem' }}>{date}</div>
          </div>
          <button onClick={onClose} className="btn btn-sm">閉じる</button>
        </div>
        <div
          className="text-muted"
          style={{ overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: 1.7 }}
        >
          {party.summaryRaw || party.summaryText || '記録テキストはありません'}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: PartyHistoryCard に「📜 全文」ボタンを追加**

ファイル全体を以下に置き換える。ボタンは **`summaryRaw` があるときだけ**表示（データの無いUIは出さない）。モーダル開閉 state はカード内 `useState` で完結させ、親（DayStats/MonthStats）には手を入れない:

```tsx
import { useState } from 'react';
import type { Party } from '../types';
import { formatYen } from '../lib/format';
import { TranscriptModal } from './TranscriptModal';

interface Props {
  party: Party;
  title: string;
  onEdit: (party: Party) => void;
  onDelete: (party: Party) => void;
}

export function PartyHistoryCard({ party, title, onEdit, onDelete }: Props) {
  const [showTranscript, setShowTranscript] = useState(false);

  return (
    <div className="glass p-3" style={{ fontSize: '0.9rem' }}>
      <div className="flex justify-between items-center mb-1">
        <span style={{ fontWeight: 'bold' }}>{title}</span>
        <span className="text-accent" style={{ fontWeight: 'bold' }}>{formatYen(party.totalAmount || 0)}</span>
      </div>
      {party.summaryText && (
        <div className="text-muted" style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px dashed var(--border-color)', fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>
          {party.summaryText}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.8rem' }}>
        <button onClick={() => onEdit(party)} className="btn btn-sm btn-dashed" style={{ flex: 1 }}>📝 編集</button>
        {party.summaryRaw && (
          <button onClick={() => setShowTranscript(true)} className="btn btn-sm btn-dashed">📜 全文</button>
        )}
        <button onClick={() => onDelete(party)} className="btn btn-sm btn-dashed-danger">🗑 削除</button>
      </div>
      {showTranscript && <TranscriptModal party={party} onClose={() => setShowTranscript(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: ビルドで確認**

```bash
npm run build
```

Expected: エラーなし。

- [ ] **Step 4: Commit**

```bash
git add src/components/TranscriptModal.tsx src/components/PartyHistoryCard.tsx
git commit -m "feat: 履歴カードに文字起こし全文モーダルを追加"
```

---

### Task 6: ダッシュボードに「検索」タブを追加

**Files:**
- Modify: `src/types/index.ts:3`（`StatsTab` に `'search'`）
- Create: `src/views/StatsView/SearchStats.tsx`
- Modify: `src/views/StatsView/index.tsx`

- [ ] **Step 1: StatsTab 型に 'search' を追加**

`src/types/index.ts` 3行目:

```ts
export type StatsTab = 'day' | 'month' | 'year' | 'all' | 'search';
```

- [ ] **Step 2: SearchStats コンポーネントを新規作成**

`src/views/StatsView/SearchStats.tsx`:

```tsx
import { useState } from 'react';
import type { Party } from '../../types';
import { searchParties } from '../../lib/search';
import { partyName } from '../../lib/format';
import { TranscriptModal } from '../../components/TranscriptModal';

export function SearchStats({ historyData }: { historyData: Party[] }) {
  const [query, setQuery] = useState('');
  const [openParty, setOpenParty] = useState<Party | null>(null);
  const hits = searchParties(historyData, query);

  return (
    <div>
      <input
        className="input-field w-full mb-3"
        placeholder="キーワードで思い出を検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() !== '' && hits.length === 0 && (
        <p className="text-center text-muted" style={{ fontSize: '0.85rem' }}>見つかりませんでした</p>
      )}
      <div className="flex flex-col gap-2">
        {hits.map(({ party, snippet }) => {
          const date = new Date(party.startTime).toLocaleDateString('ja-JP', {
            year: 'numeric', month: 'short', day: 'numeric',
          });
          return (
            <button
              key={party._docId}
              onClick={() => setOpenParty(party)}
              className="glass p-3 text-left"
              style={{ cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{date} {partyName(party)}</div>
              <div className="text-muted" style={{ fontSize: '0.8rem', marginTop: '0.3rem' }}>{snippet}</div>
            </button>
          );
        })}
      </div>
      {openParty && <TranscriptModal party={openParty} onClose={() => setOpenParty(null)} />}
    </div>
  );
}
```

- [ ] **Step 3: StatsView に5番目のタブを追加**

`src/views/StatsView/index.tsx` に3箇所追加。

import に追加:

```tsx
import { SearchStats } from './SearchStats';
```

`STAT_TABS` に追加:

```tsx
const STAT_TABS = [
  { id: 'day' as const, label: '日別' },
  { id: 'month' as const, label: '月別' },
  { id: 'year' as const, label: '年別' },
  { id: 'all' as const, label: '全期間' },
  { id: 'search' as const, label: '検索' },
];
```

レンダリング部の末尾（`{activeStatsTab === 'all' && ...}` の次の行）に追加:

```tsx
      {activeStatsTab === 'search' && <SearchStats historyData={historyData} />}
```

- [ ] **Step 4: ビルドとユニットテストで確認**

```bash
npm run build && npm run test:unit
```

Expected: エラーなし・40件 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/views/StatsView/SearchStats.tsx src/views/StatsView/index.tsx
git commit -m "feat: ダッシュボードに飲み会記録の検索タブを追加"
```

---

### Task 7: 最終検証＋後始末チェックリスト

**Files:** なし（検証のみ）

- [ ] **Step 1: 全テストスイートを実行**

```bash
npm run build && npm run test:emulators
```

Expected: ビルドエラーなし、unit＋emulator テスト全件 PASS。

- [ ] **Step 2: 残骸チェック**

```bash
grep -rn "claudeApiKey\|geminiApiKey\|anthropic\|Anthropic\|CLAUDE_MODEL\|summarizePartyConversation" src/ package.json firestore.rules
```

Expected: ヒット 0 件（`package-lock.json` は対象外でよい）。

- [ ] **Step 3: push（デプロイ）**

```bash
git push origin main
```

GitHub Actions が GitHub Pages へ自動デプロイ。

- [ ] **Step 4: ユーザー手作業の案内（実装者は実行せず、完了報告に含めること）**

以下の3点はユーザー本人の手作業。完了報告にチェックリストとして明記する:

1. **Anthropic コンソールでAPIキーを revoke**（https://console.anthropic.com/ → API Keys）。全許可ユーザーが読める場所にあったためローテーション必須
2. **Firebase コンソールで groups doc の `claudeApiKey`（あれば `geminiApiKey`）フィールドを削除**。コンソールはルールを経由しないので順序は問わない
3. **`! firebase deploy --only firestore:rules`** を実行（ルールは git push では反映されない）
