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
