export const CLASSIFICATION_META = {
  correct: { label: 'Correct', shortLabel: '✓ Correct', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', activeBg: 'bg-emerald-600', activeText: 'text-white', ring: 'ring-emerald-300' },
  fp:      { label: 'False Positive', shortLabel: 'FP', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', activeBg: 'bg-red-600', activeText: 'text-white', ring: 'ring-red-300' },
  fn:      { label: 'False Negative', shortLabel: 'FN', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', activeBg: 'bg-amber-600', activeText: 'text-white', ring: 'ring-amber-300' },
}

export default function ClassificationBadge({ classification }) {
  const m = CLASSIFICATION_META[classification]
  if (!m) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  )
}
