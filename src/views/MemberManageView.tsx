import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { useRoster } from '../hooks/useRoster';

export function MemberManageView() {
  const { state, dispatch } = useApp();
  const { addMember, removeMember, restoreMember, renameMember } = useRoster();
  const members = state.groupInfo?.members ?? [];
  const active = members.filter((m) => !m.removed);
  const removed = members.filter((m) => m.removed);

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    await addMember(name);
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    setEditingId(null);
    if (name) await renameMember(id, name);
  }

  function startEdit(id: string, name: string) {
    setEditingId(id);
    setEditName(name);
  }

  return (
    <div className="view">
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
        <button onClick={() => dispatch({ type: 'SET_VIEW', view: 'home' })} className="btn btn-sm">戻る</button>
        <h2 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: '1.1rem' }}>メンバー管理</h2>
        <div style={{ width: 52 }} />
      </div>

      <div className="glass p-4 mb-4">
        <div className="flex" style={{ gap: '0.5rem' }}>
          <input
            className="input-field"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="名前を入力して追加"
            value={newName}
            maxLength={20}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <button onClick={handleAdd} className="btn btn-primary">＋追加</button>
        </div>
      </div>

      <div className="sec-divider"><span>メンバー（{active.length}人）</span><div className="sec-line" /></div>
      <div className="flex flex-col gap-2 mb-4">
        {active.length === 0 && (
          <p className="text-muted text-center" style={{ fontSize: '0.85rem' }}>
            メンバーがいません。上の欄から追加してください。
          </p>
        )}
        {active.map((member) => (
          <div key={member.id} className="glass p-3 flex justify-between items-center">
            {editingId === member.id ? (
              <>
                <input
                  className="input-field"
                  style={{ flex: 1, minWidth: 0, marginRight: '0.5rem' }}
                  value={editName}
                  autoFocus
                  maxLength={20}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleRename(member.id); }}
                />
                <button onClick={() => handleRename(member.id)} className="btn btn-sm text-accent" style={{ fontWeight: 'bold' }}>保存</button>
              </>
            ) : (
              <>
                <span style={{ fontWeight: 700 }}>{member.name}</span>
                <div className="flex" style={{ gap: '0.4rem' }}>
                  <button
                    onClick={() => startEdit(member.id, member.name)}
                    className="btn btn-sm btn-ghost text-muted"
                  >
                    改名
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`${member.name} を名簿から外しますか？\n過去の記録は残り、いつでも戻せます。`)) {
                        removeMember(member.id);
                      }
                    }}
                    className="btn btn-sm"
                    style={{ color: 'var(--danger-color)', background: 'transparent', boxShadow: 'none' }}
                  >
                    外す
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {removed.length > 0 && (
        <>
          <div className="sec-divider"><span>以前いたメンバー</span><div className="sec-line" /></div>
          <div className="flex flex-col gap-2">
            {removed.map((member) => (
              <div key={member.id} className="glass p-3 flex justify-between items-center" style={{ opacity: 0.55 }}>
                <span style={{ fontWeight: 700 }}>{member.name}</span>
                <button onClick={() => restoreMember(member.id)} className="btn btn-sm text-accent" style={{ fontWeight: 'bold' }}>戻す</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
