export function LoadingView() {
  return (
    <div className="view" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍺</div>
      <p className="text-muted">読み込み中...</p>
    </div>
  );
}
