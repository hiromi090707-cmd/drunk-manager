import { useState } from 'react';

const SLIDES = [
  { emoji: '🍺', title: 'ようこそ Drunk へ', body: '友人みんなで飲み会のドリンクを記録・割り勘・要約できるアプリです。' },
  { emoji: '👆', title: 'タップで記録', body: 'メンバーの飲み物をタップで＋1、長押しで－1。「メガ入力」でメガジョッキも数えられます。' },
  { emoji: '⚡', title: 'みんなで同時に', body: '誰かが飲み会を始めると全員が同じ記録をリアルタイムに編集できます。各自が自分の杯数をその場で入力できます。' },
  { emoji: '💰', title: '割り勘と要約', body: '傾斜配分の割り勘、AIによる飲み会の要約、過去の集計もまとめて確認できます。' },
];

export function OnboardingOverlay({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const isLast = page === SLIDES.length - 1;
  const slide = SLIDES[page];

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(18, 12, 8, 0.92)', backdropFilter: 'blur(4px)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '2rem', textAlign: 'center',
      }}
    >
      <div className="glass p-4" style={{ maxWidth: 360, width: '100%' }}>
        <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>{slide.emoji}</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', marginBottom: '0.75rem', color: 'var(--accent-color)' }}>
          {slide.title}
        </h2>
        <p className="text-muted" style={{ fontSize: '0.95rem', lineHeight: 1.7, minHeight: '5.5rem' }}>
          {slide.body}
        </p>

        <div className="flex justify-center" style={{ gap: '0.4rem', margin: '1rem 0' }}>
          {SLIDES.map((_, i) => (
            <span key={i} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: i === page ? 'var(--accent-color)' : 'var(--border-color)',
            }} />
          ))}
        </div>

        <button
          onClick={() => (isLast ? onClose() : setPage((p) => p + 1))}
          className="btn btn-primary w-full p-3"
          style={{ fontSize: '1.05rem', fontWeight: 700 }}
        >
          {isLast ? 'はじめる' : '次へ'}
        </button>
        {!isLast && (
          <button onClick={onClose} className="btn btn-sm btn-ghost text-muted w-full" style={{ marginTop: '0.5rem' }}>
            スキップ
          </button>
        )}
      </div>
    </div>
  );
}
