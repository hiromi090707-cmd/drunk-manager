import './style.css'

// --- State ---
let currentView = 'home'; // home, party, stats, shareChoice
let activeTab = 'members'; // members, split, summary
let activeStatsTab = 'month'; // day, month, year, all
let statsDate = new Date(); // Track current month/year/day for stats view

const FIXED_MEMBERS = [
  { id: 'hiromi', name: 'ひろみ' },
  { id: 'souga', name: 'そうが' },
  { id: 'takumi', name: 'たくみ' },
  { id: 'takuto', name: 'たくと' },
  { id: 'rui', name: 'るい' }
];

let partyState = {
  id: null,
  areaName: '',
  storeName: '',
  startTime: null,
  members: [], 
  split: { totalAmount: 0, roles: {} },
  summary: { rawText: '', result: '' }
};

const DRINK_TYPES = [
  { id: 'beer', emoji: '🍺', name: 'ビール' },
  { id: 'highball', emoji: '🥃', name: 'ハイボール' },
  { id: 'sour', emoji: '🍋', name: 'サワー' },
  { id: 'other', emoji: '🍷', name: 'その他' }
];

const SPLIT_ROLES = [
  { id: 1.5, label: '多め', color: 'var(--danger-color)' },
  { id: 1.0, label: '普通', color: 'var(--accent-color)' },
  { id: 0.5, label: '少なめ', color: 'var(--success-color)' },
  { id: 0.0, label: 'ゼロ', color: 'var(--text-secondary)' }
];

// --- PWA Share Target Check ---
const urlParams = new URLSearchParams(window.location.search);
const sharedText = urlParams.get('text') || urlParams.get('title') || urlParams.get('url');

if (sharedText) {
  window.history.replaceState({}, document.title, window.location.pathname);
  partyState.summary.rawText = sharedText;
  currentView = 'shareChoice';
}

// --- DOM Elements ---
const app = document.querySelector('#app');

// --- Render functions ---
function render() {
  if (currentView === 'home') app.innerHTML = renderHome();
  else if (currentView === 'party') app.innerHTML = renderActiveParty();
  else if (currentView === 'stats') app.innerHTML = renderStats();
  else if (currentView === 'shareChoice') app.innerHTML = renderShareChoice();
  
  attachEventListeners();
}

function renderShareChoice() {
  const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  const recentParties = history.sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).slice(0, 5);

  return `
    <div class="view" id="view-share-choice">
      <div class="text-center mt-4 mb-4">
        <h2 style="font-size: 1.2rem;">共有されたテキストの追加</h2>
        <p class="text-secondary" style="font-size: 0.8rem;">どこに追加するか選んでください</p>
      </div>

      <div class="glass p-3 mb-4 text-secondary" style="font-size: 0.8rem; max-height: 100px; overflow-y: auto;">
        ${partyState.summary.rawText}
      </div>

      <button id="btn-share-new" class="btn btn-primary w-full p-3 mb-4 text-lg">
        🍺 新しく飲み会を始める
      </button>

      <h3 class="text-secondary mb-3 mt-4 text-center" style="font-size: 0.9rem;">最近の履歴に紐付ける</h3>
      <div class="flex-column gap-2">
        ${recentParties.length === 0 ? '<p class="text-secondary text-center">履歴がありません</p>' : ''}
        ${recentParties.map(p => {
          const date = new Date(p.startTime).toLocaleDateString('ja-JP', {month:'short', day:'numeric'});
          return `
            <button class="btn btn-share-attach text-left" data-id="${p.id}" style="background: rgba(255,255,255,0.05); padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px;">
              <div style="font-weight:bold; font-size: 1rem;">${date} ${p.storeName || p.areaName || '名もなき飲み会'}</div>
              <div class="text-secondary" style="font-size:0.8rem;">¥${p.totalAmount.toLocaleString()}</div>
            </button>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderHome() {
  const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  
  return `
    <div class="view" id="view-home">
      <div class="text-center mt-4 mb-4">
        <h1 style="font-size: 3rem; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 0;">Drunk</h1>
        <p class="text-secondary">飲み会マネージャー</p>
      </div>
      
      <div class="glass text-center p-4 mt-8">
        <button id="btn-new-party" class="btn btn-primary w-full p-4 text-xl mb-3" style="box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);">
          🍺 飲み会スタート
        </button>
        <p class="text-secondary" style="font-size: 0.8rem;">いつものメンバーで新しい記録を始めます</p>
      </div>
      
      <div class="glass text-center p-4 mt-4">
        <button id="btn-view-stats" class="btn w-full p-3 text-lg" style="background: rgba(255,255,255,0.05); border: 1px solid var(--border-color);">
          📊 データと集計を見る
        </button>
        <p class="text-secondary mt-2" style="font-size: 0.8rem;">過去 ${history.length} 回の記録があります</p>
      </div>
    </div>
  `;
}

function getMemberStats(historyArray) {
  const stats = {};
  FIXED_MEMBERS.forEach(m => stats[m.id] = { 
    name: m.name, 
    totalDrinks: 0, 
    drinks: { beer: 0, highball: 0, sour: 0, other: 0 }, 
    amount: 0 
  });
  
  historyArray.forEach(p => {
    p.members.forEach(m => {
      if (stats[m.id]) {
        stats[m.id].totalDrinks += m.totalDrinks;
        if (m.drinks) {
          stats[m.id].drinks.beer += (m.drinks.beer || 0);
          stats[m.id].drinks.highball += (m.drinks.highball || 0);
          stats[m.id].drinks.sour += (m.drinks.sour || 0);
          stats[m.id].drinks.other += (m.drinks.other || 0);
        }
      }
    });
    if (p.memberAmounts) {
      Object.keys(p.memberAmounts).forEach(mId => {
        if (stats[mId]) stats[mId].amount += p.memberAmounts[mId];
      });
    }
  });
  return Object.values(stats).sort((a,b) => b.amount - a.amount);
}

function renderMemberStatsList(statsArray) {
  if (statsArray.every(m => m.amount === 0 && m.totalDrinks === 0)) return '';
  
  return `
    <div class="glass p-3 mb-4">
      <h3 class="mb-3 text-secondary text-center" style="font-size:0.9rem;">メンバー別 集計</h3>
      <div class="flex-column gap-3">
        ${statsArray.map((m, i) => `
          <div class="border-bottom pb-2">
            <div class="flex-between mb-1">
              <div>
                <span style="font-weight:bold;">${i===0 ? '🥇' : i===1 ? '🥈' : i===2 ? '🥉' : ' '} ${m.name}</span>
              </div>
              <div style="font-weight:bold; color:var(--accent-color);">¥${m.amount.toLocaleString()}</div>
            </div>
            <div class="flex-between text-secondary" style="font-size:0.8rem; background: rgba(0,0,0,0.2); padding: 0.3rem 0.5rem; border-radius: 4px;">
              <div style="display:flex; gap:0.5rem;">
                ${m.drinks.beer > 0 ? `<span>🍺${m.drinks.beer}</span>` : ''}
                ${m.drinks.highball > 0 ? `<span>🥃${m.drinks.highball}</span>` : ''}
                ${m.drinks.sour > 0 ? `<span>🍋${m.drinks.sour}</span>` : ''}
                ${m.drinks.other > 0 ? `<span>🍷${m.drinks.other}</span>` : ''}
              </div>
              <span style="font-weight:bold;">計 ${m.totalDrinks} 杯</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function renderStats() {
  return `
    <div class="view" id="view-stats">
      <div class="flex-between mb-4">
        <button id="btn-back-home" class="btn btn-sm">＜ 戻る</button>
        <h2 style="margin: 0; font-size: 1.2rem;">ダッシュボード</h2>
        <div style="width: 50px;"></div>
      </div>

      <div style="display: flex; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 0.2rem; margin-bottom: 1rem;">
        <button class="btn-stats-tab ${activeStatsTab === 'day' ? 'active' : ''}" data-tab="day" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${activeStatsTab === 'day' ? 'var(--bg-surface)' : 'transparent'}; color: ${activeStatsTab === 'day' ? '#fff' : 'var(--text-secondary)'};">日別</button>
        <button class="btn-stats-tab ${activeStatsTab === 'month' ? 'active' : ''}" data-tab="month" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${activeStatsTab === 'month' ? 'var(--bg-surface)' : 'transparent'}; color: ${activeStatsTab === 'month' ? '#fff' : 'var(--text-secondary)'};">月別</button>
        <button class="btn-stats-tab ${activeStatsTab === 'year' ? 'active' : ''}" data-tab="year" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${activeStatsTab === 'year' ? 'var(--bg-surface)' : 'transparent'}; color: ${activeStatsTab === 'year' ? '#fff' : 'var(--text-secondary)'};">年別</button>
        <button class="btn-stats-tab ${activeStatsTab === 'all' ? 'active' : ''}" data-tab="all" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${activeStatsTab === 'all' ? 'var(--bg-surface)' : 'transparent'}; color: ${activeStatsTab === 'all' ? '#fff' : 'var(--text-secondary)'};">全期間</button>
      </div>

      ${activeStatsTab === 'day' ? renderStatsDay() : ''}
      ${activeStatsTab === 'month' ? renderStatsMonth() : ''}
      ${activeStatsTab === 'year' ? renderStatsYear() : ''}
      ${activeStatsTab === 'all' ? renderStatsAll() : ''}
    </div>
  `;
}

function renderStatsDay() {
  const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  const y = statsDate.getFullYear();
  const m = statsDate.getMonth();
  const d = statsDate.getDate();
  
  const dayHistory = history.filter(p => {
    const pd = new Date(p.startTime);
    return pd.getFullYear() === y && pd.getMonth() === m && pd.getDate() === d;
  });

  const totalSpent = dayHistory.reduce((s, p) => s + p.totalAmount, 0);
  const memberStats = getMemberStats(dayHistory);

  return `
    <div class="flex-between mb-4 glass p-2">
      <button id="btn-prev-day" class="btn btn-sm" style="border:none; background:transparent;">◀</button>
      <span style="font-weight:bold; font-size: 1.1rem;">${y}年 ${m+1}月 ${d}日</span>
      <button id="btn-next-day" class="btn btn-sm" style="border:none; background:transparent;">▶</button>
    </div>

    <div class="text-center mb-4">
      <div class="text-secondary" style="font-size:0.8rem;">この日の利用額</div>
      <div style="font-size:2rem; font-weight:bold; color:var(--accent-color);">¥${totalSpent.toLocaleString()}</div>
      <div class="text-secondary mt-1" style="font-size:0.9rem;">開催回数: ${dayHistory.length}回</div>
    </div>

    ${renderMemberStatsList(memberStats)}

    <h3 class="text-secondary mb-2" style="font-size: 0.9rem;">この日の履歴</h3>
    <div class="flex-column gap-3 mb-4">
      ${dayHistory.length === 0 ? '<p class="text-center text-secondary" style="font-size:0.9rem;">記録がありません</p>' : ''}
      ${dayHistory.sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).map(p => {
        const time = new Date(p.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="glass p-3" style="font-size: 0.9rem;">
            <div class="flex-between mb-1">
              <span style="font-weight:bold;">${time} ~ ${p.storeName || p.areaName || '名もなき飲み会'}</span>
              <span style="color:var(--accent-color); font-weight:bold;">¥${p.totalAmount.toLocaleString()}</span>
            </div>
            ${p.summaryText ? `<div class="mt-2 pt-2 border-top" style="font-size: 0.8rem; border-top: 1px dashed var(--border-color); color: var(--text-secondary); white-space: pre-wrap;">${p.summaryText}</div>` : ''}
            <button class="btn btn-edit-party btn-sm" data-id="${p.id}" style="margin-top: 0.8rem; width: 100%; border: 1px dashed var(--border-color); background:transparent;">📝 編集</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderStatsMonth() {
  const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  const y = statsDate.getFullYear();
  const m = statsDate.getMonth();
  
  const monthHistory = history.filter(p => {
    const d = new Date(p.startTime);
    return d.getFullYear() === y && d.getMonth() === m;
  });

  const totalSpent = monthHistory.reduce((s, p) => s + p.totalAmount, 0);
  const memberStats = getMemberStats(monthHistory);

  // Calendar Logic
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const firstDay = new Date(y, m, 1).getDay(); // 0(Sun) - 6(Sat)
  
  const calendarDays = [];
  for(let i=0; i<firstDay; i++) calendarDays.push(null);
  for(let i=1; i<=daysInMonth; i++) calendarDays.push(i);

  const partyDays = monthHistory.map(p => new Date(p.startTime).getDate());

  return `
    <div class="flex-between mb-4 glass p-2">
      <button id="btn-prev-month" class="btn btn-sm" style="border:none; background:transparent;">◀</button>
      <span style="font-weight:bold; font-size: 1.1rem;">${y}年 ${m+1}月</span>
      <button id="btn-next-month" class="btn btn-sm" style="border:none; background:transparent;">▶</button>
    </div>

    <div class="flex-between mb-4 px-2">
      <div class="text-center">
        <div class="text-secondary" style="font-size:0.8rem;">開催回数</div>
        <div style="font-size:1.5rem; font-weight:bold;">${monthHistory.length}<span style="font-size:1rem;font-weight:normal;">回</span></div>
      </div>
      <div class="text-center">
        <div class="text-secondary" style="font-size:0.8rem;">利用金額</div>
        <div style="font-size:1.5rem; font-weight:bold; color:var(--accent-color);">¥${totalSpent.toLocaleString()}</div>
      </div>
    </div>

    ${renderMemberStatsList(memberStats)}

    <div class="glass p-3 mb-4">
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
        <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center;">
        ${calendarDays.map(day => {
          if (!day) return `<div style="padding: 0.5rem;"></div>`;
          const hasParty = partyDays.includes(day);
          return `
            <div style="
              padding: 0.4rem 0; 
              border-radius: 4px; 
              background: ${hasParty ? 'var(--accent-color)' : 'rgba(255,255,255,0.05)'};
              color: ${hasParty ? '#fff' : 'inherit'};
              font-weight: ${hasParty ? 'bold' : 'normal'};
              position: relative;
            ">
              ${day}
              ${hasParty ? '<div style="position:absolute; bottom: -2px; left: 50%; transform: translateX(-50%); font-size:0.5rem;">🍺</div>' : ''}
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <h3 class="text-secondary mb-2" style="font-size: 0.9rem;">${m+1}月の履歴</h3>
    <div class="flex-column gap-3 mb-4">
      ${monthHistory.length === 0 ? '<p class="text-center text-secondary" style="font-size:0.9rem;">記録がありません</p>' : ''}
      ${monthHistory.sort((a,b) => new Date(b.startTime) - new Date(a.startTime)).map(p => {
        const d = new Date(p.startTime);
        return `
          <div class="glass p-3" style="font-size: 0.9rem;">
            <div class="flex-between mb-1">
              <span style="font-weight:bold;">${d.getDate()}日: ${p.storeName || p.areaName || '名もなき飲み会'}</span>
              <span style="color:var(--accent-color); font-weight:bold;">¥${p.totalAmount.toLocaleString()}</span>
            </div>
            ${p.summaryText ? `<div class="mt-2 pt-2 border-top" style="font-size: 0.8rem; border-top: 1px dashed var(--border-color); color: var(--text-secondary); white-space: pre-wrap;">${p.summaryText}</div>` : ''}
            <button class="btn btn-edit-party btn-sm" data-id="${p.id}" style="margin-top: 0.8rem; width: 100%; border: 1px dashed var(--border-color); background:transparent;">📝 編集</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderStatsYear() {
  const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  const y = statsDate.getFullYear();
  
  const yearHistory = history.filter(p => new Date(p.startTime).getFullYear() === y);
  const totalSpent = yearHistory.reduce((s, p) => s + p.totalAmount, 0);
  const memberStats = getMemberStats(yearHistory);

  // Month by Month aggregation
  const monthTotals = Array(12).fill(0);
  yearHistory.forEach(p => {
    const m = new Date(p.startTime).getMonth();
    monthTotals[m] += p.totalAmount;
  });

  const maxMonth = Math.max(...monthTotals, 1);

  return `
    <div class="flex-between mb-4 glass p-2">
      <button id="btn-prev-year" class="btn btn-sm" style="border:none; background:transparent;">◀</button>
      <span style="font-weight:bold; font-size: 1.1rem;">${y}年</span>
      <button id="btn-next-year" class="btn btn-sm" style="border:none; background:transparent;">▶</button>
    </div>

    <div class="text-center mb-4">
      <div class="text-secondary" style="font-size:0.8rem;">${y}年の総利用額</div>
      <div style="font-size:2rem; font-weight:bold; color:var(--accent-color);">¥${totalSpent.toLocaleString()}</div>
      <div class="text-secondary mt-1" style="font-size:0.9rem;">開催回数: ${yearHistory.length}回</div>
    </div>

    ${renderMemberStatsList(memberStats)}

    <div class="glass p-4 mb-4">
      <h3 class="text-center mb-4 text-secondary" style="font-size:0.9rem;">月別利用額</h3>
      <div style="display:flex; align-items:flex-end; justify-content:space-between; height: 150px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color); position:relative;">
        ${monthTotals.map((amount, i) => {
          const heightPct = (amount / maxMonth) * 100;
          return `
            <div style="display:flex; flex-direction:column; align-items:center; width: 6%;">
              ${amount > 0 ? `<div style="font-size:0.6rem; color:var(--text-secondary); margin-bottom:2px; writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg);">${amount/1000}k</div>` : ''}
              <div style="width: 100%; height: ${heightPct}%; background: var(--accent-gradient); border-radius: 4px 4px 0 0; min-height: ${amount>0 ? '4px' : '0'};"></div>
              <div style="position:absolute; bottom: -20px; font-size:0.7rem; color:var(--text-secondary);">${i+1}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderStatsAll() {
  const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  const totalParties = history.length;
  const totalSpent = history.reduce((sum, p) => sum + p.totalAmount, 0);
  const memberStats = getMemberStats(history);

  return `
    <div class="glass p-4 mb-4 text-center">
      <div class="text-secondary" style="font-size:0.9rem;">累計開催回数</div>
      <div style="font-size:2rem; font-weight:bold; margin-bottom: 1rem;">${totalParties} 回</div>
      
      <div class="text-secondary" style="font-size:0.9rem;">累計利用額</div>
      <div style="font-size:2rem; font-weight:bold; color:var(--accent-color);">¥${totalSpent.toLocaleString()}</div>
    </div>

    ${renderMemberStatsList(memberStats)}
  `;
}

function renderActiveParty() {
  const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
  const areas = [...new Set(history.map(p => p.areaName).filter(Boolean))];
  const stores = [...new Set(history.map(p => p.storeName).filter(Boolean))];

  // If ID already exists in history, we are editing. Change button text.
  const isEditing = history.some(p => p.id === partyState.id);

  return `
    <div class="view" id="view-party" style="padding-bottom: 0;">
      <div class="flex-between mb-2">
        <button id="btn-end-party" class="btn btn-sm" style="${isEditing ? 'color: var(--accent-color); font-weight: bold;' : ''}">${isEditing ? '保存' : '終了'}</button>
        <h2 style="margin: 0; font-size: 1.1rem;">${isEditing ? '履歴を編集' : '飲み会中'}</h2>
        ${isEditing ? `<button id="btn-cancel-party" class="btn btn-sm">戻る</button>` : `<div style="width: 50px;"></div>`}
      </div>
      
      <div class="flex-between mb-4" style="gap: 0.5rem;">
        <input type="text" id="area-name-input" list="area-history" class="input flex-1" style="padding: 0.4rem; text-align: center; font-size: 0.9rem; background: rgba(0,0,0,0.2); border: 1px dashed var(--border-color);" placeholder="エリア (例: 新宿)" value="${partyState.areaName || ''}">
        <input type="text" id="store-name-input" list="store-history" class="input flex-1" style="padding: 0.4rem; text-align: center; font-size: 0.9rem; background: rgba(0,0,0,0.2); border: 1px dashed var(--border-color);" placeholder="店名を入力" value="${partyState.storeName || ''}">
        
        <datalist id="area-history">
          ${areas.map(a => `<option value="${a}">`).join('')}
          <option value="新宿">
          <option value="武蔵小杉">
          <option value="渋谷">
        </datalist>
        <datalist id="store-history">
          ${stores.map(s => `<option value="${s}">`).join('')}
        </datalist>
      </div>
      
      <div id="tab-content" style="flex: 1; overflow-y: auto;">
        ${activeTab === 'members' ? renderMembersTab() : ''}
        ${activeTab === 'split' ? renderSplitTab() : ''}
        ${activeTab === 'summary' ? renderSummaryTab() : ''}
      </div>
    </div>
    
    <div class="bottom-nav">
      <div class="nav-item ${activeTab === 'members' ? 'active' : ''}" data-tab="members">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        メンバー
      </div>
      <div class="nav-item ${activeTab === 'split' ? 'active' : ''}" data-tab="split">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        割り勘
      </div>
      <div class="nav-item ${activeTab === 'summary' ? 'active' : ''}" data-tab="summary">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        要約
      </div>
    </div>
  `;
}

function renderMembersTab() {
  return `
    <p class="text-secondary text-center mb-4" style="font-size: 0.8rem;">各ドリンクをタップで＋１ / 長押しで－１</p>
    <div class="flex-column gap-3 pb-4">
      ${partyState.members.map(member => `
        <div class="glass p-3">
          <div class="flex-between mb-3 border-bottom pb-2">
            <span style="font-weight: 700; font-size: 1.1rem;">${member.name}</span>
            <span style="color: var(--accent-color); font-weight: 700;">計 ${member.totalDrinks} 杯</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem;">
            ${DRINK_TYPES.map(drink => `
              <button class="btn btn-drink ${member.drinks[drink.id] > 0 ? 'active' : ''}" data-mid="${member.id}" data-type="${drink.id}" style="padding: 0.5rem; flex-direction: column; gap: 0.2rem; background: ${member.drinks[drink.id] > 0 ? 'var(--bg-surface)' : 'transparent'}; border-color: ${member.drinks[drink.id] > 0 ? 'var(--accent-color)' : 'var(--border-color)'};">
                <span style="font-size: 1.5rem; pointer-events: none;">${drink.emoji}</span>
                <span style="font-size: 0.65rem; pointer-events: none; color: var(--text-secondary); line-height: 1;">${drink.name}</span>
                <span style="font-weight: 700; color: ${member.drinks[drink.id] > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'}; pointer-events: none; font-size: 1.1rem;">${member.drinks[drink.id]}</span>
              </button>
            `).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSplitTab() {
  const result = calculateSplit();
  return `
    <div class="glass p-4 mb-4">
      <h2 class="text-center mb-3" style="font-size: 1.1rem;">お会計金額</h2>
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
        <span style="font-size: 1.5rem; font-weight: 700;">¥</span>
        <input type="number" id="total-amount-input" class="input" style="font-size: 2rem; font-weight: 700; width: 150px; text-align: center; color: var(--accent-color);" placeholder="0" value="${partyState.split.totalAmount || ''}">
      </div>
    </div>

    ${partyState.split.totalAmount > 0 ? `
      <div class="glass p-4 mb-4" style="background: var(--bg-surface);">
        <h2 class="text-center mb-3" style="font-size: 1.1rem;">お支払い額（100円単位切上）</h2>
        <div class="flex-column gap-2">
          ${partyState.members.map(m => {
            const amount = result.memberAmounts[m.id];
            const role = partyState.split.roles[m.id];
            const roleDef = SPLIT_ROLES.find(r => r.id === role);
            return `
              <div class="flex-between border-bottom pb-2">
                <div class="flex-column">
                  <span style="font-weight: 600;">${m.name}</span>
                  <span style="font-size: 0.7rem; color: ${roleDef.color};">${roleDef.label} (計${m.totalDrinks}杯)</span>
                </div>
                <span style="font-size: 1.25rem; font-weight: 700; color: ${amount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)'};">¥${amount.toLocaleString()}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div class="flex-between mt-4 text-secondary" style="font-size: 0.9rem;">
          <span>集金合計: ¥${result.collectedTotal.toLocaleString()}</span>
          <span>余り: ¥${result.excess.toLocaleString()}</span>
        </div>
      </div>
    ` : ''}

    <h2 class="text-secondary mb-3 mt-4" style="font-size: 1rem;">傾斜配分（支払い割合）</h2>
    <div class="flex-column gap-3 pb-4">
      ${partyState.members.map(m => `
        <div class="glass p-3 flex-between">
          <span style="font-weight: 600;">${m.name}</span>
          <div style="display: flex; gap: 0.25rem; background: var(--bg-surface); border-radius: 8px; padding: 0.2rem;">
            ${SPLIT_ROLES.map(role => {
              const isActive = partyState.split.roles[m.id] === role.id;
              return `
                <button class="btn-role" data-mid="${m.id}" data-role="${role.id}" style="
                  padding: 0.4rem 0.6rem; 
                  border-radius: 6px; 
                  border: none; 
                  background: ${isActive ? role.color : 'transparent'}; 
                  color: ${isActive ? '#fff' : 'var(--text-secondary)'};
                  font-size: 0.8rem;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.2s;
                ">${role.label}</button>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function calculateSplit() {
  const totalAmount = partyState.split.totalAmount;
  let totalShares = 0;
  partyState.members.forEach(m => totalShares += partyState.split.roles[m.id]);

  if (totalShares === 0 || totalAmount === 0) {
    const zeros = {};
    partyState.members.forEach(m => zeros[m.id] = 0);
    return { memberAmounts: zeros, collectedTotal: 0, excess: 0 };
  }

  const baseUnit = totalAmount / totalShares;
  let collectedTotal = 0;
  let memberAmounts = {};

  partyState.members.forEach(m => {
    const share = partyState.split.roles[m.id];
    let exactAmount = baseUnit * share;
    let roundedAmount = Math.ceil(exactAmount / 100) * 100;
    memberAmounts[m.id] = roundedAmount;
    collectedTotal += roundedAmount;
  });

  return { memberAmounts, collectedTotal, excess: collectedTotal - totalAmount };
}

function renderSummaryTab() {
  const apiKey = localStorage.getItem('gemini_api_key') || '';
  return `
    <div class="glass p-4 mb-4">
      <h2 class="text-center mb-3" style="font-size: 1.1rem;">会話の要約</h2>
      
      <div class="mb-3">
        <label class="text-secondary" style="font-size: 0.8rem;">Gemini APIキー</label>
        <input type="password" id="gemini-api-key" class="input w-full mt-1" style="font-size: 0.8rem; padding: 0.4rem;" placeholder="AIzaSy..." value="${apiKey}">
      </div>

      <div class="mb-3">
        <label class="text-secondary" style="font-size: 0.8rem;">文字起こしテキスト (自動入力されます)</label>
        <textarea id="raw-transcript-input" class="input w-full mt-1" style="height: 100px; resize: vertical; font-size: 0.8rem;" placeholder="Pixel Recorderなどからの共有テキストがここに入ります">${partyState.summary.rawText}</textarea>
      </div>

      <button id="btn-generate-summary" class="btn btn-primary w-full p-2 mb-4" ${!partyState.summary.rawText ? 'disabled' : ''}>
        ✨ Geminiで要約を生成
      </button>

      <div class="mb-3">
        <label class="text-secondary" style="font-size: 0.8rem;">要約結果 (手動編集可)</label>
        <textarea id="summary-result-edit" class="input w-full mt-1" style="min-height: 150px; background: rgba(0,0,0,0.3); font-size: 0.9rem;">${partyState.summary.result || ''}</textarea>
      </div>
    </div>
  `;
}

// --- Event Listeners ---
function attachEventListeners() {
  // Navigation
  document.getElementById('btn-new-party')?.addEventListener('click', () => {
    const roles = {};
    FIXED_MEMBERS.forEach(m => roles[m.id] = 1.0);
    partyState = {
      id: Date.now(),
      areaName: '',
      storeName: '',
      startTime: new Date().toISOString(),
      members: FIXED_MEMBERS.map(m => ({
        ...m,
        drinks: { beer: 0, highball: 0, sour: 0, other: 0 },
        totalDrinks: 0
      })),
      split: { totalAmount: 0, roles: roles },
      summary: { rawText: '', result: '' }
    };
    currentView = 'party';
    activeTab = 'members';
    render();
  });

  document.getElementById('btn-view-stats')?.addEventListener('click', () => {
    currentView = 'stats';
    statsDate = new Date();
    render();
  });

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    currentView = 'home';
    render();
  });

  document.getElementById('btn-cancel-party')?.addEventListener('click', () => {
    currentView = 'stats';
    render();
  });

  // Edit Party Navigation
  document.querySelectorAll('.btn-edit-party').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
      const id = parseInt(e.currentTarget.dataset.id);
      const target = history.find(p => p.id === id);
      if (target) {
        partyState = {
          id: target.id,
          areaName: target.areaName || '',
          storeName: target.storeName || '',
          startTime: target.startTime,
          endTime: target.endTime,
          members: target.members,
          split: { 
            totalAmount: target.totalAmount, 
            roles: target.splitRoles || {} 
          },
          summary: { rawText: target.summaryRaw || '', result: target.summaryText || '' }
        };
        // Default roles if missing
        if (Object.keys(partyState.split.roles).length === 0) {
          partyState.members.forEach(m => partyState.split.roles[m.id] = 1.0);
        }
        currentView = 'party';
        activeTab = 'summary'; // Usually editing summary, so open there
        render();
      }
    });
  });

  // Share Choice Navigation
  document.getElementById('btn-share-new')?.addEventListener('click', () => {
    const roles = {};
    FIXED_MEMBERS.forEach(m => roles[m.id] = 1.0);
    const sharedText = partyState.summary.rawText;
    partyState = {
      id: Date.now(),
      areaName: '',
      storeName: '',
      startTime: new Date().toISOString(),
      members: FIXED_MEMBERS.map(m => ({ ...m, drinks: { beer: 0, highball: 0, sour: 0, other: 0 }, totalDrinks: 0 })),
      split: { totalAmount: 0, roles: roles },
      summary: { rawText: sharedText, result: '' }
    };
    currentView = 'party';
    activeTab = 'summary';
    render();
  });

  document.querySelectorAll('.btn-share-attach').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
      const id = parseInt(e.currentTarget.dataset.id);
      const target = history.find(p => p.id === id);
      const sharedText = partyState.summary.rawText;
      if (target) {
        partyState = {
          id: target.id,
          areaName: target.areaName || '',
          storeName: target.storeName || '',
          startTime: target.startTime,
          endTime: target.endTime,
          members: target.members,
          split: { totalAmount: target.totalAmount, roles: target.splitRoles || {} },
          summary: { rawText: sharedText, result: target.summaryText || '' }
        };
        if (Object.keys(partyState.split.roles).length === 0) {
          partyState.members.forEach(m => partyState.split.roles[m.id] = 1.0);
        }
        currentView = 'party';
        activeTab = 'summary';
        render();
      }
    });
  });

  // Stats Navigation
  document.querySelectorAll('.btn-stats-tab').forEach(btn => {
    btn.addEventListener('click', (e) => {
      activeStatsTab = e.currentTarget.dataset.tab;
      render();
    });
  });

  document.getElementById('btn-prev-day')?.addEventListener('click', () => { statsDate.setDate(statsDate.getDate() - 1); render(); });
  document.getElementById('btn-next-day')?.addEventListener('click', () => { statsDate.setDate(statsDate.getDate() + 1); render(); });
  document.getElementById('btn-prev-month')?.addEventListener('click', () => { statsDate.setMonth(statsDate.getMonth() - 1); render(); });
  document.getElementById('btn-next-month')?.addEventListener('click', () => { statsDate.setMonth(statsDate.getMonth() + 1); render(); });
  document.getElementById('btn-prev-year')?.addEventListener('click', () => { statsDate.setFullYear(statsDate.getFullYear() - 1); render(); });
  document.getElementById('btn-next-year')?.addEventListener('click', () => { statsDate.setFullYear(statsDate.getFullYear() + 1); render(); });

  // End / Save party
  document.getElementById('btn-end-party')?.addEventListener('click', () => {
    const history = JSON.parse(localStorage.getItem('drunk_history') || '[]');
    const isEditing = history.some(p => p.id === partyState.id);
    const msg = isEditing ? '変更内容を保存しますか？' : '飲み会を終了して履歴に保存しますか？';
    
    if(confirm(msg)) {
      const result = calculateSplit();
      const savedParty = {
        id: partyState.id,
        startTime: partyState.startTime,
        endTime: partyState.endTime || new Date().toISOString(),
        areaName: partyState.areaName.trim(),
        storeName: partyState.storeName.trim(),
        members: partyState.members,
        totalAmount: partyState.split.totalAmount,
        splitRoles: partyState.split.roles,
        memberAmounts: result.memberAmounts,
        summaryRaw: partyState.summary.rawText,
        summaryText: partyState.summary.result
      };
      
      const index = history.findIndex(p => p.id === partyState.id);
      if (index !== -1) {
        history[index] = savedParty; // Overwrite
      } else {
        history.push(savedParty); // New
      }
      localStorage.setItem('drunk_history', JSON.stringify(history));
      
      currentView = isEditing ? 'stats' : 'home';
      render();
    }
  });

  // Inputs
  const storeInput = document.getElementById('store-name-input');
  if (storeInput) storeInput.addEventListener('change', (e) => partyState.storeName = e.target.value);
  const areaInput = document.getElementById('area-name-input');
  if (areaInput) areaInput.addEventListener('change', (e) => partyState.areaName = e.target.value);

  const amountInput = document.getElementById('total-amount-input');
  if (amountInput) {
    amountInput.addEventListener('input', (e) => partyState.split.totalAmount = parseInt(e.target.value) || 0);
    amountInput.addEventListener('change', (e) => {
      partyState.split.totalAmount = parseInt(e.target.value) || 0;
      render();
    });
  }

  document.querySelectorAll('.btn-role').forEach(btn => {
    btn.addEventListener('click', (e) => {
      partyState.split.roles[e.currentTarget.dataset.mid] = parseFloat(e.currentTarget.dataset.role);
      render();
    });
  });

  // Summary
  const apiKeyInput = document.getElementById('gemini-api-key');
  if (apiKeyInput) apiKeyInput.addEventListener('change', (e) => localStorage.setItem('gemini_api_key', e.target.value.trim()));

  const rawInput = document.getElementById('raw-transcript-input');
  if (rawInput) {
    rawInput.addEventListener('input', (e) => {
      partyState.summary.rawText = e.target.value;
      const btn = document.getElementById('btn-generate-summary');
      if(btn) btn.disabled = !e.target.value.trim();
    });
  }
  
  const editResultInput = document.getElementById('summary-result-edit');
  if (editResultInput) {
    editResultInput.addEventListener('input', (e) => {
      partyState.summary.result = e.target.value;
    });
  }

  const generateBtn = document.getElementById('btn-generate-summary');
  if (generateBtn) {
    generateBtn.addEventListener('click', async () => {
      const apiKey = localStorage.getItem('gemini_api_key');
      if (!apiKey) return alert('Gemini APIキーを設定してください。');
      
      generateBtn.innerHTML = '⏳ 要約中...';
      generateBtn.disabled = true;
      
      try {
        const prompt = "以下の文章は飲み会中の録音の文字起こしです。テキストが多少乱れていても推測して、どのような話題で盛り上がったか、面白いエピソード、重要な決定事項などをわかりやすく3〜4個の箇条書きで要約してください。\n\n" + partyState.summary.rawText;
        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        if(!response.ok) throw new Error('API Error');
        const data = await response.json();
        partyState.summary.result = data.candidates[0].content.parts[0].text;
        render(); // Rerender to show in correct box
      } catch (err) {
        alert('要約に失敗しました。APIキーが正しいか確認してください。');
        generateBtn.innerHTML = '✨ Geminiで要約を生成';
        generateBtn.disabled = false;
      }
    });
  }

  // Bottom Nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      activeTab = e.currentTarget.dataset.tab;
      render();
    });
  });

  // Drink Counters
  document.querySelectorAll('.btn-drink').forEach(btn => {
    let pressTimer;
    let isLongPress = false;
    let isScrolling = false;
    
    // Mouse
    btn.addEventListener('mousedown', (e) => {
      const mid = e.currentTarget.dataset.mid;
      const type = e.currentTarget.dataset.type;
      isLongPress = false;
      isScrolling = false;
      pressTimer = window.setTimeout(() => {
        decrementDrink(mid, type);
        isLongPress = true;
      }, 500);
    });
    
    btn.addEventListener('mouseup', (e) => {
      const mid = e.currentTarget.dataset.mid;
      const type = e.currentTarget.dataset.type;
      if (pressTimer) clearTimeout(pressTimer);
      if (!isLongPress && !isScrolling) incrementDrink(mid, type);
    });

    btn.addEventListener('mouseleave', () => { 
      if (pressTimer) clearTimeout(pressTimer); 
      isScrolling = true; 
    });

    // Touch
    btn.addEventListener('touchstart', (e) => {
      const mid = e.currentTarget.dataset.mid;
      const type = e.currentTarget.dataset.type;
      isLongPress = false;
      isScrolling = false;
      pressTimer = window.setTimeout(() => {
        if(!isScrolling) {
          decrementDrink(mid, type);
          isLongPress = true;
          if(navigator.vibrate) navigator.vibrate(50);
        }
      }, 500);
    }, {passive: true});

    btn.addEventListener('touchmove', () => {
      isScrolling = true;
      if (pressTimer) clearTimeout(pressTimer);
    }, {passive: true});

    btn.addEventListener('touchend', (e) => {
      const mid = e.currentTarget.dataset.mid;
      const type = e.currentTarget.dataset.type;
      if (pressTimer) clearTimeout(pressTimer);
      if (!isLongPress && !isScrolling) {
        if (e.cancelable) e.preventDefault(); 
        incrementDrink(mid, type);
      }
    });
  });
}

// --- Logic ---
function incrementDrink(mId, type) {
  const m = partyState.members.find(x => x.id === mId);
  if (m) { m.drinks[type]++; m.totalDrinks++; render(); }
}

function decrementDrink(mId, type) {
  const m = partyState.members.find(x => x.id === mId);
  if (m && m.drinks[type] > 0) { m.drinks[type]--; m.totalDrinks--; render(); }
}

render();
