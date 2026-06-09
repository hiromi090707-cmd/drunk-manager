interface Props {
  size?: 'lg' | 'md';        // lg=ホーム/ログイン, md=グループ設定
  lantern?: boolean;         // 上に提灯を出す
  subtitle?: string;         // リボンの文言（省略時は出さない）
}

export function BrandLogo({ size = 'lg', lantern = false, subtitle }: Props) {
  // 端末幅に追従（狭幅でもはみ出さず、広幅でも大きくなりすぎない上限）
  const fontSize = size === 'lg' ? 'clamp(2.6rem, 13vw, 3.9rem)' : 'clamp(2rem, 10vw, 2.5rem)';
  // 中央寄せと縦の間隔は @layer の margin に依存せずインラインの flex で確実に効かせる
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {lantern && <div className="lantern" style={{ margin: '0 0 0.4rem' }} />}
      <div className="logo-3d" style={{ fontSize }}>Drunk</div>
      {subtitle && <div style={{ marginTop: '1.25rem' }}><span className="logo-sub">{subtitle}</span></div>}
    </div>
  );
}
