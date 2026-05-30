import type { ReactNode } from 'react';

interface Props {
  label: string;
  value: ReactNode;        // 単位込みで渡す（例: formatYen(x)、<>{n}<span>回</span></>）
  accent?: boolean;        // true で値を accent-color
  caption?: string;        // 任意の補足行
  size?: 'lg' | 'md';      // lg=2rem(既定) / md=1.5rem
}

export function StatMetric({ label, value, accent, caption, size = 'lg' }: Props) {
  return (
    <div className="text-center">
      <div className="text-muted" style={{ fontSize: '0.8rem' }}>{label}</div>
      <div className={accent ? 'text-accent' : undefined} style={{ fontSize: size === 'lg' ? '2rem' : '1.5rem', fontWeight: 'bold' }}>
        {value}
      </div>
      {caption && <div className="text-muted" style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{caption}</div>}
    </div>
  );
}
