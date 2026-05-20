(function(){let e=document.createElement(`link`).relList;if(e&&e.supports&&e.supports(`modulepreload`))return;for(let e of document.querySelectorAll(`link[rel="modulepreload"]`))n(e);new MutationObserver(e=>{for(let t of e)if(t.type===`childList`)for(let e of t.addedNodes)e.tagName===`LINK`&&e.rel===`modulepreload`&&n(e)}).observe(document,{childList:!0,subtree:!0});function t(e){let t={};return e.integrity&&(t.integrity=e.integrity),e.referrerPolicy&&(t.referrerPolicy=e.referrerPolicy),e.crossOrigin===`use-credentials`?t.credentials=`include`:e.crossOrigin===`anonymous`?t.credentials=`omit`:t.credentials=`same-origin`,t}function n(e){if(e.ep)return;e.ep=!0;let n=t(e);fetch(e.href,n)}})();var e=`home`,t=`members`,n=`month`,r=new Date,i=[{id:`hiromi`,name:`ひろみ`},{id:`souga`,name:`そうが`},{id:`takumi`,name:`たくみ`},{id:`takuto`,name:`たくと`},{id:`rui`,name:`るい`}],a={id:null,areaName:``,storeName:``,startTime:null,members:[],split:{totalAmount:0,roles:{}},summary:{rawText:``,result:``}},o=[{id:`beer`,emoji:`🍺`,name:`ビール`},{id:`highball`,emoji:`🥃`,name:`ハイボール`},{id:`sour`,emoji:`🍋`,name:`サワー`},{id:`other`,emoji:`🍷`,name:`その他`}],s=[{id:1.5,label:`多め`,color:`var(--danger-color)`},{id:1,label:`普通`,color:`var(--accent-color)`},{id:.5,label:`少なめ`,color:`var(--success-color)`},{id:0,label:`ゼロ`,color:`var(--text-secondary)`}],c=new URLSearchParams(window.location.search),l=c.get(`text`)||c.get(`title`)||c.get(`url`);l&&(window.history.replaceState({},document.title,window.location.pathname),a.summary.rawText=l,e=`shareChoice`);var u=document.querySelector(`#app`);function d(){e===`home`?u.innerHTML=p():e===`party`?u.innerHTML=x():e===`stats`?u.innerHTML=g():e===`shareChoice`&&(u.innerHTML=f()),E()}function f(){let e=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`).sort((e,t)=>new Date(t.startTime)-new Date(e.startTime)).slice(0,5);return`
    <div class="view" id="view-share-choice">
      <div class="text-center mt-4 mb-4">
        <h2 style="font-size: 1.2rem;">共有されたテキストの追加</h2>
        <p class="text-secondary" style="font-size: 0.8rem;">どこに追加するか選んでください</p>
      </div>

      <div class="glass p-3 mb-4 text-secondary" style="font-size: 0.8rem; max-height: 100px; overflow-y: auto;">
        ${a.summary.rawText}
      </div>

      <button id="btn-share-new" class="btn btn-primary w-full p-3 mb-4 text-lg">
        🍺 新しく飲み会を始める
      </button>

      <h3 class="text-secondary mb-3 mt-4 text-center" style="font-size: 0.9rem;">最近の履歴に紐付ける</h3>
      <div class="flex-column gap-2">
        ${e.length===0?`<p class="text-secondary text-center">履歴がありません</p>`:``}
        ${e.map(e=>{let t=new Date(e.startTime).toLocaleDateString(`ja-JP`,{month:`short`,day:`numeric`});return`
            <button class="btn btn-share-attach text-left" data-id="${e.id}" style="background: rgba(255,255,255,0.05); padding: 1rem; border: 1px solid var(--border-color); border-radius: 8px;">
              <div style="font-weight:bold; font-size: 1rem;">${t} ${e.storeName||e.areaName||`名もなき飲み会`}</div>
              <div class="text-secondary" style="font-size:0.8rem;">¥${e.totalAmount.toLocaleString()}</div>
            </button>
          `}).join(``)}
      </div>
    </div>
  `}function p(){return`
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
        <p class="text-secondary mt-2" style="font-size: 0.8rem;">過去 ${JSON.parse(localStorage.getItem(`drunk_history`)||`[]`).length} 回の記録があります</p>
      </div>
    </div>
  `}function m(e){let t={};return i.forEach(e=>t[e.id]={name:e.name,totalDrinks:0,drinks:{beer:0,highball:0,sour:0,other:0},amount:0}),e.forEach(e=>{e.members.forEach(e=>{t[e.id]&&(t[e.id].totalDrinks+=e.totalDrinks,e.drinks&&(t[e.id].drinks.beer+=e.drinks.beer||0,t[e.id].drinks.highball+=e.drinks.highball||0,t[e.id].drinks.sour+=e.drinks.sour||0,t[e.id].drinks.other+=e.drinks.other||0))}),e.memberAmounts&&Object.keys(e.memberAmounts).forEach(n=>{t[n]&&(t[n].amount+=e.memberAmounts[n])})}),Object.values(t).sort((e,t)=>t.amount-e.amount)}function h(e){return e.every(e=>e.amount===0&&e.totalDrinks===0)?``:`
    <div class="glass p-3 mb-4">
      <h3 class="mb-3 text-secondary text-center" style="font-size:0.9rem;">メンバー別 集計</h3>
      <div class="flex-column gap-3">
        ${e.map((e,t)=>`
          <div class="border-bottom pb-2">
            <div class="flex-between mb-1">
              <div>
                <span style="font-weight:bold;">${t===0?`🥇`:t===1?`🥈`:t===2?`🥉`:` `} ${e.name}</span>
              </div>
              <div style="font-weight:bold; color:var(--accent-color);">¥${e.amount.toLocaleString()}</div>
            </div>
            <div class="flex-between text-secondary" style="font-size:0.8rem; background: rgba(0,0,0,0.2); padding: 0.3rem 0.5rem; border-radius: 4px;">
              <div style="display:flex; gap:0.5rem;">
                ${e.drinks.beer>0?`<span>🍺${e.drinks.beer}</span>`:``}
                ${e.drinks.highball>0?`<span>🥃${e.drinks.highball}</span>`:``}
                ${e.drinks.sour>0?`<span>🍋${e.drinks.sour}</span>`:``}
                ${e.drinks.other>0?`<span>🍷${e.drinks.other}</span>`:``}
              </div>
              <span style="font-weight:bold;">計 ${e.totalDrinks} 杯</span>
            </div>
          </div>
        `).join(``)}
      </div>
    </div>
  `}function g(){return`
    <div class="view" id="view-stats">
      <div class="flex-between mb-4">
        <button id="btn-back-home" class="btn btn-sm">＜ 戻る</button>
        <h2 style="margin: 0; font-size: 1.2rem;">ダッシュボード</h2>
        <div style="width: 50px;"></div>
      </div>

      <div style="display: flex; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 0.2rem; margin-bottom: 1rem;">
        <button class="btn-stats-tab ${n===`day`?`active`:``}" data-tab="day" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${n===`day`?`var(--bg-surface)`:`transparent`}; color: ${n===`day`?`#fff`:`var(--text-secondary)`};">日別</button>
        <button class="btn-stats-tab ${n===`month`?`active`:``}" data-tab="month" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${n===`month`?`var(--bg-surface)`:`transparent`}; color: ${n===`month`?`#fff`:`var(--text-secondary)`};">月別</button>
        <button class="btn-stats-tab ${n===`year`?`active`:``}" data-tab="year" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${n===`year`?`var(--bg-surface)`:`transparent`}; color: ${n===`year`?`#fff`:`var(--text-secondary)`};">年別</button>
        <button class="btn-stats-tab ${n===`all`?`active`:``}" data-tab="all" style="flex:1; border:none; border-radius: 6px; padding: 0.4rem; background: ${n===`all`?`var(--bg-surface)`:`transparent`}; color: ${n===`all`?`#fff`:`var(--text-secondary)`};">全期間</button>
      </div>

      ${n===`day`?_():``}
      ${n===`month`?v():``}
      ${n===`year`?y():``}
      ${n===`all`?b():``}
    </div>
  `}function _(){let e=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),t=r.getFullYear(),n=r.getMonth(),i=r.getDate(),a=e.filter(e=>{let r=new Date(e.startTime);return r.getFullYear()===t&&r.getMonth()===n&&r.getDate()===i}),o=a.reduce((e,t)=>e+t.totalAmount,0),s=m(a);return`
    <div class="flex-between mb-4 glass p-2">
      <button id="btn-prev-day" class="btn btn-sm" style="border:none; background:transparent;">◀</button>
      <span style="font-weight:bold; font-size: 1.1rem;">${t}年 ${n+1}月 ${i}日</span>
      <button id="btn-next-day" class="btn btn-sm" style="border:none; background:transparent;">▶</button>
    </div>

    <div class="text-center mb-4">
      <div class="text-secondary" style="font-size:0.8rem;">この日の利用額</div>
      <div style="font-size:2rem; font-weight:bold; color:var(--accent-color);">¥${o.toLocaleString()}</div>
      <div class="text-secondary mt-1" style="font-size:0.9rem;">開催回数: ${a.length}回</div>
    </div>

    ${h(s)}

    <h3 class="text-secondary mb-2" style="font-size: 0.9rem;">この日の履歴</h3>
    <div class="flex-column gap-3 mb-4">
      ${a.length===0?`<p class="text-center text-secondary" style="font-size:0.9rem;">記録がありません</p>`:``}
      ${a.sort((e,t)=>new Date(t.startTime)-new Date(e.startTime)).map(e=>`
          <div class="glass p-3" style="font-size: 0.9rem;">
            <div class="flex-between mb-1">
              <span style="font-weight:bold;">${new Date(e.startTime).toLocaleTimeString(`ja-JP`,{hour:`2-digit`,minute:`2-digit`})} ~ ${e.storeName||e.areaName||`名もなき飲み会`}</span>
              <span style="color:var(--accent-color); font-weight:bold;">¥${e.totalAmount.toLocaleString()}</span>
            </div>
            ${e.summaryText?`<div class="mt-2 pt-2 border-top" style="font-size: 0.8rem; border-top: 1px dashed var(--border-color); color: var(--text-secondary); white-space: pre-wrap;">${e.summaryText}</div>`:``}
            <button class="btn btn-edit-party btn-sm" data-id="${e.id}" style="margin-top: 0.8rem; width: 100%; border: 1px dashed var(--border-color); background:transparent;">📝 編集</button>
          </div>
        `).join(``)}
    </div>
  `}function v(){let e=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),t=r.getFullYear(),n=r.getMonth(),i=e.filter(e=>{let r=new Date(e.startTime);return r.getFullYear()===t&&r.getMonth()===n}),a=i.reduce((e,t)=>e+t.totalAmount,0),o=m(i),s=new Date(t,n+1,0).getDate(),c=new Date(t,n,1).getDay(),l=[];for(let e=0;e<c;e++)l.push(null);for(let e=1;e<=s;e++)l.push(e);let u=i.map(e=>new Date(e.startTime).getDate());return`
    <div class="flex-between mb-4 glass p-2">
      <button id="btn-prev-month" class="btn btn-sm" style="border:none; background:transparent;">◀</button>
      <span style="font-weight:bold; font-size: 1.1rem;">${t}年 ${n+1}月</span>
      <button id="btn-next-month" class="btn btn-sm" style="border:none; background:transparent;">▶</button>
    </div>

    <div class="flex-between mb-4 px-2">
      <div class="text-center">
        <div class="text-secondary" style="font-size:0.8rem;">開催回数</div>
        <div style="font-size:1.5rem; font-weight:bold;">${i.length}<span style="font-size:1rem;font-weight:normal;">回</span></div>
      </div>
      <div class="text-center">
        <div class="text-secondary" style="font-size:0.8rem;">利用金額</div>
        <div style="font-size:1.5rem; font-weight:bold; color:var(--accent-color);">¥${a.toLocaleString()}</div>
      </div>
    </div>

    ${h(o)}

    <div class="glass p-3 mb-4">
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 2px; text-align: center; margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--text-secondary);">
        <div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div>土</div>
      </div>
      <div style="display:grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center;">
        ${l.map(e=>{if(!e)return`<div style="padding: 0.5rem;"></div>`;let t=u.includes(e);return`
            <div style="
              padding: 0.4rem 0; 
              border-radius: 4px; 
              background: ${t?`var(--accent-color)`:`rgba(255,255,255,0.05)`};
              color: ${t?`#fff`:`inherit`};
              font-weight: ${t?`bold`:`normal`};
              position: relative;
            ">
              ${e}
              ${t?`<div style="position:absolute; bottom: -2px; left: 50%; transform: translateX(-50%); font-size:0.5rem;">🍺</div>`:``}
            </div>
          `}).join(``)}
      </div>
    </div>

    <h3 class="text-secondary mb-2" style="font-size: 0.9rem;">${n+1}月の履歴</h3>
    <div class="flex-column gap-3 mb-4">
      ${i.length===0?`<p class="text-center text-secondary" style="font-size:0.9rem;">記録がありません</p>`:``}
      ${i.sort((e,t)=>new Date(t.startTime)-new Date(e.startTime)).map(e=>`
          <div class="glass p-3" style="font-size: 0.9rem;">
            <div class="flex-between mb-1">
              <span style="font-weight:bold;">${new Date(e.startTime).getDate()}日: ${e.storeName||e.areaName||`名もなき飲み会`}</span>
              <span style="color:var(--accent-color); font-weight:bold;">¥${e.totalAmount.toLocaleString()}</span>
            </div>
            ${e.summaryText?`<div class="mt-2 pt-2 border-top" style="font-size: 0.8rem; border-top: 1px dashed var(--border-color); color: var(--text-secondary); white-space: pre-wrap;">${e.summaryText}</div>`:``}
            <button class="btn btn-edit-party btn-sm" data-id="${e.id}" style="margin-top: 0.8rem; width: 100%; border: 1px dashed var(--border-color); background:transparent;">📝 編集</button>
          </div>
        `).join(``)}
    </div>
  `}function y(){let e=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),t=r.getFullYear(),n=e.filter(e=>new Date(e.startTime).getFullYear()===t),i=n.reduce((e,t)=>e+t.totalAmount,0),a=m(n),o=Array(12).fill(0);n.forEach(e=>{let t=new Date(e.startTime).getMonth();o[t]+=e.totalAmount});let s=Math.max(...o,1);return`
    <div class="flex-between mb-4 glass p-2">
      <button id="btn-prev-year" class="btn btn-sm" style="border:none; background:transparent;">◀</button>
      <span style="font-weight:bold; font-size: 1.1rem;">${t}年</span>
      <button id="btn-next-year" class="btn btn-sm" style="border:none; background:transparent;">▶</button>
    </div>

    <div class="text-center mb-4">
      <div class="text-secondary" style="font-size:0.8rem;">${t}年の総利用額</div>
      <div style="font-size:2rem; font-weight:bold; color:var(--accent-color);">¥${i.toLocaleString()}</div>
      <div class="text-secondary mt-1" style="font-size:0.9rem;">開催回数: ${n.length}回</div>
    </div>

    ${h(a)}

    <div class="glass p-4 mb-4">
      <h3 class="text-center mb-4 text-secondary" style="font-size:0.9rem;">月別利用額</h3>
      <div style="display:flex; align-items:flex-end; justify-content:space-between; height: 150px; padding-bottom: 20px; border-bottom: 1px solid var(--border-color); position:relative;">
        ${o.map((e,t)=>{let n=e/s*100;return`
            <div style="display:flex; flex-direction:column; align-items:center; width: 6%;">
              ${e>0?`<div style="font-size:0.6rem; color:var(--text-secondary); margin-bottom:2px; writing-mode:vertical-rl; text-orientation:mixed; transform:rotate(180deg);">${e/1e3}k</div>`:``}
              <div style="width: 100%; height: ${n}%; background: var(--accent-gradient); border-radius: 4px 4px 0 0; min-height: ${e>0?`4px`:`0`};"></div>
              <div style="position:absolute; bottom: -20px; font-size:0.7rem; color:var(--text-secondary);">${t+1}</div>
            </div>
          `}).join(``)}
      </div>
    </div>
  `}function b(){let e=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),t=e.length,n=e.reduce((e,t)=>e+t.totalAmount,0),r=m(e);return`
    <div class="glass p-4 mb-4 text-center">
      <div class="text-secondary" style="font-size:0.9rem;">累計開催回数</div>
      <div style="font-size:2rem; font-weight:bold; margin-bottom: 1rem;">${t} 回</div>
      
      <div class="text-secondary" style="font-size:0.9rem;">累計利用額</div>
      <div style="font-size:2rem; font-weight:bold; color:var(--accent-color);">¥${n.toLocaleString()}</div>
    </div>

    ${h(r)}
  `}function x(){let e=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),n=[...new Set(e.map(e=>e.areaName).filter(Boolean))],r=[...new Set(e.map(e=>e.storeName).filter(Boolean))],i=e.some(e=>e.id===a.id);return`
    <div class="view" id="view-party" style="padding-bottom: 0;">
      <div class="flex-between mb-2">
        <button id="btn-end-party" class="btn btn-sm" style="${i?`color: var(--accent-color); font-weight: bold;`:``}">${i?`保存`:`終了`}</button>
        <h2 style="margin: 0; font-size: 1.1rem;">${i?`履歴を編集`:`飲み会中`}</h2>
        ${i?`<button id="btn-cancel-party" class="btn btn-sm">戻る</button>`:`<div style="width: 50px;"></div>`}
      </div>
      
      <div class="flex-between mb-4" style="gap: 0.5rem;">
        <input type="text" id="area-name-input" list="area-history" class="input flex-1" style="padding: 0.4rem; text-align: center; font-size: 0.9rem; background: rgba(0,0,0,0.2); border: 1px dashed var(--border-color);" placeholder="エリア (例: 新宿)" value="${a.areaName||``}">
        <input type="text" id="store-name-input" list="store-history" class="input flex-1" style="padding: 0.4rem; text-align: center; font-size: 0.9rem; background: rgba(0,0,0,0.2); border: 1px dashed var(--border-color);" placeholder="店名を入力" value="${a.storeName||``}">
        
        <datalist id="area-history">
          ${n.map(e=>`<option value="${e}">`).join(``)}
          <option value="新宿">
          <option value="武蔵小杉">
          <option value="渋谷">
        </datalist>
        <datalist id="store-history">
          ${r.map(e=>`<option value="${e}">`).join(``)}
        </datalist>
      </div>
      
      <div id="tab-content" style="flex: 1; overflow-y: auto;">
        ${t===`members`?S():``}
        ${t===`split`?C():``}
        ${t===`summary`?T():``}
      </div>
    </div>
    
    <div class="bottom-nav">
      <div class="nav-item ${t===`members`?`active`:``}" data-tab="members">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        メンバー
      </div>
      <div class="nav-item ${t===`split`?`active`:``}" data-tab="split">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        割り勘
      </div>
      <div class="nav-item ${t===`summary`?`active`:``}" data-tab="summary">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        要約
      </div>
    </div>
  `}function S(){return`
    <p class="text-secondary text-center mb-4" style="font-size: 0.8rem;">各ドリンクをタップで＋１ / 長押しで－１</p>
    <div class="flex-column gap-3 pb-4">
      ${a.members.map(e=>`
        <div class="glass p-3">
          <div class="flex-between mb-3 border-bottom pb-2">
            <span style="font-weight: 700; font-size: 1.1rem;">${e.name}</span>
            <span style="color: var(--accent-color); font-weight: 700;">計 ${e.totalDrinks} 杯</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem;">
            ${o.map(t=>`
              <button class="btn btn-drink ${e.drinks[t.id]>0?`active`:``}" data-mid="${e.id}" data-type="${t.id}" style="padding: 0.5rem; flex-direction: column; gap: 0.2rem; background: ${e.drinks[t.id]>0?`var(--bg-surface)`:`transparent`}; border-color: ${e.drinks[t.id]>0?`var(--accent-color)`:`var(--border-color)`};">
                <span style="font-size: 1.5rem; pointer-events: none;">${t.emoji}</span>
                <span style="font-size: 0.65rem; pointer-events: none; color: var(--text-secondary); line-height: 1;">${t.name}</span>
                <span style="font-weight: 700; color: ${e.drinks[t.id]>0?`var(--text-primary)`:`var(--text-secondary)`}; pointer-events: none; font-size: 1.1rem;">${e.drinks[t.id]}</span>
              </button>
            `).join(``)}
          </div>
        </div>
      `).join(``)}
    </div>
  `}function C(){let e=w();return`
    <div class="glass p-4 mb-4">
      <h2 class="text-center mb-3" style="font-size: 1.1rem;">お会計金額</h2>
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
        <span style="font-size: 1.5rem; font-weight: 700;">¥</span>
        <input type="number" id="total-amount-input" class="input" style="font-size: 2rem; font-weight: 700; width: 150px; text-align: center; color: var(--accent-color);" placeholder="0" value="${a.split.totalAmount||``}">
      </div>
    </div>

    ${a.split.totalAmount>0?`
      <div class="glass p-4 mb-4" style="background: var(--bg-surface);">
        <h2 class="text-center mb-3" style="font-size: 1.1rem;">お支払い額（100円単位切上）</h2>
        <div class="flex-column gap-2">
          ${a.members.map(t=>{let n=e.memberAmounts[t.id],r=a.split.roles[t.id],i=s.find(e=>e.id===r);return`
              <div class="flex-between border-bottom pb-2">
                <div class="flex-column">
                  <span style="font-weight: 600;">${t.name}</span>
                  <span style="font-size: 0.7rem; color: ${i.color};">${i.label} (計${t.totalDrinks}杯)</span>
                </div>
                <span style="font-size: 1.25rem; font-weight: 700; color: ${n>0?`var(--text-primary)`:`var(--text-secondary)`};">¥${n.toLocaleString()}</span>
              </div>
            `}).join(``)}
        </div>
        <div class="flex-between mt-4 text-secondary" style="font-size: 0.9rem;">
          <span>集金合計: ¥${e.collectedTotal.toLocaleString()}</span>
          <span>余り: ¥${e.excess.toLocaleString()}</span>
        </div>
      </div>
    `:``}

    <h2 class="text-secondary mb-3 mt-4" style="font-size: 1rem;">傾斜配分（支払い割合）</h2>
    <div class="flex-column gap-3 pb-4">
      ${a.members.map(e=>`
        <div class="glass p-3 flex-between">
          <span style="font-weight: 600;">${e.name}</span>
          <div style="display: flex; gap: 0.25rem; background: var(--bg-surface); border-radius: 8px; padding: 0.2rem;">
            ${s.map(t=>{let n=a.split.roles[e.id]===t.id;return`
                <button class="btn-role" data-mid="${e.id}" data-role="${t.id}" style="
                  padding: 0.4rem 0.6rem; 
                  border-radius: 6px; 
                  border: none; 
                  background: ${n?t.color:`transparent`}; 
                  color: ${n?`#fff`:`var(--text-secondary)`};
                  font-size: 0.8rem;
                  font-weight: 600;
                  cursor: pointer;
                  transition: all 0.2s;
                ">${t.label}</button>
              `}).join(``)}
          </div>
        </div>
      `).join(``)}
    </div>
  `}function w(){let e=a.split.totalAmount,t=0;if(a.members.forEach(e=>t+=a.split.roles[e.id]),t===0||e===0){let e={};return a.members.forEach(t=>e[t.id]=0),{memberAmounts:e,collectedTotal:0,excess:0}}let n=e/t,r=0,i={};return a.members.forEach(e=>{let t=n*a.split.roles[e.id],o=Math.ceil(t/100)*100;i[e.id]=o,r+=o}),{memberAmounts:i,collectedTotal:r,excess:r-e}}function T(){return`
    <div class="glass p-4 mb-4">
      <h2 class="text-center mb-3" style="font-size: 1.1rem;">会話の要約</h2>
      
      <div class="mb-3">
        <label class="text-secondary" style="font-size: 0.8rem;">Gemini APIキー</label>
        <input type="password" id="gemini-api-key" class="input w-full mt-1" style="font-size: 0.8rem; padding: 0.4rem;" placeholder="AIzaSy..." value="${localStorage.getItem(`gemini_api_key`)||``}">
      </div>

      <div class="mb-3">
        <label class="text-secondary" style="font-size: 0.8rem;">文字起こしテキスト (自動入力されます)</label>
        <textarea id="raw-transcript-input" class="input w-full mt-1" style="height: 100px; resize: vertical; font-size: 0.8rem;" placeholder="Pixel Recorderなどからの共有テキストがここに入ります">${a.summary.rawText}</textarea>
      </div>

      <button id="btn-generate-summary" class="btn btn-primary w-full p-2 mb-4" ${a.summary.rawText?``:`disabled`}>
        ✨ Geminiで要約を生成
      </button>

      <div class="mb-3">
        <label class="text-secondary" style="font-size: 0.8rem;">要約結果 (手動編集可)</label>
        <textarea id="summary-result-edit" class="input w-full mt-1" style="min-height: 150px; background: rgba(0,0,0,0.3); font-size: 0.9rem;">${a.summary.result||``}</textarea>
      </div>
    </div>
  `}function E(){document.getElementById(`btn-new-party`)?.addEventListener(`click`,()=>{let n={};i.forEach(e=>n[e.id]=1),a={id:Date.now(),areaName:``,storeName:``,startTime:new Date().toISOString(),members:i.map(e=>({...e,drinks:{beer:0,highball:0,sour:0,other:0},totalDrinks:0})),split:{totalAmount:0,roles:n},summary:{rawText:``,result:``}},e=`party`,t=`members`,d()}),document.getElementById(`btn-view-stats`)?.addEventListener(`click`,()=>{e=`stats`,r=new Date,d()}),document.getElementById(`btn-back-home`)?.addEventListener(`click`,()=>{e=`home`,d()}),document.getElementById(`btn-cancel-party`)?.addEventListener(`click`,()=>{e=`stats`,d()}),document.querySelectorAll(`.btn-edit-party`).forEach(n=>{n.addEventListener(`click`,n=>{let r=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),i=parseInt(n.currentTarget.dataset.id),o=r.find(e=>e.id===i);o&&(a={id:o.id,areaName:o.areaName||``,storeName:o.storeName||``,startTime:o.startTime,endTime:o.endTime,members:o.members,split:{totalAmount:o.totalAmount,roles:o.splitRoles||{}},summary:{rawText:o.summaryRaw||``,result:o.summaryText||``}},Object.keys(a.split.roles).length===0&&a.members.forEach(e=>a.split.roles[e.id]=1),e=`party`,t=`summary`,d())})}),document.getElementById(`btn-share-new`)?.addEventListener(`click`,()=>{let n={};i.forEach(e=>n[e.id]=1);let r=a.summary.rawText;a={id:Date.now(),areaName:``,storeName:``,startTime:new Date().toISOString(),members:i.map(e=>({...e,drinks:{beer:0,highball:0,sour:0,other:0},totalDrinks:0})),split:{totalAmount:0,roles:n},summary:{rawText:r,result:``}},e=`party`,t=`summary`,d()}),document.querySelectorAll(`.btn-share-attach`).forEach(n=>{n.addEventListener(`click`,n=>{let r=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),i=parseInt(n.currentTarget.dataset.id),o=r.find(e=>e.id===i),s=a.summary.rawText;o&&(a={id:o.id,areaName:o.areaName||``,storeName:o.storeName||``,startTime:o.startTime,endTime:o.endTime,members:o.members,split:{totalAmount:o.totalAmount,roles:o.splitRoles||{}},summary:{rawText:s,result:o.summaryText||``}},Object.keys(a.split.roles).length===0&&a.members.forEach(e=>a.split.roles[e.id]=1),e=`party`,t=`summary`,d())})}),document.querySelectorAll(`.btn-stats-tab`).forEach(e=>{e.addEventListener(`click`,e=>{n=e.currentTarget.dataset.tab,d()})}),document.getElementById(`btn-prev-day`)?.addEventListener(`click`,()=>{r.setDate(r.getDate()-1),d()}),document.getElementById(`btn-next-day`)?.addEventListener(`click`,()=>{r.setDate(r.getDate()+1),d()}),document.getElementById(`btn-prev-month`)?.addEventListener(`click`,()=>{r.setMonth(r.getMonth()-1),d()}),document.getElementById(`btn-next-month`)?.addEventListener(`click`,()=>{r.setMonth(r.getMonth()+1),d()}),document.getElementById(`btn-prev-year`)?.addEventListener(`click`,()=>{r.setFullYear(r.getFullYear()-1),d()}),document.getElementById(`btn-next-year`)?.addEventListener(`click`,()=>{r.setFullYear(r.getFullYear()+1),d()}),document.getElementById(`btn-end-party`)?.addEventListener(`click`,()=>{let t=JSON.parse(localStorage.getItem(`drunk_history`)||`[]`),n=t.some(e=>e.id===a.id);if(confirm(n?`変更内容を保存しますか？`:`飲み会を終了して履歴に保存しますか？`)){let r=w(),i={id:a.id,startTime:a.startTime,endTime:a.endTime||new Date().toISOString(),areaName:a.areaName.trim(),storeName:a.storeName.trim(),members:a.members,totalAmount:a.split.totalAmount,splitRoles:a.split.roles,memberAmounts:r.memberAmounts,summaryRaw:a.summary.rawText,summaryText:a.summary.result},o=t.findIndex(e=>e.id===a.id);o===-1?t.push(i):t[o]=i,localStorage.setItem(`drunk_history`,JSON.stringify(t)),e=n?`stats`:`home`,d()}});let o=document.getElementById(`store-name-input`);o&&o.addEventListener(`change`,e=>a.storeName=e.target.value);let s=document.getElementById(`area-name-input`);s&&s.addEventListener(`change`,e=>a.areaName=e.target.value);let c=document.getElementById(`total-amount-input`);c&&(c.addEventListener(`input`,e=>a.split.totalAmount=parseInt(e.target.value)||0),c.addEventListener(`change`,e=>{a.split.totalAmount=parseInt(e.target.value)||0,d()})),document.querySelectorAll(`.btn-role`).forEach(e=>{e.addEventListener(`click`,e=>{a.split.roles[e.currentTarget.dataset.mid]=parseFloat(e.currentTarget.dataset.role),d()})});let l=document.getElementById(`gemini-api-key`);l&&l.addEventListener(`change`,e=>localStorage.setItem(`gemini_api_key`,e.target.value.trim()));let u=document.getElementById(`raw-transcript-input`);u&&u.addEventListener(`input`,e=>{a.summary.rawText=e.target.value;let t=document.getElementById(`btn-generate-summary`);t&&(t.disabled=!e.target.value.trim())});let f=document.getElementById(`summary-result-edit`);f&&f.addEventListener(`input`,e=>{a.summary.result=e.target.value});let p=document.getElementById(`btn-generate-summary`);p&&p.addEventListener(`click`,async()=>{let e=localStorage.getItem(`gemini_api_key`);if(!e)return alert(`Gemini APIキーを設定してください。`);p.innerHTML=`⏳ 要約中...`,p.disabled=!0;try{let t=`以下の文章は飲み会中の録音の文字起こしです。テキストが多少乱れていても推測して、どのような話題で盛り上がったか、面白いエピソード、重要な決定事項などをわかりやすく3〜4個の箇条書きで要約してください。

`+a.summary.rawText,n=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=`+e,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({contents:[{parts:[{text:t}]}]})});if(!n.ok)throw Error(`API Error`);let r=await n.json();a.summary.result=r.candidates[0].content.parts[0].text,d()}catch{alert(`要約に失敗しました。APIキーが正しいか確認してください。`),p.innerHTML=`✨ Geminiで要約を生成`,p.disabled=!1}}),document.querySelectorAll(`.nav-item`).forEach(e=>{e.addEventListener(`click`,e=>{t=e.currentTarget.dataset.tab,d()})}),document.querySelectorAll(`.btn-drink`).forEach(e=>{let t,n=!1,r=!1;e.addEventListener(`mousedown`,e=>{let i=e.currentTarget.dataset.mid,a=e.currentTarget.dataset.type;n=!1,r=!1,t=window.setTimeout(()=>{O(i,a),n=!0},500)}),e.addEventListener(`mouseup`,e=>{let i=e.currentTarget.dataset.mid,a=e.currentTarget.dataset.type;t&&clearTimeout(t),!n&&!r&&D(i,a)}),e.addEventListener(`mouseleave`,()=>{t&&clearTimeout(t),r=!0}),e.addEventListener(`touchstart`,e=>{let i=e.currentTarget.dataset.mid,a=e.currentTarget.dataset.type;n=!1,r=!1,t=window.setTimeout(()=>{r||(O(i,a),n=!0,navigator.vibrate&&navigator.vibrate(50))},500)},{passive:!0}),e.addEventListener(`touchmove`,()=>{r=!0,t&&clearTimeout(t)},{passive:!0}),e.addEventListener(`touchend`,e=>{let i=e.currentTarget.dataset.mid,a=e.currentTarget.dataset.type;t&&clearTimeout(t),!n&&!r&&(e.cancelable&&e.preventDefault(),D(i,a))})})}function D(e,t){let n=a.members.find(t=>t.id===e);n&&(n.drinks[t]++,n.totalDrinks++,d())}function O(e,t){let n=a.members.find(t=>t.id===e);n&&n.drinks[t]>0&&(n.drinks[t]--,n.totalDrinks--,d())}d();