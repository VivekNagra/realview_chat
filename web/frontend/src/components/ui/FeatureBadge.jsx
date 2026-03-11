export default function FeatureBadge({ feature }) {
  const conf = feature.confidence ?? 0
  const pct = (conf * 100).toFixed(0)
  const color =
    conf >= 0.7
      ? 'bg-red-50 text-red-700 border-red-200'
      : conf >= 0.4
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-slate-50 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${color}`}>
      {(feature.feature_id ?? '').replace(/_/g, ' ')}
      <span className="opacity-60">{pct}%</span>
    </span>
  )
}
