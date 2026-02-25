type State = 'RUNNING' | 'STOPPED' | 'STARTING' | 'FATAL' | 'UNKNOWN'

const colors: Record<State, string> = {
  RUNNING:  '#4ade80',
  STARTING: '#facc15',
  STOPPED:  '#6b7280',
  FATAL:    '#f87171',
  UNKNOWN:  '#6b7280',
}

export function StatusBadge({ state }: { state: State }) {
  const color = colors[state] ?? colors.UNKNOWN
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontSize: 12, fontWeight: 600, color,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: state === 'RUNNING' ? `0 0 6px ${color}` : 'none',
      }} />
      {state}
    </span>
  )
}
