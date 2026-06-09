export function LoadingView() {
  return (
    <div className="view" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="lantern" />
      <p className="text-muted" style={{ marginTop: '1rem', fontFamily: 'var(--font-pop)', letterSpacing: '0.1em' }}>読み込み中…</p>
    </div>
  );
}
