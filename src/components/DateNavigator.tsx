interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
}

export function DateNavigator({ label, onPrev, onNext }: Props) {
  return (
    <div className="flex justify-between items-center mb-4 glass p-2">
      <button onClick={onPrev} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>◀</button>
      <span style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{label}</span>
      <button onClick={onNext} className="btn btn-sm" style={{ border: 'none', background: 'transparent' }}>▶</button>
    </div>
  );
}
