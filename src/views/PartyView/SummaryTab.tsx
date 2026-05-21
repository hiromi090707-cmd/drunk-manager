import { useState, useEffect } from 'react';
import type { PartyState } from '../../types';
import { getClaudeApiKey, saveClaudeApiKey } from '../../lib/db';
import { summarizePartyConversation } from '../../lib/claude';
import { CLAUDE_MODEL } from '../../constants';

interface Props {
  partyState: PartyState;
  onUpdate: (updated: PartyState) => void;
}

export function SummaryTab({ partyState, onUpdate }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getClaudeApiKey().then((key) => { if (key) setApiKey(key); });
  }, []);

  async function handleApiKeyChange(key: string) {
    setApiKey(key);
    await saveClaudeApiKey(key).catch(console.error);
  }

  async function handleGenerate() {
    if (!apiKey) return alert('Anthropic APIキーを設定してください。');
    setLoading(true);
    try {
      const result = await summarizePartyConversation(partyState.summary.rawText, apiKey);
      onUpdate({ ...partyState, summary: { ...partyState.summary, result } });
    } catch {
      alert('要約に失敗しました。APIキーが正しいか確認してください。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass p-4 mb-4">
      <h2 className="text-center mb-3" style={{ fontSize: '1.1rem' }}>会話の要約</h2>

      <div className="mb-3">
        <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Anthropic APIキー（グループ共有）
        </label>
        <input
          type="password"
          className="input-field w-full mt-1"
          style={{ fontSize: '0.8rem', padding: '0.4rem' }}
          placeholder="sk-ant-..."
          value={apiKey}
          onChange={(e) => handleApiKeyChange(e.target.value.trim())}
        />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.65rem', marginTop: '0.25rem' }}>
          一人が設定すれば全員使えます（モデル: {CLAUDE_MODEL}）
        </p>
      </div>

      <div className="mb-3">
        <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>文字起こしテキスト</label>
        <textarea
          className="input-field w-full mt-1"
          style={{ height: 100, resize: 'vertical', fontSize: '0.8rem' }}
          placeholder="Pixel Recorderなどからの共有テキストがここに入ります"
          value={partyState.summary.rawText}
          onChange={(e) => onUpdate({ ...partyState, summary: { ...partyState.summary, rawText: e.target.value } })}
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={!partyState.summary.rawText || loading}
        className="btn btn-primary w-full p-2 mb-4"
      >
        {loading ? '⏳ 要約中...' : '✨ Claudeで要約を生成'}
      </button>

      <div className="mb-3">
        <label style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>要約結果 (手動編集可)</label>
        <textarea
          className="input-field w-full mt-1"
          style={{ minHeight: 150, background: 'rgba(0,0,0,0.3)', fontSize: '0.9rem' }}
          value={partyState.summary.result}
          onChange={(e) => onUpdate({ ...partyState, summary: { ...partyState.summary, result: e.target.value } })}
        />
      </div>
    </div>
  );
}
