import { useState } from 'react'
import ClassificationBadge, { CLASSIFICATION_META } from './ClassificationBadge'
import FeatureBadge from './FeatureBadge'
import ScoreDropdown from './ScoreDropdown'
import { getImageUrl } from '../../services/api'

const TARGET_ROOM_TYPES = ['kitchen', 'bathroom']

const CONDITION_LABELS = {
  1: 'Renoveringskrævende',
  2: 'Slidt',
  3: 'Velholdt ældre',
  4: 'Moderniseret',
  5: 'Nyt / Næsten nyt',
}

const MODERNITY_LABELS = {
  1: 'Markant forældet',
  2: 'Forældet',
  3: 'Neutral',
  4: 'Delvist moderne',
  5: 'Nyt / nutidigt',
}

const MATERIAL_LABELS = {
  1: 'Billige standardmaterialer',
  2: 'Under middel',
  3: 'Mellemklasse',
  4: 'Over middel',
  5: 'Eksklusiv / premium',
}

const FUNCTIONALITY_LABELS = {
  1: 'Dårlig planløsning',
  2: 'Under middel',
  3: 'Funktionel standard',
  4: 'Over middel',
  5: 'Optimal indretning',
}

function getVerdictForFeature(allFeedback, propertyId, filename, featureId) {
  if (!Array.isArray(allFeedback) || !filename) return null
  for (let i = allFeedback.length - 1; i >= 0; i--) {
    const e = allFeedback[i]
    if (e.property_id === propertyId && e.filename === filename && e.feature_id === featureId) {
      return e.verdict
    }
  }
  return null
}

function getScoreForImage(allFeedback, propertyId, filename, scoreType) {
  if (!Array.isArray(allFeedback)) return null
  for (let i = allFeedback.length - 1; i >= 0; i--) {
    const e = allFeedback[i]
    if (
      e.property_id === propertyId &&
      e.filename === filename &&
      e.score_type === scoreType &&
      e.value != null
    ) {
      return e.value
    }
  }
  return null
}

export default function ImageCard({ property, image, classification, allFeedback, onClassify, onFeatureFeedback, onScoreFeedback, readOnly = false }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const pass1 = image.pass1 ?? {}
  const features = image.pass2 ?? []

  const confidenceColor =
    (pass1.confidence ?? 0) < 0.5
      ? 'text-amber-600'
      : (pass1.confidence ?? 0) >= 0.8
        ? 'text-emerald-600'
        : 'text-slate-600'

  const cardBorder = classification
    ? classification === 'correct'
      ? 'border-emerald-300'
      : classification === 'fp'
        ? 'border-red-300'
        : 'border-amber-300'
    : 'border-slate-200'

  return (
    <div className={`rounded-xl border shadow-sm overflow-hidden bg-white transition-all ${cardBorder}`}>
      <div className="relative cursor-pointer" onClick={() => setLightbox(true)}>
        <img
          src={getImageUrl(property.property_id, image.filename)}
          alt={image.filename}
          className="w-full h-48 object-cover"
          loading="lazy"
        />
        {classification && (
          <div className="absolute top-2 right-2">
            <ClassificationBadge classification={classification} />
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
          <p className="text-white text-xs font-medium truncate">{image.filename}</p>
        </div>
        <div className="absolute top-2 left-2 bg-black/40 text-white/80 rounded-md px-1.5 py-0.5 text-xs opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          Click to enlarge
        </div>
      </div>

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-6" onClick={() => setLightbox(false)}>
          <button
            type="button"
            onClick={() => setLightbox(false)}
            className="absolute top-4 right-4 text-white/70 hover:text-white text-3xl leading-none z-10"
          >
            &times;
          </button>
          <img
            src={getImageUrl(property.property_id, image.filename)}
            alt={image.filename}
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">{image.filename}</p>
        </div>
      )}

      <div className="p-3 space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 capitalize">
            {(pass1.room_type ?? 'unknown').replace(/_/g, ' ')}
          </span>
          <span className={`text-xs font-medium ${confidenceColor}`}>
            Conf: {((pass1.confidence ?? 0) * 100).toFixed(0)}%
          </span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              pass1.actionable ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}
          >
            {pass1.actionable ? 'Actionable' : 'Not actionable'}
          </span>
        </div>

        {features.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {features.map((f, i) => (
                <FeatureBadge key={`${f.feature_id}-${i}`} feature={f} />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {detailsOpen ? '▾ Hide details' : '▸ Show details'}
            </button>
            {detailsOpen && (
              <ul className="space-y-1.5">
                {features.map((f, i) => {
                  const verdict = getVerdictForFeature(
                    allFeedback,
                    property.property_id,
                    image.filename,
                    f.feature_id,
                  )
                  return (
                    <li key={`detail-${f.feature_id}-${i}`} className="text-xs border border-slate-100 rounded-md p-2 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">{(f.feature_id ?? '').replace(/_/g, ' ')}</span>
                        <span className="text-slate-400 capitalize">{f.severity}</span>
                      </div>
                      {(f.explanation || f.evidence) && (
                        <p className="text-slate-500 mt-1">{f.explanation ?? f.evidence}</p>
                      )}
                      {verdict && (
                        <span
                          className={`mt-1 inline-block text-xs font-medium ${
                            verdict === 'agree' ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {verdict === 'agree' ? '✓ Agreed' : '✗ Disagreed'}
                        </span>
                      )}
                      {!readOnly && !verdict && (
                        <div className="flex gap-1.5 mt-1.5">
                          <button
                            type="button"
                            onClick={() => onFeatureFeedback(image.filename, f.feature_id, 'agree')}
                            className="px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                          >
                            Agree
                          </button>
                          <button
                            type="button"
                            onClick={() => onFeatureFeedback(image.filename, f.feature_id, 'disagree')}
                            className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
                          >
                            Disagree
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No features detected</p>
        )}

        {TARGET_ROOM_TYPES.includes(pass1.room_type) && (() => {
          const scores = [
            { key: 'condition', label: 'Condition (Stand)', labels: CONDITION_LABELS, pipeline: image.condition_score ?? null },
            { key: 'modernity', label: 'Modernity (Modernitet)', labels: MODERNITY_LABELS, pipeline: image.modernity_score ?? null },
            { key: 'material', label: 'Material (Materialekvalitet)', labels: MATERIAL_LABELS, pipeline: image.material_score ?? null },
            { key: 'functionality', label: 'Functionality (Funktionalitet)', labels: FUNCTIONALITY_LABELS, pipeline: image.functionality_score ?? null },
          ]
          return (
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
              {scores.map((s) => (
                <ScoreDropdown
                  key={s.key}
                  label={s.label}
                  labels={s.labels}
                  pipelineScore={s.pipeline}
                  humanScore={getScoreForImage(allFeedback, property.property_id, image.filename, s.key)}
                  readOnly={readOnly}
                  onChange={(val) => onScoreFeedback?.(image.filename, s.key, val)}
                />
              ))}
            </div>
          )
        })()}

        {!readOnly && (
          <div className="flex gap-2 pt-2 border-t border-slate-100">
            {(['correct', 'fp', 'fn']).map((cls) => {
              const m = CLASSIFICATION_META[cls]
              const active = classification === cls
              return (
                <button
                  key={cls}
                  type="button"
                  onClick={() => onClassify(image.filename, cls)}
                  className={`flex-1 px-2 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    active
                      ? `${m.activeBg} ${m.activeText} ring-2 ${m.ring}`
                      : `${m.bg} ${m.text} hover:opacity-80`
                  }`}
                >
                  {m.shortLabel}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
