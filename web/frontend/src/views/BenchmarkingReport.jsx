import { useState, useMemo } from 'react'
import { resetBenchmarking } from '../services/api'

function computeStats(allFeedback) {
  const latest = new Map()
  for (const e of allFeedback) {
    if (e.classification) {
      latest.set(`${e.property_id}::${e.filename}`, e.classification)
    }
  }
  let correct = 0, fp = 0, fn = 0
  for (const cls of latest.values()) {
    if (cls === 'correct') correct++
    else if (cls === 'fp') fp++
    else if (cls === 'fn') fn++
  }
  const precision = (correct + fp) > 0 ? (correct / (correct + fp)) * 100 : 0
  const recall = (correct + fn) > 0 ? (correct / (correct + fn)) * 100 : 0
  return { correct, fp, fn, total: correct + fp + fn, precision, recall }
}

function rateColor(pct) {
  if (pct >= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-500', card: 'border-emerald-200 bg-emerald-50' }
  if (pct >= 50) return { text: 'text-amber-700', bg: 'bg-amber-500', card: 'border-amber-200 bg-amber-50' }
  return { text: 'text-red-700', bg: 'bg-red-500', card: 'border-red-200 bg-red-50' }
}

export default function BenchmarkingReport({ allFeedback, onReset }) {
  const stats = useMemo(() => computeStats(allFeedback), [allFeedback])
  const precColor = rateColor(stats.precision)
  const recColor = rateColor(stats.recall)
  const [confirming, setConfirming] = useState(false)

  const handleReset = async () => {
    const ok = await resetBenchmarking()
    if (ok) {
      onReset()
      setConfirming(false)
    }
  }

  return (
    <div className="bg-white border-b border-slate-200 px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Benchmarking Report</h3>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
          >
            Reset Benchmarking
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-600 font-medium">Clear all feedback &amp; ground truth?</span>
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Verified Leads</p>
          <p className="text-3xl font-bold text-emerald-800 mt-1">{stats.correct}</p>
          <p className="text-xs text-emerald-600/70 mt-1">{stats.total} I alt</p>
        </div>

        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">False Positives</p>
          <p className="text-3xl font-bold text-red-800 mt-1">{stats.fp}</p>
          <p className="text-xs text-red-600/70 mt-1">AI siger det er et køkken eller bad når det ikke er</p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">False Negatives</p>
          <p className="text-3xl font-bold text-amber-800 mt-1">{stats.fn}</p>
          <p className="text-xs text-amber-600/70 mt-1">AI har overset et køkken eller bad</p>
        </div>

        <div className={`rounded-xl border p-4 ${precColor.card}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${precColor.text}`}>Precision</p>
          <p className={`text-3xl font-bold mt-1 ${precColor.text}`}>{stats.precision.toFixed(1)}%</p>
          <div className="mt-2 h-1.5 rounded-full bg-black/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${precColor.bg} transition-all duration-500`}
              style={{ width: `${Math.min(stats.precision, 100)}%` }}
            />
          </div>
          <p className={`text-xs mt-1 opacity-70 ${precColor.text}`}>Correct / (Correct + FP)</p>
        </div>

        <div className={`rounded-xl border p-4 ${recColor.card}`}>
          <p className={`text-xs font-medium uppercase tracking-wide ${recColor.text}`}>Recall</p>
          <p className={`text-3xl font-bold mt-1 ${recColor.text}`}>{stats.recall.toFixed(1)}%</p>
          <div className="mt-2 h-1.5 rounded-full bg-black/10 overflow-hidden">
            <div
              className={`h-full rounded-full ${recColor.bg} transition-all duration-500`}
              style={{ width: `${Math.min(stats.recall, 100)}%` }}
            />
          </div>
          <p className={`text-xs mt-1 opacity-70 ${recColor.text}`}>Correct / (Correct + FN)</p>
        </div>
      </div>
    </div>
  )
}
