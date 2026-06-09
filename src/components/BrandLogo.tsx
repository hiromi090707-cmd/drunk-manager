interface Props {
  size?: 'lg' | 'md';        // lg=ホーム/ログイン, md=グループ設定
  lantern?: boolean;         // 上に提灯を出す
  subtitle?: string;         // リボンの文言（省略時は出さない）
}

export function BrandLogo({ size = 'lg', lantern = false, subtitle }: Props) {
  // 端末幅に追従（iPhone SE/mini の狭幅でもはみ出さない）
  const fontSize = size === 'lg' ? 'clamp(2.8rem, 15vw, 4.6rem)' : 'clamp(2rem, 11vw, 2.6rem)';
  return (
    <div className="text-center">
      {lantern && <div className="lantern" />}
      <div className="logo-3d" style={{ fontSize }}>Drunk</div>
      {subtitle && <div style={{ marginTop: '1.1rem' }}><span className="logo-sub">{subtitle}</span></div>}
    </div>
  );
}
