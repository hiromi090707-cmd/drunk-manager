import { useRef, useState } from 'react';
import type { Member, PartyState } from '../../types';
import { DRINK_TYPES } from '../../constants';
import { emptyDrinks } from '../../lib/party';
import { megaTotal } from '../../lib/alcohol';
import { updatePartyMemberDrinks } from '../../lib/db';

interface Props {
  partyState: PartyState;
  onUpdate: (updated: PartyState) => void;
}

export function MembersTab({ partyState, onUpdate }: Props) {
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [megaMode, setMegaMode] = useState(false);

  function updateDrink(mId: string, type: string, delta: 1 | -1, target: 'regular' | 'mega') {
    const members = partyState.members.map((m): Member => {
      if (m.id !== mId) return m;
      if (target === 'mega') {
        const current = m.megaDrinks ?? emptyDrinks();
        const count = Math.max(0, (current[type as keyof Member['drinks']] || 0) + delta);
        return { ...m, megaDrinks: { ...current, [type]: count } };
      }
      const count = Math.max(0, (m.drinks[type as keyof Member['drinks']] || 0) + delta);
      const prev = m.drinks[type as keyof Member['drinks']] || 0;
      const diff = count - prev;
      return { ...m, drinks: { ...m.drinks, [type]: count }, totalDrinks: m.totalDrinks + diff };
    });
    const updated = { ...partyState, members };
    onUpdate(updated);
    if (partyState.id) updatePartyMemberDrinks(partyState.id, members).catch(console.error);
  }

  function handlePressStart(mId: string, type: string) {
    const target = megaMode ? 'mega' : 'regular'; // 押し始め時点のモードで確定（長押し中のトグル切替に影響されない）
    pressTimerRef.current = setTimeout(() => {
      updateDrink(mId, type, -1, target);
      if (navigator.vibrate) navigator.vibrate(50);
      pressTimerRef.current = null;
    }, 500);
  }

  function handlePressEnd(mId: string, type: string) {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
      updateDrink(mId, type, 1, megaMode ? 'mega' : 'regular');
    }
  }

  function handlePressCancel() {
    if (pressTimerRef.current !== null) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  return (
    <div style={{ paddingBottom: '1rem' }}>
      <div className="flex justify-between items-center mb-4">
        <p className="text-muted" style={{ fontSize: '0.8rem', margin: 0 }}>
          タップ＋１ / 長押し－１
        </p>
        <button
          onClick={() => setMegaMode((v) => !v)}
          className="btn btn-sm"
          style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            color: megaMode ? '#fff' : 'var(--text-secondary)',
            background: megaMode ? 'var(--danger-color)' : 'transparent',
            border: `1px solid ${megaMode ? 'var(--danger-color)' : 'var(--border-color)'}`,
          }}
        >
          メガ入力 {megaMode ? 'ON' : 'OFF'}
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {partyState.members.map((member) => (
          <div key={member.id} className="glass p-3">
            <div className="flex justify-between items-center mb-3" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{member.name}</span>
              <span className="text-accent" style={{ fontWeight: 700 }}>
                計 {member.totalDrinks} 杯{megaTotal(member) > 0 ? ` / メガ ${megaTotal(member)}` : ''}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
              {DRINK_TYPES.map((drink) => {
                const count = megaMode ? (member.megaDrinks?.[drink.id] || 0) : (member.drinks[drink.id] || 0);
                return (
                  <button
                    key={drink.id}
                    className="btn"
                    style={{
                      padding: '0.5rem',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      background: count > 0 ? 'var(--bg-surface)' : 'transparent',
                      borderColor: megaMode ? 'var(--danger-color)' : (count > 0 ? 'var(--accent-color)' : 'var(--border-color)'),
                    }}
                    onMouseDown={() => handlePressStart(member.id, drink.id)}
                    onMouseUp={() => handlePressEnd(member.id, drink.id)}
                    onMouseLeave={handlePressCancel}
                    onTouchStart={(e) => { e.preventDefault(); handlePressStart(member.id, drink.id); }}
                    onTouchEnd={(e) => { e.preventDefault(); handlePressEnd(member.id, drink.id); }}
                    onTouchMove={handlePressCancel}
                  >
                    <span style={{ fontSize: '1.5rem', pointerEvents: 'none' }}>{drink.emoji}</span>
                    <span className="text-muted" style={{ fontSize: '0.65rem', pointerEvents: 'none', lineHeight: 1 }}>{drink.name}</span>
                    <span style={{ fontWeight: 700, color: count > 0 ? 'var(--text-primary)' : 'var(--text-secondary)', pointerEvents: 'none', fontSize: '1.1rem' }}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
