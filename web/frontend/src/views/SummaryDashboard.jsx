import { useState, useEffect } from 'react'
import { fetchSummary, fetchStats } from '../services/api'

const GRADE_META = {
  A: { label: 'Ny/eksklusiv', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', ring: 'ring-emerald-200' },
  B: { label: 'Pæn og moderne', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', ring: 'ring-blue-200' },
  C: { label: 'Brugbar/neutral', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', ring: 'ring-amber-200' },
  D: { label: 'Forældet/slidt', bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', ring: 'ring-orange-200' },
  E: { label: 'Renoveringskrævende', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', ring: 'ring-red-200' },
}

function rateColor(pct) {
  if (pct >= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-500', card: 'border-emerald-200 bg-emerald-50' }
  if (pct >= 50) return { text: 'text-amber-700', bg: 'bg-amber-500', card: 'border-amber-200 bg-amber-50' }
  return { text: 'text-red-700', bg: 'bg-red-500', card: 'border-red-200 bg-red-50' }
}

export default function SummaryDashboard({ onNavigateToProperty }) {
  const [summary, setSummary] = useState(null)
  const [calibration, setCalibration] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetchSummary(), fetchStats()])
      .then(([summaryData, statsData]) => {
        setSummary(summaryData)
        setCalibration(statsData?.calibration ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Loading summary…
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        No pipeline data available yet. Run the pipeline on some properties first.
      </div>
    )
  }

  const {
    pipeline_funnel, room_distribution, actionability_rate,
    per_proposal_stats, severity_breakdown, room_damage_profiles,
    confidence_metrics, at_risk_properties, room_grades,
  } = summary
  const noiseReduction =
    pipeline_funnel.total_images > 0
      ? (((pipeline_funnel.total_images - pipeline_funnel.kitchen_or_bathroom) / pipeline_funnel.total_images) * 100)
      : 0
  const severityTotal = (severity_breakdown?.high ?? 0) + (severity_breakdown?.medium ?? 0) + (severity_breakdown?.low ?? 0)

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Summary Dashboard</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Pipeline metrics across {per_proposal_stats.num_proposals} propert{per_proposal_stats.num_proposals === 1 ? 'y' : 'ies'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <span className="w-2 h-2 rounded-full bg-indigo-500" />
            Pipeline Summary
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        <div className="max-w-5xl mx-auto space-y-6">

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
              <p className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Noise Reduction</p>
              <p className="text-sm text-indigo-600/80 mt-1">
                Pass 1 classifies every listing photo by room type and discards non-kitchen/bathroom images so reviewers only see what matters.
              </p>
              <p className="text-3xl font-bold text-indigo-800 mt-2">{noiseReduction.toFixed(1)}%</p>
              <div className="mt-2 h-2 rounded-full bg-indigo-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all duration-700"
                  style={{ width: `${Math.min(noiseReduction, 100)}%` }}
                />
              </div>
              <p className="text-xs text-indigo-600/70 mt-2">
                Filtered {pipeline_funnel.total_images - pipeline_funnel.kitchen_or_bathroom} of {pipeline_funnel.total_images} images as irrelevant — kept {pipeline_funnel.kitchen_or_bathroom} kitchen/bathroom images
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Per Property</p>
              <p className="text-sm text-slate-400 mt-1">
                How many property photos the pipeline processes on average for each proposal.
              </p>
              <p className="text-3xl font-bold text-slate-800 mt-2">{per_proposal_stats.avg_images_per_proposal}</p>
              <p className="text-xs text-slate-400 mt-1">avg images / property</p>
              <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold text-slate-700">{per_proposal_stats.num_proposals}</p>
                  <p className="text-xs text-slate-400">properties</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-slate-700">{per_proposal_stats.total_images}</p>
                  <p className="text-xs text-slate-400">total images</p>
                </div>
              </div>
            </div>
          </div>

          {(room_grades ?? []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Property Category Grades</p>
              <p className="text-sm text-slate-400 mt-1 mb-4">
                Final valuation grade per room based on the 4-dimension scoring model (Condition + Modernity + Material + Functionality).
              </p>
              <div className="space-y-4">
                {room_grades.map((prop) => (
                  <div key={prop.property_id}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-semibold text-slate-700">{prop.property_id}</span>
                      <button
                        type="button"
                        onClick={() => onNavigateToProperty?.(prop.property_id)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        View &rarr;
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {prop.rooms.map((room, idx) => {
                        const gm = GRADE_META[room.grade] ?? GRADE_META.C
                        return (
                          <div key={`${room.room_type}-${idx}`} className={`rounded-xl border-2 p-4 ${gm.border} ${gm.bg}`}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide capitalize">
                                {room.room_type}
                              </span>
                              <span className={`text-3xl font-black ${gm.text}`}>{room.grade}</span>
                            </div>
                            <p className={`text-sm font-semibold ${gm.text}`}>{gm.label}</p>
                            <p className={`text-xs mt-1 opacity-70 ${gm.text}`}>{room.total}/20 points</p>
                            <div className="mt-3 h-2 rounded-full bg-black/10 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  room.grade === 'A' ? 'bg-emerald-500' :
                                  room.grade === 'B' ? 'bg-blue-500' :
                                  room.grade === 'C' ? 'bg-amber-500' :
                                  room.grade === 'D' ? 'bg-orange-500' : 'bg-red-500'
                                }`}
                                style={{ width: `${(room.total / 20) * 100}%` }}
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3 pt-3 border-t border-black/5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Condition</span>
                                <span className="font-semibold text-slate-700">{room.condition}/5</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Modernity</span>
                                <span className="font-semibold text-slate-700">{room.modernity}/5</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Material</span>
                                <span className="font-semibold text-slate-700">{room.material}/5</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Functionality</span>
                                <span className="font-semibold text-slate-700">{room.functionality}/5</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Kitchens</p>
              <p className="text-sm text-blue-600/80 mt-1">
                Images the model identified as kitchen photos — typically the highest-value inspection target.
              </p>
              <p className="text-3xl font-bold text-blue-800 mt-2">{room_distribution.kitchen}</p>
              <p className="text-xs text-blue-600/70 mt-1">
                {pipeline_funnel.kitchen_or_bathroom > 0
                  ? ((room_distribution.kitchen / pipeline_funnel.kitchen_or_bathroom) * 100).toFixed(0)
                  : 0}% of target rooms
              </p>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5">
              <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Bathrooms</p>
              <p className="text-sm text-blue-600/80 mt-1">
                Images classified as bathrooms — checked for water damage, mold, and fixture issues.
              </p>
              <p className="text-3xl font-bold text-blue-800 mt-2">{room_distribution.bathroom}</p>
              <p className="text-xs text-blue-600/70 mt-1">
                {pipeline_funnel.kitchen_or_bathroom > 0
                  ? ((room_distribution.bathroom / pipeline_funnel.kitchen_or_bathroom) * 100).toFixed(0)
                  : 0}% of target rooms
              </p>
            </div>

            {(() => {
              const aColor = rateColor(actionability_rate.rate_percent)
              return (
                <div className={`rounded-xl border p-5 ${aColor.card}`}>
                  <p className={`text-xs font-medium uppercase tracking-wide ${aColor.text}`}>Actionability Rate</p>
                  <p className={`text-sm mt-1 opacity-80 ${aColor.text}`}>
                    Percentage of kitchen/bathroom images flagged as worth inspecting.
                  </p>
                  <p className={`text-3xl font-bold mt-2 ${aColor.text}`}>{actionability_rate.rate_percent}%</p>
                  <div className="mt-2 h-2 rounded-full bg-black/10 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${aColor.bg} transition-all duration-700`}
                      style={{ width: `${Math.min(actionability_rate.rate_percent, 100)}%` }}
                    />
                  </div>
                  <p className={`text-xs mt-1 opacity-70 ${aColor.text}`}>
                    {actionability_rate.actionable_kb_images} of {actionability_rate.total_kb_images} kitchen/bathroom images
                  </p>
                  <div className="flex items-center gap-3 mt-3 pt-3 border-t border-black/5 text-xs opacity-70">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />&#8805;80% good</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />50–79% fair</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />&lt;50% low</span>
                  </div>
                </div>
              )
            })()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Severity Distribution</p>
              <p className="text-sm text-slate-400 mt-1 mb-4">
                How detected damages break down by severity level across all inspected images.
              </p>
              {severityTotal === 0 ? (
                <p className="text-sm text-slate-400 italic">No damages detected yet.</p>
              ) : (
                <>
                  <div className="flex h-5 rounded-full overflow-hidden">
                    {severity_breakdown.high > 0 && (
                      <div className="bg-red-500 transition-all duration-700" style={{ width: `${(severity_breakdown.high / severityTotal) * 100}%` }} />
                    )}
                    {severity_breakdown.medium > 0 && (
                      <div className="bg-amber-400 transition-all duration-700" style={{ width: `${(severity_breakdown.medium / severityTotal) * 100}%` }} />
                    )}
                    {severity_breakdown.low > 0 && (
                      <div className="bg-blue-400 transition-all duration-700" style={{ width: `${(severity_breakdown.low / severityTotal) * 100}%` }} />
                    )}
                  </div>
                  <div className="flex items-center gap-5 mt-3 text-sm">
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-red-500" />
                      <span className="font-medium text-slate-700">High</span>
                      <span className="text-slate-400">{severity_breakdown.high} ({severityTotal > 0 ? ((severity_breakdown.high / severityTotal) * 100).toFixed(0) : 0}%)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-amber-400" />
                      <span className="font-medium text-slate-700">Medium</span>
                      <span className="text-slate-400">{severity_breakdown.medium} ({severityTotal > 0 ? ((severity_breakdown.medium / severityTotal) * 100).toFixed(0) : 0}%)</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm bg-blue-400" />
                      <span className="font-medium text-slate-700">Low</span>
                      <span className="text-slate-400">{severity_breakdown.low} ({severityTotal > 0 ? ((severity_breakdown.low / severityTotal) * 100).toFixed(0) : 0}%)</span>
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avg. Classification Confidence</p>
                <p className="text-sm text-slate-400 mt-1">
                  Pass 1 room-type prediction certainty.
                </p>
                <p className="text-3xl font-bold text-slate-800 mt-2">
                  {confidence_metrics?.pass1_avg != null ? `${(confidence_metrics.pass1_avg * 100).toFixed(1)}%` : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-1">across {confidence_metrics?.pass1_count ?? 0} images</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Avg. Detection Confidence</p>
                <p className="text-sm text-slate-400 mt-1">
                  Pass 2 damage feature certainty.
                </p>
                <p className="text-3xl font-bold text-slate-800 mt-2">
                  {confidence_metrics?.pass2_avg != null ? `${(confidence_metrics.pass2_avg * 100).toFixed(1)}%` : '—'}
                </p>
                <p className="text-xs text-slate-400 mt-1">across {confidence_metrics?.pass2_count ?? 0} detections</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Top Kitchen Damages</p>
              <p className="text-sm text-slate-400 mt-1 mb-4">
                Most frequent deficiencies found specifically in kitchen images.
              </p>
              {(room_damage_profiles?.kitchen ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 italic">No kitchen damages detected.</p>
              ) : (
                <div className="space-y-2">
                  {room_damage_profiles.kitchen.map((d) => {
                    const max = room_damage_profiles.kitchen[0].count
                    const pct = (d.count / max) * 100
                    return (
                      <div key={d.feature_id} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 text-sm font-medium text-slate-700 capitalize truncate">
                          {d.feature_id.replace(/_/g, ' ')}
                        </span>
                        <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-md bg-blue-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-sm font-semibold text-slate-600">{d.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Top Bathroom Damages</p>
              <p className="text-sm text-slate-400 mt-1 mb-4">
                Most frequent deficiencies found specifically in bathroom images.
              </p>
              {(room_damage_profiles?.bathroom ?? []).length === 0 ? (
                <p className="text-sm text-slate-400 italic">No bathroom damages detected.</p>
              ) : (
                <div className="space-y-2">
                  {room_damage_profiles.bathroom.map((d) => {
                    const max = room_damage_profiles.bathroom[0].count
                    const pct = (d.count / max) * 100
                    return (
                      <div key={d.feature_id} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 text-sm font-medium text-slate-700 capitalize truncate">
                          {d.feature_id.replace(/_/g, ' ')}
                        </span>
                        <div className="flex-1 h-5 rounded-md bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-md bg-blue-400 transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-sm font-semibold text-slate-600">{d.count}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {(at_risk_properties ?? []).length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Priority Action List</p>
              <p className="text-sm text-slate-400 mt-1 mb-4">
                Properties with the most high-severity damages — review these first.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="pb-2 font-medium text-slate-500 pr-4">Property</th>
                      <th className="pb-2 font-medium text-slate-500 pr-4 text-center">High Severity</th>
                      <th className="pb-2 font-medium text-slate-500 pr-4 text-center">Total Damages</th>
                      <th className="pb-2 font-medium text-slate-500 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {at_risk_properties.map((prop) => (
                      <tr key={prop.property_id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2.5 pr-4 font-medium text-slate-700">{prop.property_id}</td>
                        <td className="py-2.5 pr-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                            {prop.high_severity_count}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-center text-slate-600">{prop.total_damage_count}</td>
                        <td className="py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => onNavigateToProperty?.(prop.property_id)}
                            className="px-3 py-1 text-xs font-medium rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
                          >
                            View &rarr;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Score Calibration</p>
            <p className="text-sm text-slate-400 mt-1 mb-4">
              How closely the AI&rsquo;s condition and modernity scores match human corrections.
            </p>
            {(!calibration || (calibration.overall?.pairs ?? 0) === 0) ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-400">
                <p className="text-sm">No human scores submitted yet.</p>
                <p className="text-xs mt-1">Correct scores on image cards to see calibration metrics here.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                {[
                  { key: 'condition', label: 'Condition (Stand)' },
                  { key: 'modernity', label: 'Modernity (Modernitet)' },
                  { key: 'material', label: 'Material (Materialekvalitet)' },
                  { key: 'functionality', label: 'Functionality (Funktionalitet)' },
                  { key: 'overall', label: 'Overall' },
                ].map(({ key, label }) => {
                  const cal = calibration[key]
                  if (!cal || cal.pairs === 0) {
                    return (
                      <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
                        <p className="text-sm text-slate-400 mt-3 italic">No data yet</p>
                      </div>
                    )
                  }
                  const maeColor =
                    cal.mae <= 0.5
                      ? { border: 'border-emerald-200', bg: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-500', tag: 'Strong' }
                      : cal.mae <= 1.0
                        ? { border: 'border-amber-200', bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500', tag: 'Moderate' }
                        : { border: 'border-red-200', bg: 'bg-red-50', text: 'text-red-700', bar: 'bg-red-500', tag: 'Weak' }
                  const biasSign = cal.bias > 0 ? '+' : ''
                  const biasLabel = cal.bias < 0 ? 'AI too optimistic' : cal.bias > 0 ? 'AI too conservative' : 'No bias'
                  return (
                    <div key={key} className={`rounded-xl border p-4 ${maeColor.border} ${maeColor.bg}`}>
                      <div className="flex items-center justify-between">
                        <p className={`text-xs font-medium uppercase tracking-wide ${maeColor.text}`}>{label}</p>
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${maeColor.bg} ${maeColor.text} border ${maeColor.border}`}>
                          {maeColor.tag}
                        </span>
                      </div>

                      <p className={`text-3xl font-bold mt-2 ${maeColor.text}`}>{cal.mae}</p>
                      <p className={`text-xs mt-0.5 opacity-70 ${maeColor.text}`}>MAE (avg. points off)</p>

                      <div className="mt-3 pt-3 border-t border-black/5 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 font-medium">Bias</span>
                          <span className={`font-semibold ${cal.bias < 0 ? 'text-amber-600' : cal.bias > 0 ? 'text-blue-600' : 'text-slate-600'}`}>
                            {biasSign}{cal.bias}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 -mt-1">{biasLabel}</p>

                        <div className="flex items-center justify-between text-sm">
                          <span className="text-slate-500 font-medium">Agreement</span>
                          <span className="font-semibold text-slate-700">{cal.agreement_rate}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${maeColor.bar} transition-all duration-500`}
                            style={{ width: `${Math.min(cal.agreement_rate, 100)}%` }}
                          />
                        </div>
                      </div>

                      <p className={`text-[10px] mt-3 opacity-50 ${maeColor.text}`}>
                        Based on {cal.pairs} comparison{cal.pairs !== 1 ? 's' : ''}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
