import { useState, useEffect, useMemo } from 'react'
import './App.css'

const API_BASE = '/api'
const TARGET_ROOM_TYPES = ['kitchen', 'bathroom']

const CATEGORY_B_KITCHEN_REF = `Category B Kitchen – Significant Deficiency

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

/** Split property images into target (actionable kitchen/bathroom) and review (everything else).
 *  Uses the pipeline-provided lists when available; falls back to computing from images.
 */
function splitImages(property) {
  const images = property.images ?? []

  // Pipeline may provide filename lists
  if (Array.isArray(property.target_images) && Array.isArray(property.review_images)) {
    const targetSet = new Set(
      property.target_images.map((t) => (typeof t === 'string' ? t : t.filename)),
    )
    return {
      target: images.filter((img) => targetSet.has(img.filename)),
      review: images.filter((img) => !targetSet.has(img.filename)),
    }
  }

  // Fallback: derive from pass1 data
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
    if (
      e.property_id === propertyId &&
      e.filename === filename &&
      e.classification
    ) {
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
    if (
      e.property_id === propertyId &&
      e.filename === filename &&
      e.feature_id === featureId
    ) {
      return e.verdict
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

const CLASSIFICATION_META = {
  correct: { label: 'Correct', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200', activeBg: 'bg-emerald-600', activeText: 'text-white', ring: 'ring-emerald-300' },
  fp:      { label: 'False Positive', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', activeBg: 'bg-red-600', activeText: 'text-white', ring: 'ring-red-300' },
  fn:      { label: 'False Negative', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200', activeBg: 'bg-amber-600', activeText: 'text-white', ring: 'ring-amber-300' },
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

// ---------------------------------------------------------------------------
// ImageCard
// ---------------------------------------------------------------------------

function ImageCard({ property, image, classification, allFeedback, onClassify, onFeatureFeedback }) {
  const [expanded, setExpanded] = useState(false)
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
      {/* Image */}
      <div className="relative">
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
      </div>

      {/* Metadata */}
      <div className="p-3 space-y-3">
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

        {/* Expandable features */}
        {features.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
            >
              {expanded ? '\u25BE' : '\u25B8'} {features.length} feature{features.length !== 1 ? 's' : ''} detected
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1.5">
                {features.map((f, i) => {
                  const verdict = getVerdictForFeature(
                    allFeedback,
                    property.property_id,
                    image.filename,
                    f.feature_id,
                  )
                  return (
                    <li key={`${f.feature_id}-${i}`} className="text-xs border border-slate-100 rounded-md p-2 bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-700">{f.feature_id}</span>
                        <span className="text-slate-400 capitalize">{f.severity}</span>
                      </div>
                      {(f.explanation || f.evidence) && (
                        <p className="text-slate-500 mt-1">{f.explanation ?? f.evidence}</p>
                      )}
                      {verdict ? (
                        <span
                          className={`mt-1 inline-block text-xs font-medium ${
                            verdict === 'agree' ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {verdict === 'agree' ? '\u2713 Agreed' : '\u2717 Disagreed'}
                        </span>
                      ) : (
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
        )}

        {/* Classification buttons — always visible, active one highlighted */}
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
                {cls === 'correct' ? '\u2713 Correct' : cls === 'fp' ? 'FP' : 'FN'}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reference panel (modal)
// ---------------------------------------------------------------------------

function ReferencePanel({ onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800">
              Reference: Category B Kitchen
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            >
              &times;
            </button>
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
// PropertyReviewView
// ---------------------------------------------------------------------------

const FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'unreviewed', label: 'Unreviewed' },
  { id: 'kitchen', label: 'Kitchens' },
  { id: 'low_confidence', label: 'Low Confidence' },
]

function PropertyReviewView({ property, allFeedback, onFeedbackSubmit }) {
  const [activeTab, setActiveTab] = useState('target')
  const [filter, setFilter] = useState('all')
  const [showReference, setShowReference] = useState(false)

  const { target, review } = useMemo(() => splitImages(property), [property])
  const currentImages = activeTab === 'target' ? target : review

  const filteredImages = useMemo(() => {
    return currentImages.filter((img) => {
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
  }, [currentImages, filter, allFeedback, property])

  // Stats
  const allImages = useMemo(() => [...target, ...review], [target, review])
  const classifiedCount = useMemo(() => {
    return allImages.filter((img) =>
      getClassificationForImage(allFeedback, property.property_id, img.filename),
    ).length
  }, [allImages, allFeedback, property])

  const handleClassify = (filename, classification) => {
    const entry = { property_id: property.property_id, filename, classification }
    fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
      .then((res) => {
        if (res.ok) onFeedbackSubmit(entry)
      })
      .catch(() => {})
  }

  const handleFeatureFeedback = (filename, featureId, verdict) => {
    const entry = {
      property_id: property.property_id,
      filename,
      feature_id: featureId,
      verdict,
    }
    fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
      .then((res) => {
        if (res.ok) onFeedbackSubmit(entry)
      })
      .catch(() => {})
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          {/* Tabs */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => { setActiveTab('target'); setFilter('all') }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'target'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Target Rooms
              <span className="ml-1.5 text-xs font-normal text-slate-400">({target.length})</span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('review'); setFilter('all') }}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'review'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Verification Bin
              <span className="ml-1.5 text-xs font-normal text-slate-400">({review.length})</span>
            </button>
          </div>

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
            No images match the current filter.
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

      {/* Reference modal */}
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

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white shadow-sm flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Properties</h2>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          {loading && (
            <p className="px-3 py-2 text-sm text-slate-500">Loading\u2026</p>
          )}
          {error && (
            <p className="px-3 py-2 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          {!loading && !error && properties.length === 0 && (
            <p className="px-3 py-2 text-sm text-slate-500">
              No properties found
            </p>
          )}
          {!loading &&
            properties.map((property) => (
              <button
                key={property.property_id}
                type="button"
                onClick={() => setSelectedProperty(property)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedProperty?.property_id === property.property_id
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
              <h1 className="text-xl font-semibold text-slate-500">
                Select a property
              </h1>
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
      </main>
    </div>
  )
}

export default App
