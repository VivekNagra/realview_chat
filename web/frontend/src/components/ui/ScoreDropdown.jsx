export default function ScoreDropdown({ label, labels, pipelineScore, humanScore, onChange, readOnly }) {
  const effective = humanScore ?? pipelineScore ?? null
  const corrected = humanScore != null && humanScore !== pipelineScore

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select
        disabled={readOnly}
        value={effective ?? ''}
        onChange={(e) => {
          const val = Number(e.target.value)
          if (val >= 1 && val <= 5) onChange(val)
        }}
        className={`w-full text-xs rounded-lg px-2 py-1.5 border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 ${
          corrected
            ? 'border-amber-400 bg-amber-50 text-amber-800 focus:ring-amber-300'
            : 'border-slate-200 bg-white text-slate-700 focus:ring-indigo-300'
        } ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {effective == null && <option value="">—</option>}
        {[1, 2, 3, 4, 5].map((v) => (
          <option key={v} value={v}>
            {v} – {labels[v]}
          </option>
        ))}
      </select>
      {corrected && (
        <span className="text-[10px] text-amber-600 font-medium">
          Corrected (AI: {pipelineScore ?? '—'})
        </span>
      )}
    </div>
  )
}
