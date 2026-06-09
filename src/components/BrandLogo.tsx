interface Props {
  size?: 'lg' | 'md';        // lg=ホーム/ログイン, md=グループ設定
  lantern?: boolean;         // 上に提灯を出す
  subtitle?: string;         // リボンの文言（省略時は出さない）
}

export function BrandLogo({ size = 'lg', lantern = false, subtitle }: Props) {
  const fontSize = size === 'lg' ? '4.6rem' : '2.6rem';
  return (
    <div className="text-center">
      {lantern && <div className="lantern" />}
      <div className="logo-3d" style={{ fontSize }}>Drunk</div>
      {subtitle && <div style={{ marginTop: '0.6rem' }}><span className="logo-sub">{subtitle}</span></div>}
    </div>
  );
}
