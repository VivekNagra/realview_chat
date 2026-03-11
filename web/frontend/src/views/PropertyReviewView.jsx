import { useState, useMemo, useCallback } from 'react'
import ImageCard from '../components/ui/ImageCard'
import { postFeedback } from '../services/api'
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

const GRADE_META = {
  A: { label: 'Ny/eksklusiv', bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300', ring: 'ring-emerald-200' },
  B: { label: 'Pæn og moderne', bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', ring: 'ring-blue-200' },
  C: { label: 'Brugbar/neutral', bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', ring: 'ring-amber-200' },
  D: { label: 'Forældet/slidt', bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300', ring: 'ring-orange-200' },
  E: { label: 'Renoveringskrævende', bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300', ring: 'ring-red-200' },
}

const GRADE_THRESHOLDS = [
  [17, 'A'], [13, 'B'], [9, 'C'], [5, 'D'], [0, 'E'],
]

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

function totalToGrade(total) {
  for (const [threshold, letter] of GRADE_THRESHOLDS) {
    if (total >= threshold) return letter
  }
  return 'E'
}

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

export default function PropertyReviewView({ property, allFeedback, onFeedbackSubmit }) {
  const [classTab, setClassTab] = useState('all_results')
  const [roomTab, setRoomTab] = useState('target')
  const [filter, setFilter] = useState('all')
  const [showReference, setShowReference] = useState(false)

  const { target, review } = useMemo(() => splitImages(property), [property])
  const allImages = useMemo(() => [...target, ...review], [target, review])

  const roomGrades = useMemo(() => {
    return (property.rooms ?? []).map((room) => {
      const c = room.room_condition_score
      const m = room.room_modernity_score
      const mat = room.room_material_score
      const f = room.room_functionality_score
      if (c == null || m == null || mat == null || f == null) return null
      const total = c + m + mat + f
      return { room_type: room.room_type, condition: c, modernity: m, material: mat, functionality: f, total, grade: totalToGrade(total) }
    }).filter(Boolean)
  }, [property.rooms])

  const baseImages = useMemo(() => {
    if (classTab !== 'all_results') return allImages
    return roomTab === 'target' ? target : review
  }, [classTab, roomTab, target, review, allImages])

  const filteredImages = useMemo(() => {
    return baseImages.filter((img) => {
      if (classTab !== 'all_results') {
        const cls = getClassificationForImage(allFeedback, property.property_id, img.filename)
        if (cls !== classTab) return false
      }
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

  const classifiedCount = useMemo(() => {
    return allImages.filter((img) =>
      getClassificationForImage(allFeedback, property.property_id, img.filename),
    ).length
  }, [allImages, allFeedback, property])

  const handleClassify = useCallback(async (filename, classification) => {
    const entry = { property_id: property.property_id, filename, classification }
    const ok = await postFeedback(entry)
    if (ok) onFeedbackSubmit(entry)
  }, [property.property_id, onFeedbackSubmit])

  const handleFeatureFeedback = useCallback(async (filename, featureId, verdict) => {
    const entry = { property_id: property.property_id, filename, feature_id: featureId, verdict }
    const ok = await postFeedback(entry)
    if (ok) onFeedbackSubmit(entry)
  }, [property.property_id, onFeedbackSubmit])

  const handleScoreFeedback = useCallback(async (filename, scoreType, value) => {
    const entry = { property_id: property.property_id, filename, score_type: scoreType, value }
    const ok = await postFeedback(entry)
    if (ok) onFeedbackSubmit(entry)
  }, [property.property_id, onFeedbackSubmit])

  return (
    <div className="flex flex-col h-full">
      {roomGrades.length > 0 && (
        <div className="shrink-0 sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3 overflow-x-auto">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 shrink-0">Room Grades</span>
            {roomGrades.map((room, idx) => {
              const gm = GRADE_META[room.grade] ?? GRADE_META.C
              return (
                <div key={`${room.room_type}-${idx}`} className={`flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 ${gm.border} ${gm.bg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-black leading-none ${gm.text}`}>{room.grade}</span>
                    <div>
                      <p className="text-xs font-semibold text-slate-700 capitalize">{room.room_type}</p>
                      <p className={`text-[10px] font-medium ${gm.text}`}>{gm.label}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-2 border-l border-black/10 text-[10px] text-slate-500">
                    <span>C:{room.condition}</span>
                    <span>M:{room.modernity}</span>
                    <span>Ma:{room.material}</span>
                    <span>F:{room.functionality}</span>
                    <span className={`font-bold ${gm.text}`}>{room.total}/20</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-2">
        <div className="flex items-center gap-1">
          {CLASSIFICATION_TABS.map((tab) => {
            const active = classTab === tab.id
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

      <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-2.5">
        <div className="flex items-center justify-between gap-4 flex-wrap">
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
                onScoreFeedback={handleScoreFeedback}
              />
            ))}
          </div>
        )}
      </div>

      {showReference && <ReferencePanel onClose={() => setShowReference(false)} />}
    </div>
  )
}
