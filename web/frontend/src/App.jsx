import { useState, useEffect, useMemo, useCallback } from 'react'
import './App.css'

const API_BASE = '/api'
const TARGET_ROOM_TYPES = ['kitchen', 'bathroom']

const CATEGORY_B_KITCHEN_REF = `Category B Kitchen \u2013 Significant Deficiency

A kitchen classified as Category B exhibits notable wear or damage that goes beyond normal age-related deterioration. Key indicators include:

\u2022 Visible water damage around sink, dishwasher, or under countertops
\u2022 Worn or damaged countertop surfaces with functional impact
\u2022 Cabinet doors/drawers with broken hinges or non-functional hardware
\u2022 Outdated or non-compliant electrical installations
\u2022 Plumbing showing signs of corrosion or active leaks
\u2022 Flooring with cracks, lifting, or water staining
\u2022 Ventilation/exhaust systems not functioning properly

This level warrants budgeting for renovation within 1\u20135 years.`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getImageUrl(propertyId, filename) {
  return `${API_BASE}/images/${encodeURIComponent(propertyId)}/${encodeURIComponent(filename)}`
}

function normalizeProperties(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data.property_id !== 'undefined') return [data]
  return []
}

/** Split property images into target (actionable kitchen/bathroom) and review (everything else). */
function splitImages(property) {
  const images = property.images ?? []

  if (Array.isArray(property.target_images) && Array.isArray(property.review_images)) {
    const targetSet = new Set(
      property.target_images.map((t) => (typeof t === 'string' ? t : t.filename)),
    )
    return {
      target: images.filter((img) => targetSet.has(img.filename)),
      review: images.filter((img) => !targetSet.has(img.filename)),
    }
  }

  const target = images.filter(
    (img) =>
      TARGET_ROOM_TYPES.includes(img.pass1?.room_type) && img.pass1?.actionable === true,
  )
  const targetNames = new Set(target.map((i) => i.filename))
  const review = images.filter((img) => !targetNames.has(img.filename))
  return { target, review }
}

/** Return the latest image-level classification from feedback (correct | fp | fn). */
function getClassificationForImage(allFeedback, propertyId, filename) {
  if (!Array.isArray(allFeedback)) return null
  for (let i = allFeedback.length - 1; i >= 0; i--) {
    const e = allFeedback[i]
    if (e.property_id === propertyId && e.filename === filename && e.classification) {
      return e.classification
    }
  }
  return null
}

/** Return the latest feature-level verdict from feedback (agree | disagree). */
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

/** Compute benchmarking stats from feedback (client-side, deduped to latest per image). */
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

/** Return Tailwind color classes based on percentage thresholds. */
function rateColor(pct) {
  if (pct >= 80) return { text: 'text-emerald-700', bg: 'bg-emerald-500', card: 'border-emerald-200 bg-emerald-50' }
  if (pct >= 50) return { text: 'text-amber-700', bg: 'bg-amber-500', card: 'border-amber-200 bg-amber-50' }
  return { text: 'text-red-700', bg: 'bg-red-500', card: 'border-red-200 bg-red-50' }
}

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

const CLASSIFICATION_META = {
  correct: { label: 'Correct', shortLabel: '\u2713 Correct', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', activeBg: 'bg-emerald-600', activeText: 'text-white', ring: 'ring-emerald-300' },
  fp:      { label: 'False Positive', shortLabel: 'FP', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', activeBg: 'bg-red-600', activeText: 'text-white', ring: 'ring-red-300' },
  fn:      { label: 'False Negative', shortLabel: 'FN', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', activeBg: 'bg-amber-600', activeText: 'text-white', ring: 'ring-amber-300' },
}

function ClassificationBadge({ classification }) {
  const m = CLASSIFICATION_META[classification]
  if (!m) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${m.bg} ${m.text} ${m.border}`}>
      {m.label}
    </span>
  )
}

/** Compact feature badge showing feature_id + confidence. */
function FeatureBadge({ feature }) {
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

// ---------------------------------------------------------------------------
// ImageCard
// ---------------------------------------------------------------------------

function ImageCard({ property, image, classification, allFeedback, onClassify, onFeatureFeedback, readOnly = false }) {
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
      {/* Image — clickable to enlarge */}
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
        {/* Zoom hint */}
        <div className="absolute top-2 left-2 bg-black/40 text-white/80 rounded-md px-1.5 py-0.5 text-xs opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          Click to enlarge
        </div>
      </div>

      {/* Lightbox overlay */}
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

      {/* Metadata */}
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

        {/* AI findings — always visible as badges */}
        {features.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {features.map((f, i) => (
                <FeatureBadge key={`${f.feature_id}-${i}`} feature={f} />
              ))}
            </div>

            {/* Expandable detail panel */}
            <button
              type="button"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {detailsOpen ? '\u25BE Hide details' : '\u25B8 Show details'}
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
                          {verdict === 'agree' ? '\u2713 Agreed' : '\u2717 Disagreed'}
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

        {/* Classification buttons — hidden in readOnly mode */}
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

// ---------------------------------------------------------------------------
// Reference panel (modal)
// ---------------------------------------------------------------------------

function ReferencePanel({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">Reference: Category B Kitchen</h3>
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
          </div>
          <div className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">
            {CATEGORY_B_KITCHEN_REF}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Benchmarking Report
// ---------------------------------------------------------------------------

function BenchmarkingReport({ allFeedback, onReset }) {
  const stats = useMemo(() => computeStats(allFeedback), [allFeedback])
  const precColor = rateColor(stats.precision)
  const recColor = rateColor(stats.recall)
  const [confirming, setConfirming] = useState(false)

  const handleReset = () => {
    fetch(`${API_BASE}/reset`, { method: 'DELETE' })
      .then((res) => {
        if (res.ok) {
          onReset()
          setConfirming(false)
        }
      })
      .catch(() => {})
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
        {/* Verified Leads */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Verified Leads</p>
          <p className="text-3xl font-bold text-emerald-800 mt-1">{stats.correct}</p>
          <p className="text-xs text-emerald-600/70 mt-1">{stats.total} I alt</p>
        </div>

        {/* False Positives */}
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-xs font-medium text-red-600 uppercase tracking-wide">False Positives</p>
          <p className="text-3xl font-bold text-red-800 mt-1">{stats.fp}</p>
          <p className="text-xs text-red-600/70 mt-1">AI siger det er et køkken eller bad når det ikke er</p>
        </div>

        {/* False Negatives */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">False Negatives</p>
          <p className="text-3xl font-bold text-amber-800 mt-1">{stats.fn}</p>
          <p className="text-xs text-amber-600/70 mt-1">AI har overset et køkken eller bad</p>
        </div>

        {/* Precision */}
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

        {/* Recall */}
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

// ---------------------------------------------------------------------------
// Ground Truth Master Gallery
// ---------------------------------------------------------------------------

function GroundTruthGallery({ properties, allFeedback, onNavigateToProperty, onReset }) {
  /** Collect every image across all properties that is classified as "correct". */
  const approvedImages = useMemo(() => {
    const results = []
    for (const prop of properties) {
      for (const img of prop.images ?? []) {
        const cls = getClassificationForImage(allFeedback, prop.property_id, img.filename)
        if (cls === 'correct') {
          results.push({ property: prop, image: img })
        }
      }
    }
    return results
  }, [properties, allFeedback])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Master Ground Truth Gallery</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              {approvedImages.length} approved image{approvedImages.length !== 1 ? 's' : ''} across all properties
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Ground Truth
          </span>
        </div>
      </div>

      {/* Benchmarking Report */}
      <BenchmarkingReport allFeedback={allFeedback} onReset={onReset} />

      {/* Gallery */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {approvedImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <p className="text-sm">No approved images yet.</p>
            <p className="text-xs mt-1">Classify images as &ldquo;Correct&rdquo; to populate this gallery.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {approvedImages.map(({ property, image }) => (
              <div key={`${property.property_id}-${image.filename}`}>
                {/* Clickable property link */}
                <div className="px-1 pb-1">
                  <button
                    type="button"
                    onClick={() => onNavigateToProperty(property)}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                  >
                    Property: {property.property_id} &rarr;
                  </button>
                </div>
                <ImageCard
                  readOnly
                  property={property}
                  image={image}
                  classification={getClassificationForImage(allFeedback, property.property_id, image.filename)}
                  allFeedback={allFeedback}
                  onClassify={() => {}}
                  onFeatureFeedback={() => {}}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PropertyReviewView
// ---------------------------------------------------------------------------

const CLASSIFICATION_TABS = [
  { id: 'all_results', label: 'All Results', icon: null },
  { id: 'correct', label: 'Ground Truth', icon: '\u2713' },
  { id: 'fp', label: 'False Positives', icon: null },
  { id: 'fn', label: 'False Negatives', icon: null },
]

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'unreviewed', label: 'Unreviewed' },
  { id: 'kitchen', label: 'Kitchens' },
  { id: 'low_confidence', label: 'Low Confidence' },
]

function PropertyReviewView({ property, allFeedback, onFeedbackSubmit }) {
  const [classTab, setClassTab] = useState('all_results')
  const [roomTab, setRoomTab] = useState('target')
  const [filter, setFilter] = useState('all')
  const [showReference, setShowReference] = useState(false)

  const { target, review } = useMemo(() => splitImages(property), [property])
  const allImages = useMemo(() => [...target, ...review], [target, review])

  // When a classification tab is active, we show from ALL images; otherwise room tab applies.
  const baseImages = useMemo(() => {
    if (classTab !== 'all_results') return allImages
    return roomTab === 'target' ? target : review
  }, [classTab, roomTab, target, review, allImages])

  const filteredImages = useMemo(() => {
    return baseImages.filter((img) => {
      // Classification tab filter
      if (classTab !== 'all_results') {
        const cls = getClassificationForImage(allFeedback, property.property_id, img.filename)
        if (cls !== classTab) return false
      }
      // Secondary filters
      if (filter === 'unreviewed') {
        return !getClassificationForImage(allFeedback, property.property_id, img.filename)
      }
      if (filter === 'kitchen') {
        return img.pass1?.room_type === 'kitchen'
      }
      if (filter === 'low_confidence') {
        return (img.pass1?.confidence ?? 1) < 0.5
      }
      return true
    })
  }, [baseImages, classTab, filter, allFeedback, property])

  // Stats
  const classifiedCount = useMemo(() => {
    return allImages.filter((img) =>
      getClassificationForImage(allFeedback, property.property_id, img.filename),
    ).length
  }, [allImages, allFeedback, property])

  const handleClassify = useCallback((filename, classification) => {
    const entry = { property_id: property.property_id, filename, classification }
    fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
      .then((res) => { if (res.ok) onFeedbackSubmit(entry) })
      .catch(() => {})
  }, [property.property_id, onFeedbackSubmit])

  const handleFeatureFeedback = useCallback((filename, featureId, verdict) => {
    const entry = { property_id: property.property_id, filename, feature_id: featureId, verdict }
    fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
      .then((res) => { if (res.ok) onFeedbackSubmit(entry) })
      .catch(() => {})
  }, [property.property_id, onFeedbackSubmit])

  return (
    <div className="flex flex-col h-full">
      {/* Classification tabs row */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-2">
        <div className="flex items-center gap-1">
          {CLASSIFICATION_TABS.map((tab) => {
            const active = classTab === tab.id
            // Count for each classification tab
            let count = null
            if (tab.id !== 'all_results') {
              count = allImages.filter(
                (img) => getClassificationForImage(allFeedback, property.property_id, img.filename) === tab.id,
              ).length
            }
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => { setClassTab(tab.id); setFilter('all') }}
                className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  active
                    ? tab.id === 'correct'
                      ? 'bg-emerald-100 text-emerald-800'
                      : tab.id === 'fp'
                        ? 'bg-red-100 text-red-800'
                        : tab.id === 'fn'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-indigo-100 text-indigo-800'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {tab.icon && <span className="mr-1">{tab.icon}</span>}
                {tab.label}
                {count !== null && (
                  <span className="ml-1.5 text-xs opacity-60">({count})</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Toolbar: room tabs + filters + stats */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-2.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Room tabs — only shown when classTab is "all_results" */}
          {classTab === 'all_results' ? (
            <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => { setRoomTab('target'); setFilter('all') }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  roomTab === 'target'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Target Rooms
                <span className="ml-1.5 text-xs font-normal text-slate-400">({target.length})</span>
              </button>
              <button
                type="button"
                onClick={() => { setRoomTab('review'); setFilter('all') }}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  roomTab === 'review'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                Verification Bin
                <span className="ml-1.5 text-xs font-normal text-slate-400">({review.length})</span>
              </button>
            </div>
          ) : (
            <div className="text-sm text-slate-500 font-medium">
              Showing {filteredImages.length} image{filteredImages.length !== 1 ? 's' : ''}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-1.5">
            {FILTER_OPTIONS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                  filter === f.id
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Stats + Reference */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {classifiedCount}/{allImages.length} classified
            </span>
            <button
              type="button"
              onClick={() => setShowReference(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Reference
            </button>
          </div>
        </div>
      </div>

      {/* Image grid */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
        {filteredImages.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            No images match the current filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredImages.map((img) => (
              <ImageCard
                key={img.filename}
                property={property}
                image={img}
                classification={getClassificationForImage(
                  allFeedback,
                  property.property_id,
                  img.filename,
                )}
                allFeedback={allFeedback}
                onClassify={handleClassify}
                onFeatureFeedback={handleFeatureFeedback}
              />
            ))}
          </div>
        )}
      </div>

      {showReference && <ReferencePanel onClose={() => setShowReference(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

function App() {
  const [properties, setProperties] = useState([])
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [allFeedback, setAllFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('property') // 'property' | 'ground_truth'

  useEffect(() => {
    fetch(`${API_BASE}/feedback`)
      .then((res) => (res.ok ? res.json() : Promise.resolve([])))
      .then((data) => setAllFeedback(Array.isArray(data) ? data : []))
      .catch(() => setAllFeedback([]))
  }, [])

  useEffect(() => {
    fetch(`${API_BASE}/properties`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = data?.error ?? `Failed to fetch properties (${res.status})`
          throw new Error(msg)
        }
        return data
      })
      .then((data) => {
        setProperties(normalizeProperties(data))
        setSelectedProperty(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (isoString) => {
    if (!isoString) return '\u2014'
    try {
      return new Date(isoString).toLocaleString()
    } catch {
      return isoString
    }
  }

  const selectProperty = (prop) => {
    setSelectedProperty(prop)
    setViewMode('property')
  }

  const openMasterGallery = () => {
    setSelectedProperty(null)
    setViewMode('ground_truth')
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white shadow-sm flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">RealView</h2>
        </div>

        {/* Master Gallery button */}
        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={openMasterGallery}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'ground_truth'
                ? 'bg-emerald-100 text-emerald-800'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            
            GT Gallery
          </button>
        </div>

        {/* Properties */}
        <div className="px-4 pt-4 pb-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Properties</h3>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2">
          {loading && (
            <p className="px-3 py-2 text-sm text-slate-500">Loading\u2026</p>
          )}
          {error && (
            <p className="px-3 py-2 text-sm text-red-600" role="alert">{error}</p>
          )}
          {!loading && !error && properties.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">No properties found</p>
          )}
          {!loading &&
            properties.map((property) => (
              <button
                key={property.property_id}
                type="button"
                onClick={() => selectProperty(property)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  viewMode === 'property' && selectedProperty?.property_id === property.property_id
                    ? 'bg-indigo-100 text-indigo-800'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {property.property_id}
              </button>
            ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {viewMode === 'ground_truth' ? (
          <GroundTruthGallery
            properties={properties}
            allFeedback={allFeedback}
            onNavigateToProperty={selectProperty}
            onReset={() => setAllFeedback([])}
          />
        ) : (
          <>
            <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
              {selectedProperty ? (
                <div className="flex flex-col gap-1">
                  <h1 className="text-xl font-semibold text-slate-800">
                    {selectedProperty.property_id}
                  </h1>
                  <p className="text-sm text-slate-500">
                    Created: {formatDate(selectedProperty.created_at)}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <h1 className="text-xl font-semibold text-slate-500">Select a property</h1>
                  <p className="text-sm text-slate-400">
                    Choose a property from the sidebar to begin validation
                  </p>
                </div>
              )}
            </header>
            <div className="flex-1 overflow-hidden min-h-0">
              {selectedProperty && (
                <PropertyReviewView
                  property={selectedProperty}
                  allFeedback={allFeedback}
                  onFeedbackSubmit={(entry) => setAllFeedback((prev) => [...prev, entry])}
                />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
