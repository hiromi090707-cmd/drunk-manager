# Drunk「DARK ARCADE 居酒屋」全画面リデザイン Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** drunk-manager の全画面を、承認済みモック `design-preview/arcade.html`（DARK ARCADE 居酒屋＝提灯カウンター×昭和レトロ×ゲーム風キャッチー）の世界観に統一する。

**Architecture:** ほぼ全ビューが共通クラス（`.glass`/`.btn`/`.btn-primary`/`.input-field`/`.bottom-nav`）とCSS変数を使い回しているため、**`src/index.css` の design token とこれら共通クラスを作り替えることで全画面を一気に新デザインへ寄せる**。その上で、ヒーロー/ブランド・主CTA・メンバー席など要所だけ新クラス（`.btn-3d` / `.sticker` / `.seat` / `BrandLogo`）を当てる。ロジック・props・Firestore呼び出し・タッチハンドラは一切変更しない。

**Tech Stack:** React 18 + TypeScript + Vite 8 / Tailwind CSS v4（カスタムクラスは必ず `@layer components`）/ Google Fonts（Dela Gothic One・M PLUS Rounded 1c・RocknRoll One・Reggae One）。

**整合性の原則（重要）:**
- **データの無いものをUIに出さない。** ログインユーザー↔メンバーの紐付けは未実装なので「あなたの席」ハイライトは作らない。プレゼンス（誰が編集中か）も未実装なので「N人が編集中」のような件数は出さず、購読中である事実だけを「●リアルタイム同期」と表現する。
- 「進行中の飲み会」表示は `findActiveParty(state.historyData)` の実データに基づくため採用してよい。
- タイトルロゴは英字 "Drunk" 固定（和文ロゴ化禁止）。

**検証方針（TDDの代替）:** 純粋な見た目変更のため単体テストは新設しない。各タスクの検証は次の3点：
1. `npm run build` がエラー無しで通る
2. `npm run test:unit` が引き続き全パス（ロジック無改変の保証）
3. ヘッドレスChromeでの目視確認（未認証で出せる LoginView と、必要に応じ静的化した断片）。なお Google OAuth のため認証後画面の自動スクショは非現実的 → 認証後画面は「Task 1 で確立した共通クラス＋モック `arcade.html` とのコードパリティ」で担保し、最終的な実機目視はユーザーがデプロイ後に行う。

検証用ヘッドレスコマンド（プレビュー）:
```bash
cd /home/hiromi/drunk && npm run build && npm run preview >/tmp/preview.log 2>&1 &
sleep 2
google-chrome-stable --headless --disable-gpu --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=420,860 \
  --screenshot=/tmp/login.png "http://localhost:4173/"   # 未認証=LoginView
```

---

## File Structure

| ファイル | 役割 | 変更種別 |
|---|---|---|
| `index.html` | フォント読込・theme-color | Modify（fonts追加・theme-color更新） |
| `src/index.css` | **design token＋共通クラス（中核）** | Modify（実質書き換え） |
| `src/components/BrandLogo.tsx` | Drunk 立体ロゴ＋提灯＋サブタイトル（DRY） | **Create** |
| `src/views/LoginView.tsx` | ロゴをBrandLogoに差し替え | Modify |
| `src/views/HomeView.tsx` | ロゴ差し替え・藍色influence除去・進行中ステッカー・セクション見出し | Modify |
| `src/views/GroupSetupView.tsx` | ロゴ差し替え（小） | Modify |
| `src/components/OnboardingOverlay.tsx` | 新トーンに微調整（インライン色） | Modify |
| `src/views/PartyView/index.tsx` | ヘッダー・「●リアルタイム同期」バッジ・タブnav | Modify |
| `src/views/PartyView/MembersTab.tsx` | メンバーカードを `.seat` に・メガ/ドリンクボタンの質感 | Modify |
| `src/views/PartyView/SplitTab.tsx` | （ほぼ `.glass` 継承）見出し微調整 | Modify（軽微） |
| `src/views/PartyView/SummaryTab.tsx` | （ほぼ継承）変更ほぼ不要 | 確認のみ |
| `src/views/StatsView/index.tsx` | タブ群の質感 | Modify（軽微） |
| `src/components/DateNavigator.tsx` | 矢印ボタンの質感 | Modify（軽微） |
| `src/components/StatMetric.tsx` | 数値をゲーム数字風に | Modify（軽微） |
| `src/components/PartyHistoryCard.tsx` | （`.glass` 継承）確認のみ | 確認のみ |
| `src/components/MemberStatsList.tsx` | （`.glass` 継承）メダル/数値微調整 | Modify（軽微） |
| `src/views/ShareChoiceView.tsx` | （継承）確認のみ | 確認のみ |
| `src/views/LoadingView.tsx` | 提灯ローディングに | Modify（軽微） |

`design-preview/` は確認用の静的モック。ビルド対象外（Vite は root の `index.html` のみエントリ）。本タスクでは削除せず**デザイン参照として残す**。

---

## Task 1: 基盤（フォント＋design token＋共通クラス）

これが本リデザインの**キーストーン**。ここで全画面の地色・パネル・ボタン・入力・ナビが新デザインに変わる。

**Files:**
- Modify: `index.html`（12行目のfonts、7行目のtheme-color）
- Modify: `src/index.css`（全面）

- [ ] **Step 1: フォントと theme-color を更新**

`index.html` の `<link href="...css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@400;500;700&display=swap" ...>`（12行目）を次に置換：

```html
    <link href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=M+PLUS+Rounded+1c:wght@400;500;700;800&family=RocknRoll+One&family=Reggae+One&display=swap" rel="stylesheet">
```

7行目 `<meta name="theme-color" content="#120c08" />` を次に置換：

```html
    <meta name="theme-color" content="#0c0805" />
```

- [ ] **Step 2: `src/index.css` を次の内容で全面置換**

```css
@import "tailwindcss";

:root {
  /* ── 地・面 ── */
  --bg-color: #0c0805;
  --bg-1: #180e07;
  --bg-surface: #20130a;
  --bg-surface-2: #2c1a0d;
  --bg-surface-glass: rgba(32, 19, 10, 0.82);

  /* ── 文字 ── */
  --text-primary: #fbedd2;
  --text-secondary: #b89a72;
  --text-faint: #8a6e4d;

  /* ── アクセント（提灯の灯り〜炭火） ── */
  --accent-color: #f0961a;
  --accent-bright: #ffb43d;
  --accent-gradient: linear-gradient(180deg, #ffd368 0%, #ffb43d 45%, #f0961a 100%);
  --danger-color: #d63f1e;
  --success-color: #39d27a;
  --seal-color: #e23b22;

  /* ── 立体（ゲームUI）：縁取り・厚みの影色 ── */
  --outline: #6e2a06;
  --depth: #9c2a10;
  --depth-dark: #0c0805;

  --border-color: rgba(255, 180, 61, 0.22);
  --border-strong: rgba(255, 180, 61, 0.45);
  --shadow-glass: 0 8px 0 rgba(0, 0, 0, 0.32), 0 14px 28px 0 rgba(0, 0, 0, 0.45);

  --font-display: 'Dela Gothic One', cursive;
  --font-pop: 'RocknRoll One', 'M PLUS Rounded 1c', sans-serif;
  --font-retro: 'Reggae One', 'M PLUS Rounded 1c', cursive;
  --font-family: 'M PLUS Rounded 1c', -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }

body {
  background-color: var(--bg-color);
  background-image:
    radial-gradient(120% 48% at 50% -6%, rgba(255, 180, 61, 0.16) 0%, rgba(214, 63, 30, 0.05) 40%, transparent 64%),
    radial-gradient(80% 36% at 95% 102%, rgba(214, 63, 30, 0.08) 0%, transparent 60%),
    repeating-linear-gradient(91deg, transparent 0 17px, rgba(90, 46, 18, 0.14) 18px 19px),
    linear-gradient(180deg, var(--bg-1), var(--bg-color) 62%);
  color: var(--text-primary);
  font-family: var(--font-family);
  line-height: 1.5;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  width: 100%;
}

/* スキャンライン＋ビネット（アーケード感）。操作を妨げないオーバーレイ */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 9999;
  background-image: repeating-linear-gradient(0deg, rgba(0,0,0,0.06) 0 2px, transparent 2px 4px);
  box-shadow: inset 0 0 140px 30px rgba(0, 0, 0, 0.5);
}

#root {
  flex: 1;
  display: flex;
  flex-direction: column;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
  position: relative;
  overflow: hidden;
}

@layer components {
  /* パネル（昔の .glass を立体カードへ） */
  .glass {
    background: var(--bg-surface-glass);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 2px solid var(--border-color);
    border-radius: 18px;
    box-shadow: var(--shadow-glass);
  }

  .view {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
    overflow-y: auto;
    animation: fadeIn 0.3s ease-out;
  }

  /* 通常ボタン（暗トーンの立体小ボタン） */
  .btn {
    background: linear-gradient(180deg, var(--bg-surface-2), var(--bg-surface));
    color: var(--text-primary);
    border: 2px solid var(--border-color);
    padding: 0.7rem 1.4rem;
    border-radius: 13px;
    font-size: 1rem;
    font-weight: 700;
    font-family: var(--font-family);
    cursor: pointer;
    transition: transform 0.1s ease, box-shadow 0.1s ease, opacity 0.1s ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 44px;
    touch-action: manipulation;
    box-shadow: 0 4px 0 rgba(0, 0, 0, 0.35);
    &:active { transform: translateY(3px); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.35); opacity: 0.95; }
  }

  /* 主CTA：金の立体ボタン（btn-primary を使う全画面が自動で派手に） */
  .btn-primary {
    background: var(--accent-gradient);
    border: 2px solid var(--outline);
    color: #3a1402;
    box-shadow: 0 6px 0 var(--depth), 0 11px 20px rgba(0, 0, 0, 0.4);
    &:active { transform: translateY(4px); box-shadow: 0 2px 0 var(--depth), 0 5px 10px rgba(0, 0, 0, 0.4); opacity: 1; }
  }

  /* 汎用の大きな立体ボタン（ヒーローCTA用） */
  .btn-3d {
    width: 100%;
    text-align: left;
    border: 3px solid var(--outline);
    border-radius: 18px;
    padding: 1.1rem 1.1rem 1rem;
    color: #3a1402;
    background: var(--accent-gradient);
    box-shadow: 0 7px 0 var(--depth), 0 12px 18px rgba(0, 0, 0, 0.45);
    font-family: var(--font-family);
    cursor: pointer;
    transition: transform 0.08s ease, box-shadow 0.08s ease;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    &:active { transform: translateY(5px); box-shadow: 0 2px 0 var(--depth), 0 5px 10px rgba(0, 0, 0, 0.4); }
  }
  .btn-3d-dark {
    background: linear-gradient(180deg, var(--bg-surface-2), var(--bg-surface));
    border-color: var(--depth-dark);
    color: var(--text-primary);
    box-shadow: 0 6px 0 var(--depth-dark), 0 10px 16px rgba(0, 0, 0, 0.4);
    &:active { transform: translateY(4px); box-shadow: 0 2px 0 var(--depth-dark), 0 5px 10px rgba(0, 0, 0, 0.35); }
  }
  .btn-3d .btn-3d-title { font-family: var(--font-display); font-size: 1.25rem; letter-spacing: 0.01em; line-height: 1.15; }
  .btn-3d .btn-3d-sub { font-weight: 700; font-size: 0.72rem; margin-top: 0.3rem; color: #6e2a06; }
  .btn-3d-dark .btn-3d-sub { color: var(--text-faint); }
  .btn-3d .btn-3d-ic { font-size: 2rem; flex: none; }

  .btn-sm { padding: 0.4rem 0.75rem; font-size: 0.85rem; box-shadow: 0 3px 0 rgba(0,0,0,0.3); &:active { box-shadow: 0 1px 0 rgba(0,0,0,0.3); } }
  .btn-ghost { border: none; background: transparent; box-shadow: none; &:active { box-shadow: none; } }
  .btn-dashed { border: 2px dashed var(--border-color); background: transparent; box-shadow: none; &:active { box-shadow: none; } }
  .btn-dashed-danger { border: 2px dashed var(--danger-color); background: transparent; color: var(--danger-color); box-shadow: none; &:active { box-shadow: none; } }

  .text-muted { color: var(--text-secondary); }
  .text-accent { color: var(--accent-color); }

  .input-field {
    background: rgba(0, 0, 0, 0.22);
    border: 2px solid var(--border-color);
    color: var(--text-primary);
    padding: 0.75rem;
    border-radius: 12px;
    font-family: var(--font-family);
    font-size: 1rem;
    &:focus { outline: none; border-color: var(--accent-bright); box-shadow: 0 0 0 3px rgba(255, 180, 61, 0.18); }
  }

  .bottom-nav {
    display: flex;
    justify-content: space-around;
    padding: 0.75rem 0.5rem;
    padding-bottom: calc(0.75rem + env(safe-area-inset-bottom));
    background: rgba(12, 8, 5, 0.86);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    border-top: 2px solid var(--border-color);
    position: sticky;
    bottom: 0;
    z-index: 100;
  }

  /* ── ブランド：Drunk 立体ロゴ ── */
  .logo-3d {
    font-family: var(--font-display);
    color: #ffcf5e;
    line-height: 0.9;
    -webkit-text-stroke: 3px var(--outline);
    text-shadow:
      0 3px 0 #b9460f, 0 5px 0 var(--depth),
      0 7px 0 #7a1f0a, 0 10px 16px rgba(0, 0, 0, 0.55),
      0 0 26px rgba(255, 180, 61, 0.42);
    transform: rotate(-2deg);
  }
  .logo-sub {
    display: inline-block;
    font-family: var(--font-pop);
    font-size: 0.7rem;
    letter-spacing: 0.32em;
    color: #3a1402;
    background: var(--accent-gradient);
    padding: 0.25rem 1rem;
    border-radius: 999px;
    border: 2px solid var(--outline);
    box-shadow: 0 3px 0 var(--outline);
  }

  /* 提灯 */
  .lantern {
    width: 66px; height: 82px; margin: 0 auto 0.4rem; position: relative; border-radius: 50% / 42%;
    background: radial-gradient(60% 50% at 50% 45%, rgba(255,214,120,0.95), rgba(240,150,26,0.9) 55%, #b9460f 100%);
    box-shadow: 0 0 46px 7px rgba(255,180,61,0.5), inset 0 -7px 22px rgba(120,30,0,0.6);
    animation: flicker 4s ease-in-out infinite;
  }
  .lantern::after {
    content: "呑"; position: absolute; inset: 0; display: grid; place-items: center;
    font-family: var(--font-retro); font-size: 2rem; color: #7a1606;
  }

  /* 進行中ステッカー */
  .sticker {
    display: inline-flex; align-items: center; gap: 0.4rem;
    font-family: var(--font-pop); font-size: 0.72rem; color: #06371b;
    background: var(--success-color); padding: 0.35rem 0.7rem; border-radius: 10px;
    border: 2px solid #064d27; box-shadow: 0 3px 0 #064d27;
  }
  .sticker-dot { width: 7px; height: 7px; border-radius: 50%; background: #06371b; animation: pulse 1.3s infinite; }

  /* リアルタイム同期バッジ（プレゼンス件数は出さない＝事実整合） */
  .sync-badge {
    display: inline-flex; align-items: center; gap: 0.4rem;
    font-size: 0.7rem; font-weight: 700; color: var(--success-color);
  }
  .sync-badge .sticker-dot { background: var(--success-color); box-shadow: 0 0 0 3px rgba(57,210,122,0.18); }

  /* セクション見出し（点線の暖簾） */
  .sec-divider { display: flex; align-items: center; gap: 0.7rem; margin: 1.6rem 0.2rem 0.8rem; }
  .sec-divider span { font-family: var(--font-pop); font-size: 0.8rem; color: var(--text-secondary); letter-spacing: 0.12em; white-space: nowrap; }
  .sec-divider .sec-line { flex: 1; height: 2px; border-radius: 2px; background: repeating-linear-gradient(90deg, var(--border-strong) 0 6px, transparent 6px 10px); }

  /* メンバー席（カウンターの一席）。※ユーザー↔メンバー紐付けが無いため "you" 強調はしない */
  .seat {
    border-radius: 18px; padding: 0.9rem; border: 2px solid var(--border-color);
    background: linear-gradient(180deg, var(--bg-surface-2), var(--bg-surface));
    box-shadow: 0 7px 0 rgba(0, 0, 0, 0.35);
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes flicker {
  0%, 100% { box-shadow: 0 0 46px 7px rgba(255,180,61,0.5), inset 0 -7px 22px rgba(120,30,0,0.6); }
  50% { box-shadow: 0 0 58px 11px rgba(255,180,61,0.7), inset 0 -7px 22px rgba(120,30,0,0.6); }
}
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }
```

- [ ] **Step 3: ビルド＆単体テスト＆未認証スクショで検証**

```bash
cd /home/hiromi/drunk && npm run build && npm run test:unit
```
Expected: build 成功（CSSパースエラー無し）、test:unit 全パス。

未認証画面（LoginView）のスクショで地色・ロゴ周辺・主CTAが新トーンか確認（任意・上の preview コマンド）。

- [ ] **Step 4: コミット**

```bash
git add index.html src/index.css
git commit -m "design: DARK ARCADE のdesign token・共通クラスへ刷新"
```

---

## Task 2: BrandLogo コンポーネント（DRY）

ロゴは Login / Home / GroupSetup の3か所に重複している。1コンポーネントに集約し、立体ロゴ＋（任意で）提灯＋サブタイトルを提供する。

**Files:**
- Create: `src/components/BrandLogo.tsx`

- [ ] **Step 1: `src/components/BrandLogo.tsx` を作成**

```tsx
interface Props {
  size?: 'lg' | 'md';        // lg=ホーム/ログイン, md=グループ設定
  lantern?: boolean;         // 上に提灯を出す
  subtitle?: string;         // リボンの文言（省略時は出さない）
}

export function BrandLogo({ size = 'lg', lantern = false, subtitle }: Props) {
  const fontSize = size === 'lg' ? '4.6rem' : '2.6rem';
  return (
    <div className="text-center">
      {lantern && <div className="lantern" />}
      <div className="logo-3d" style={{ fontSize }}>Drunk</div>
      {subtitle && <div style={{ marginTop: '0.6rem' }}><span className="logo-sub">{subtitle}</span></div>}
    </div>
  );
}
```

- [ ] **Step 2: ビルド確認**

Run: `npm run build`
Expected: 成功（未使用でも型エラー無し）。

- [ ] **Step 3: コミット**

```bash
git add src/components/BrandLogo.tsx
git commit -m "design: Drunk 立体ロゴを BrandLogo に集約"
```

---

## Task 3: HomeView ＋ OnboardingOverlay

**Files:**
- Modify: `src/views/HomeView.tsx`
- Modify: `src/components/OnboardingOverlay.tsx`

- [ ] **Step 1: HomeView のロゴブロックを BrandLogo に差し替え**

import に追加：
```tsx
import { BrandLogo } from '../components/BrandLogo';
```

`HomeView.tsx` の現在のロゴ `<div className="text-center mt-4 mb-4"> ... <h1 style={{fontFamily:'var(--font-display)', fontSize:'5rem', ...}}>Drunk</h1> ... </div>`（87–101行目相当）を次へ置換：

```tsx
      <div className="mt-4 mb-4">
        <BrandLogo size="lg" lantern subtitle="のみかい マネージャー" />
      </div>
```

- [ ] **Step 2: 主CTA から藍色の残骸を除去し、立体ボタン＋進行中ステッカーに**

現在の主CTAブロック（`<div className="glass text-center p-4 mt-8"> <button onClick={handleNewParty} className="btn btn-primary w-full p-4" style={{ ..., boxShadow:'0 4px 15px rgba(99, 102, 241, 0.4)' }}>...</button> <p>...</p></div>`、103–114行目相当）を次へ置換（**`rgba(99,102,241,...)` の藍色influenceを削除**）：

```tsx
      <div className="mt-6">
        {activeParty && (
          <div className="text-center" style={{ marginBottom: '0.6rem' }}>
            <span className="sticker"><span className="sticker-dot" />進行中の飲み会があります</span>
          </div>
        )}
        <button onClick={handleNewParty} className="btn-3d">
          <div>
            <div className="btn-3d-title">{activeParty ? '飲み会に参加' : '飲み会スタート'}</div>
            <div className="btn-3d-sub">
              {activeParty ? 'みんなが編集中の記録にそのまま合流' : 'いつものメンバーで新しい記録を始めます'}
            </div>
          </div>
          <span className="btn-3d-ic">🍺</span>
        </button>
      </div>
```

- [ ] **Step 3: 「データと集計」ボタンを暗トーンの立体ボタンへ**

現在の集計ブロック（`<div className="glass text-center p-4 mt-4"> <button ... className="btn w-full p-3" style={{...}}>📊 データと集計を見る</button> <p>過去 {n} 回...</p></div>`、116–127行目相当）を次へ置換：

```tsx
      <div className="sec-divider"><span>記録をふりかえる</span><div className="sec-line" /></div>
      <button
        onClick={() => { dispatch({ type: 'SET_STATS_DATE', date: new Date() }); dispatch({ type: 'SET_VIEW', view: 'stats' }); }}
        className="btn-3d btn-3d-dark"
      >
        <div>
          <div className="btn-3d-title" style={{ fontSize: '1.1rem' }}>データと集計を見る</div>
          <div className="btn-3d-sub">これまで {state.historyData.length} 回の記録</div>
        </div>
        <span className="btn-3d-ic">📊</span>
      </button>
```

- [ ] **Step 4: ユーザー行・招待コード行の前にセクション見出しを追加（任意の体裁）**

ユーザー情報の `<div className="glass p-3 mt-4" ...>`（129行目相当）の直前に挿入：

```tsx
      <div className="sec-divider"><span>この席のあなた</span><div className="sec-line" /></div>
```

（招待コード/退出ブロックは `.glass`/`.btn` 継承で自動的に新トーンになる。追加変更不要。）

- [ ] **Step 5: OnboardingOverlay の色味を新トーンへ微調整**

`OnboardingOverlay.tsx` の見出し `<h2 style={{ ..., color: 'var(--accent-color)' }}>` を `color: 'var(--accent-bright)'` に変更。背景 `background: 'rgba(18, 12, 8, 0.92)'` を `'rgba(12, 8, 5, 0.93)'` に変更。本文・ドット・ボタンは既存クラス/変数で追従するため他は変更不要。タイトルフォントは `var(--font-display)` のまま。

- [ ] **Step 6: ビルド＆テスト＆コミット**

```bash
npm run build && npm run test:unit
git add src/views/HomeView.tsx src/components/OnboardingOverlay.tsx
git commit -m "design: ホームとオンボーディングを DARK ARCADE に（藍色残骸を除去）"
```
Expected: build 成功・test:unit 全パス。`grep -n "99, 102, 241" src/views/HomeView.tsx` が0件（藍色除去の確認）。

---

## Task 4: PartyView（飲み会中）

**Files:**
- Modify: `src/views/PartyView/index.tsx`
- Modify: `src/views/PartyView/MembersTab.tsx`
- Modify: `src/views/PartyView/SplitTab.tsx`

- [ ] **Step 1: PartyView ヘッダーに店名見出し＋「●リアルタイム同期」バッジ**

`index.tsx` の上部ヘッダー（76–92行目相当：保存/タイトル/戻る の3カラム）はそのまま活かしつつ、タイトル `<h2>{isEditing ? '履歴を編集' : '飲み会中'}</h2>` の下に同期バッジを足す。`<h2 ...>` を次の塊に置換：

```tsx
          <div style={{ flex: 2, textAlign: 'center' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{isEditing ? '履歴を編集' : '飲み会中'}</h2>
            {!isEditing && partyState.id && (
              <span className="sync-badge" style={{ marginTop: '0.15rem' }}>
                <span className="sticker-dot" />リアルタイム同期
              </span>
            )}
          </div>
```

（「N人が編集中」はプレゼンス未実装のため出さない。購読中＝同期中の事実のみ表示。）

- [ ] **Step 2: 下部ナビのアクティブ色を維持（変更不要の確認）**

`bottom-nav` は Task 1 で枠が更新済み。アクティブ色は既存の `var(--accent-color)` のままでよい。変更不要。

- [ ] **Step 3: MembersTab のメンバーカードを `.seat` に**

`MembersTab.tsx` の `{partyState.members.map((member) => ( <div key={member.id} className="glass p-3">` を `<div key={member.id} className="seat" style={{ marginBottom: 0 }}>` に変更（`flex flex-col gap-3` の親は維持）。

各メンバー見出しの区切り線 `style={{ borderBottom: '1px solid var(--border-color)', ... }}` を `borderBottom: '2px dotted var(--border-color)'` に変更（点線でレトロ感）。

メンバー名カウント `<span className="text-accent" ...>計 {n} 杯...</span>` の font を `fontFamily: 'var(--font-pop)'` に。

- [ ] **Step 4: ドリンクボタンに立体の手応えを付与（タッチハンドラは無改変）**

`MembersTab.tsx` のドリンク `<button className="btn" style={{ padding:'0.5rem', flexDirection:'column', ... }}>` の `style` に `borderRadius: 14, boxShadow: count > 0 ? '0 4px 0 var(--outline)' : '0 4px 0 rgba(0,0,0,0.3)'` を追加（押下時の沈みは `.btn:active` が担う）。カウント数字 `<span style={{ fontWeight:700, color: count>0?'var(--text-primary)':'var(--text-secondary)', ... }}>` を `fontFamily:'var(--font-display)', color: count>0?'#ffcf5e':'var(--text-faint)'` に変更。**`onTouchStart/onTouchEnd` の `e.preventDefault()` と各ハンドラは絶対に変更しない**（Android 2重カウント対策・CLAUDE.md）。

メガ入力トグルボタンは既存のままで可（`var(--danger-color)` が新トーンに合う）。任意で `borderRadius: 999` の丸ピル化。

- [ ] **Step 5: SplitTab・SummaryTab の確認**

SplitTab は `.glass`/`.input-field`/`.btn` 継承で新トーンになる。傾斜配分の役割ボタン群の親 `background: 'var(--bg-surface)'` はそのままで可。見出し `<h2>` 群は変更不要。SummaryTab も `.glass`/`.input-field`/`.btn-primary` 継承で追従するため**コード変更不要**（読み確認のみ）。

- [ ] **Step 6: ビルド＆テスト＆コミット**

```bash
npm run build && npm run test:unit
git add src/views/PartyView/
git commit -m "design: 飲み会中を DARK ARCADE に（席カード・同期バッジ・立体ドリンク）"
```
Expected: build 成功・test:unit 全パス。`grep -rn "preventDefault" src/views/PartyView/MembersTab.tsx` が従来どおり2件残ること（タッチ対策維持の確認）。

---

## Task 5: StatsView ＋ 各 component ＋ 残り画面

ほぼ `.glass`/`.btn` 継承で追従。要所のみ微調整。

**Files:**
- Modify: `src/views/StatsView/index.tsx`
- Modify: `src/components/DateNavigator.tsx`
- Modify: `src/components/StatMetric.tsx`
- Modify: `src/components/MemberStatsList.tsx`
- Modify: `src/views/LoginView.tsx`
- Modify: `src/views/GroupSetupView.tsx`
- Modify: `src/views/LoadingView.tsx`
- 確認のみ: `src/components/PartyHistoryCard.tsx` / `src/views/ShareChoiceView.tsx`

- [ ] **Step 1: StatsView タブ群の質感**

`index.tsx` のタブコンテナ `style={{ display:'flex', background:'rgba(0,0,0,0.3)', borderRadius:8, padding:'0.2rem', ... }}` を `borderRadius: 13, border: '2px solid var(--border-color)'` に。アクティブタブ `background: activeStatsTab===tab.id ? 'var(--bg-surface)' : 'transparent'` を `background: activeStatsTab===tab.id ? 'var(--accent-gradient)' : 'transparent'`、`color: activeStatsTab===tab.id ? '#fff' : ...` を `'#3a1402'` に、`fontFamily:'var(--font-pop)'` を追加。

- [ ] **Step 2: DateNavigator**

`DateNavigator.tsx` のラベル `<span style={{ fontWeight:'bold', fontSize:'1.1rem' }}>` に `fontFamily:'var(--font-pop)'` を追加。`.glass p-2` はそのままで可。

- [ ] **Step 3: StatMetric の数値をゲーム数字風に**

`StatMetric.tsx` の値 `<div className={accent ? 'text-accent' : undefined} style={{ fontSize: size==='lg'?'2rem':'1.5rem', fontWeight:'bold' }}>` に `fontFamily:'var(--font-display)'` を追加し、`accent` 時は次のスタイルで提灯ロゴ色に：

```tsx
      <div
        style={{
          fontSize: size === 'lg' ? '2rem' : '1.5rem',
          fontFamily: 'var(--font-display)',
          color: accent ? '#ffcf5e' : 'var(--text-primary)',
          WebkitTextStroke: accent ? '1.5px var(--outline)' : undefined,
        }}
      >
        {value}
      </div>
```
（`className={accent ? 'text-accent' : undefined}` は削除し上記 style に集約。）

- [ ] **Step 4: MemberStatsList の金額・合計をポップフォントに**

`MemberStatsList.tsx` の `<span className="font-bold text-accent">{formatYen(m.amount)}</span>` に `style={{ fontFamily:'var(--font-pop)' }}` を追加。メダル絵文字・行レイアウトは維持。内側の `background:'rgba(0,0,0,0.2)'` 行は `borderRadius: 8` に上げる。

- [ ] **Step 5: LoginView / GroupSetupView のロゴを BrandLogo に**

LoginView：import に `import { BrandLogo } from '../components/BrandLogo';` を追加し、`<div className="text-center mb-4"> <h1 style={{ fontFamily:'var(--font-display)', fontSize:'5rem', ... }}>Drunk</h1> <p>...</p></div>`（508–522行目相当）を次へ置換：

```tsx
      <div className="mb-4">
        <BrandLogo size="lg" lantern subtitle="のみかい マネージャー" />
      </div>
```

GroupSetupView：import に追加し、`<div className="text-center mb-4"> <h1 style={{ fontSize:'2rem', background:'var(--accent-gradient)', ... }}>グループ設定</h1> <p>...</p></div>`（595–600行目相当）を次へ置換：

```tsx
      <div className="text-center mb-4">
        <BrandLogo size="md" />
        <h1 style={{ fontSize: '1.4rem', marginTop: '0.8rem' }}>グループ設定</h1>
        <p className="text-muted">グループを作成するか、招待コードで参加してください</p>
      </div>
```

（GroupSetup の「新しく作る」「参加する」カードと入力・ボタンは `.glass`/`.input-field`/`.btn-primary` 継承で追従。変更不要。）

- [ ] **Step 6: LoadingView を提灯ローディングに**

`LoadingView.tsx` を次へ置換：

```tsx
export function LoadingView() {
  return (
    <div className="view" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="lantern" />
      <p className="text-muted" style={{ marginTop: '1rem', fontFamily: 'var(--font-pop)', letterSpacing: '0.1em' }}>読み込み中…</p>
    </div>
  );
}
```

- [ ] **Step 7: PartyHistoryCard / ShareChoiceView の確認**

両者とも `.glass`/`.btn`/`.btn-primary`/`.btn-dashed` 継承で新トーンになる。コード変更不要（読み確認のみ）。点線 `borderTop:'1px dashed var(--border-color)'` は `2px` に上げてもよい（任意）。

- [ ] **Step 8: ビルド＆テスト＆コミット**

```bash
npm run build && npm run test:unit
git add src/views/StatsView/ src/components/ src/views/LoginView.tsx src/views/GroupSetupView.tsx src/views/LoadingView.tsx
git commit -m "design: 集計・ログイン・設定・各部品を DARK ARCADE に統一"
```
Expected: build 成功・test:unit 全パス。

---

## Task 6: 仕上げ・全体検証

**Files:** 横断（微調整のみ）

- [ ] **Step 1: 全文検索で旧テーマ/AIっぽい残骸が無いか確認**

```bash
cd /home/hiromi/drunk
grep -rn "99, 102, 241\|99,102,241" src/        # 藍色（0件であること）
grep -rn "#120c08\|#1f140d" src/                  # 旧地色の直書き（0件 or 意図的のみ）
```
Expected: 藍色0件。旧地色の直書きが残っていれば CSS 変数へ置換。

- [ ] **Step 2: 本番ビルド＋全テスト**

```bash
npm run build && npm run test:unit
```
Expected: いずれも成功。

- [ ] **Step 3: 未認証画面のスクショで最終目視（任意）**

上部「検証用ヘッドレスコマンド」で LoginView を撮影し、ロゴ立体・地色・主CTAがモック `design-preview/arcade.html` と整合するか確認。

- [ ] **Step 4: CLAUDE.md にデザインの既知事項を追記**

`CLAUDE.md` の「## デザイン」節を更新：テーマ名「DARK ARCADE 居酒屋」、フォント追加（RocknRoll One / Reggae One）、共通クラス（`.btn-3d` / `.logo-3d` / `.lantern` / `.sticker` / `.sec-divider` / `.seat`）の存在と「カスタムクラスは `@layer components`」の再掲、「ユーザー↔メンバー紐付けが無いため席の個人ハイライトとプレゼンス件数は出さない」方針を明記。

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "docs: DARK ARCADE デザインの既知事項を CLAUDE.md に追記"
```

- [ ] **Step 6: ユーザーへ push 承認を依頼**

ビルド・テスト結果を提示し、`git push origin main`（GitHub Pages 自動デプロイ）の承認を仰ぐ。**push はユーザー承認後**（CLAUDE.md ワークフロー）。

---

## Self-Review（spec=承認モック arcade.html との突き合わせ）

- **提灯/木目/ビネット/スキャンライン** → Task 1（body 背景・`.lantern`・body::before）✔
- **Drunk 立体ロゴ（英字固定）** → Task 1 `.logo-3d` ＋ Task 2 `BrandLogo` ＋ Task3/5 適用 ✔
- **金の立体ボタン・押下の沈み** → Task 1 `.btn-primary`/`.btn-3d`（`:active` で translateY）✔
- **進行中ステッカー（緑パルス）** → Task 1 `.sticker` ＋ Task 3 適用（実データ `activeParty`）✔
- **席カード・点線仕切り・ゲーム数字** → Task 1 `.seat`／Task 4 MembersTab／Task 5 StatMetric ✔
- **丸ゴシック＋RocknRoll/Reggae（明朝不使用）** → Task 1 fonts ＋ 各所 `--font-pop`/`--font-retro` ✔
- **モックの「あなた」印・「N人が編集中」** → **意図的に不採用**（ユーザー↔メンバー紐付け／プレゼンス未実装＝事実整合のため。`.sync-badge` で「リアルタイム同期」の事実のみ表示）✔
- **タッチ2重カウント対策の維持** → Task 4 Step4 で明記・grep 検証 ✔

Placeholder スキャン：TBD/TODO 等なし。型整合：`BrandLogo` props（size/lantern/subtitle）は全呼び出し（Home=lg+lantern+subtitle / Login=lg+lantern+subtitle / GroupSetup=md）と一致 ✔。
