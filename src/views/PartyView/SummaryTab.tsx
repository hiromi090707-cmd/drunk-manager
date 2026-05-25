import { useState, useEffect } from 'react';
import type { PartyState } from '../../types';
import { saveClaudeApiKey } from '../../lib/db';
import { summarizePartyConversation } from '../../lib/claude';
import { CLAUDE_MODEL } from '../../constants';
import { useApp } from '../../context/AppContext';

interface Props {
  partyState: PartyState;
  onUpdate: (updated: PartyState) => void;
}

export function SummaryTab({ partyState, onUpdate }: Props) {
  const { state, dispatch } = useApp();
  const storedKey = state.groupInfo?.claudeApiKey || state.groupInfo?.geminiApiKey || '';
  const [apiKey, setApiKey] = useState(storedKey);
  const [loading, setLoading] = useState(false);

  // groupInfoが後から読み込まれた場合に追従する（ユーザーが編集中でなければ）
  useEffect(() => {
    if (storedKey && !apiKey) setApiKey(storedKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storedKey]);

  async function persistApiKey() {
    const trimmed = apiKey.trim();
    if (trimmed === storedKey) return;
    try {
      await saveClaudeApiKey(trimmed);
      if (state.groupInfo) {
        dispatch({ type: 'SET_GROUP', group: { ...state.groupInfo, claudeApiKey: trimmed } });
      }
    } catch (err) {
      console.error('APIキーの保存に失敗:', err);
      alert('APIキーの保存に失敗しました。ネットワーク接続を確認してください。');
    }
  }

  async function handleGenerate() {
    const key = apiKey.trim();
    if (!key) return alert('Anthropic APIキーを設定してください。');
    if (!key.startsWith('sk-ant-')) {
      return alert('APIキーの形式が正しくありません。sk-ant-で始まるキーを入力してください。');
    }
    if (!partyState.summary.rawText.trim()) {
      return alert('文字起こしテキストを入力してください。');
    }
    setLoading(true);
    try {
      const result = await summarizePartyConversation(partyState.summary.rawText, key);
      onUpdate({ ...partyState, summary: { ...partyState.summary, result } });
    } catch (err) {
      console.error('要約に失敗:', err);
      const msg = err instanceof Error ? err.message : '';
      if (/401|invalid.*api.*key|authentication/i.test(msg)) {
        alert('APIキーが無効です。Anthropic APIキーを確認してください。');
      } else if (/429|rate.*limit/i.test(msg)) {
        alert('APIのレート制限に達しました。しばらく待ってから再試行してください。');
      } else if (/network|fetch|cors/i.test(msg)) {
        alert('ネットワークエラーです。接続を確認してください。');
      } else {
        alert(`要約に失敗しました。${msg ? `\n${msg}` : ''}`);
      }
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
          onChange={(e) => setApiKey(e.target.value)}
          onBlur={persistApiKey}
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
