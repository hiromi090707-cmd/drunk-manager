import type { PartyState, SplitResult } from '../../types';
import { SPLIT_ROLES } from '../../constants';
import { formatYen } from '../../lib/format';

interface Props {
  partyState: PartyState;
  onUpdate: (updated: PartyState) => void;
}

export function calculateSplit(partyState: PartyState): SplitResult {
  const totalAmount = partyState.split.totalAmount;
  let totalShares = 0;
  partyState.members.forEach((m) => (totalShares += partyState.split.roles[m.id] ?? 1.0));
  if (totalShares === 0 || totalAmount === 0) {
    const zeros: Record<string, number> = {};
    partyState.members.forEach((m) => (zeros[m.id] = 0));
    return { memberAmounts: zeros, collectedTotal: 0, excess: 0 };
  }
  const baseUnit = totalAmount / totalShares;
  let collectedTotal = 0;
  const memberAmounts: Record<string, number> = {};
  partyState.members.forEach((m) => {
    const rounded = Math.ceil((baseUnit * (partyState.split.roles[m.id] ?? 1.0)) / 100) * 100;
    memberAmounts[m.id] = rounded;
    collectedTotal += rounded;
  });
  return { memberAmounts, collectedTotal, excess: collectedTotal - totalAmount };
}

export function SplitTab({ partyState, onUpdate }: Props) {
  const result = calculateSplit(partyState);

  function setRole(mId: string, role: number) {
    onUpdate({ ...partyState, split: { ...partyState.split, roles: { ...partyState.split.roles, [mId]: role } } });
  }

  function setAmount(val: number) {
    onUpdate({ ...partyState, split: { ...partyState.split, totalAmount: val } });
  }

  return (
    <div style={{ paddingBottom: '1rem' }}>
      <div className="glass p-4 mb-4">
        <h2 className="text-center mb-3" style={{ fontSize: '1.1rem' }}>お会計金額</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>¥</span>
          <input
            type="number"
            className="input-field"
            style={{ fontSize: '2rem', fontWeight: 700, width: 150, textAlign: 'center', color: 'var(--accent-color)' }}
            placeholder="0"
            value={partyState.split.totalAmount || ''}
            onChange={(e) => setAmount(parseInt(e.target.value) || 0)}
          />
        </div>
      </div>

      {partyState.split.totalAmount > 0 && (
        <div className="glass p-4 mb-4" style={{ background: 'var(--bg-surface)' }}>
          <h2 className="text-center mb-3" style={{ fontSize: '1.1rem' }}>お支払い額（100円単位切上）</h2>
          <div className="flex flex-col gap-2">
            {partyState.members.map((m) => {
              const amount = result.memberAmounts[m.id] ?? 0;
              const role = partyState.split.roles[m.id] ?? 1.0;
              const roleDef = SPLIT_ROLES.find((r) => r.id === role) ?? SPLIT_ROLES[1];
              return (
                <div key={m.id} className="flex justify-between items-center" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.5rem' }}>
                  <div className="flex flex-col">
                    <span style={{ fontWeight: 600 }}>{m.name}</span>
                    <span style={{ fontSize: '0.7rem', color: roleDef.color }}>{roleDef.label}（計{m.totalDrinks}杯）</span>
                  </div>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, color: amount > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                    {formatYen(amount)}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-4" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <span>集金合計: {formatYen(result.collectedTotal)}</span>
            <span>余り: {formatYen(result.excess)}</span>
          </div>
        </div>
      )}

      <h2 className="mb-3 mt-4" style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>傾斜配分（支払い割合）</h2>
      <div className="flex flex-col gap-3">
        {partyState.members.map((m) => (
          <div key={m.id} className="glass p-3 flex justify-between items-center">
            <span style={{ fontWeight: 600 }}>{m.name}</span>
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--bg-surface)', borderRadius: 8, padding: '0.2rem' }}>
              {SPLIT_ROLES.map((role) => {
                const isActive = (partyState.split.roles[m.id] ?? 1.0) === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => setRole(m.id, role.id)}
                    style={{
                      padding: '0.4rem 0.6rem', borderRadius: 6, border: 'none',
                      background: isActive ? role.color : 'transparent',
                      color: isActive ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {role.label}
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
