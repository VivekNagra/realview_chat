import { useState, useEffect } from 'react'
import './App.css'

const API_BASE = '/api'

function getImageUrl(propertyId, filename) {
  return `http://localhost:5000/api/images/${encodeURIComponent(propertyId)}/${encodeURIComponent(filename)}`
}

function normalizeProperties(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data.property_id !== 'undefined') return [data]
  return []
}

/** Build list of unique rooms with confirmed_features. Use property.rooms if present (merged by room_type); else derive from images. */
function getRoomsWithFeatures(property) {
  if (property.rooms && property.rooms.length > 0) {
    const byRoom = new Map()
    for (const room of property.rooms) {
      const rt = room.room_type ?? 'unknown'
      if (!byRoom.has(rt)) {
        byRoom.set(rt, { room_type: rt, confirmed_features: [] })
      }
      const existing = byRoom.get(rt)
      existing.confirmed_features.push(...(room.confirmed_features ?? []))
    }
    return Array.from(byRoom.values())
  }
  const images = property.images ?? []
  const byRoom = new Map()
  for (const img of images) {
    const roomType = img.pass1?.room_type ?? 'unknown'
    if (!byRoom.has(roomType)) {
      byRoom.set(roomType, { room_type: roomType, confirmed_features: [] })
    }
    const features = (img.pass2 ?? []).map((f) => ({
      feature_id: f.feature_id,
      severity: f.severity,
      confidence: f.confidence,
      evidence: f.explanation ?? f.evidence ?? '',
      filename: img.filename,
    }))
    byRoom.get(roomType).confirmed_features.push(...features)
  }
  return Array.from(byRoom.values())
}

/** Get images for a room from property.images by pass1.room_type */
function getImagesForRoom(property, roomType) {
  const images = property.images ?? []
  return images.filter((img) => (img.pass1?.room_type ?? 'unknown') === roomType)
}

function FeatureCard({ property, room, feature, featureIndex, reviewedVerdict, onFeedback }) {
  const roomImages = getImagesForRoom(property, room.room_type)
  const filename = feature.filename ?? roomImages[0]?.filename ?? ''

  const handleVerdict = (verdict) => {
    fetch(`${API_BASE}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        property_id: property.property_id,
        filename,
        feature_id: feature.feature_id,
        verdict,
      }),
    })
      .then((res) => {
        if (res.ok) onFeedback(verdict)
      })
      .catch(() => {})
  }

  const isReviewed = !!reviewedVerdict

  return (
    <li
      className={`rounded-lg p-3 text-sm border ${
        isReviewed
          ? reviewedVerdict === 'agree'
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-amber-50 border-amber-200'
          : 'bg-slate-50 border-slate-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-slate-700">{feature.feature_id}</div>
          <div className="text-slate-500 text-xs mt-0.5">
            Severity: <span className="font-medium capitalize">{feature.severity}</span>
          </div>
          {feature.evidence && (
            <p className="mt-2 text-slate-600 text-xs leading-relaxed">{feature.evidence}</p>
          )}
        </div>
        {isReviewed ? (
          <span className="shrink-0 flex items-center gap-1 text-xs font-medium capitalize" aria-label={`Reviewed: ${reviewedVerdict}`}>
            <span className={reviewedVerdict === 'agree' ? 'text-emerald-600' : 'text-amber-600'}>
              {reviewedVerdict === 'agree' ? '✓ Agreed' : '✗ Disagreed'}
            </span>
          </span>
        ) : null}
      </div>
      {!isReviewed && (
        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={() => handleVerdict('agree')}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
          >
            Agree
          </button>
          <button
            type="button"
            onClick={() => handleVerdict('disagree')}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
          >
            Disagree
          </button>
        </div>
      )}
    </li>
  )
}

function PropertyReviewView({ property }) {
  const rooms = getRoomsWithFeatures(property)
  const [reviewedFeedback, setReviewedFeedback] = useState({})

  const feedbackKey = (roomType, featureId, index) => `${roomType}-${featureId}-${index}`

  const handleFeedback = (roomType, featureId, index, verdict) => {
    setReviewedFeedback((prev) => ({
      ...prev,
      [feedbackKey(roomType, featureId, index)]: verdict,
    }))
  }

  return (
    <div className="flex h-full divide-x divide-slate-200">
      {/* Left: rooms and confirmed_features */}
      <div className="w-1/2 min-w-0 overflow-y-auto bg-white p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
          Rooms & confirmed features
        </h3>
        <ul className="space-y-6">
          {rooms.map((room, idx) => (
            <li key={`${room.room_type}-${idx}`} className="border-b border-slate-100 pb-4 last:border-0">
              <h4 className="font-medium text-slate-800 capitalize mb-2">
                {room.room_type.replace(/_/g, ' ')}
              </h4>
              {room.confirmed_features?.length > 0 ? (
                <ul className="space-y-2">
                  {room.confirmed_features.map((f, i) => (
                    <FeatureCard
                      key={`${f.feature_id}-${i}`}
                      property={property}
                      room={room}
                      feature={f}
                      featureIndex={i}
                      reviewedVerdict={reviewedFeedback[feedbackKey(room.room_type, f.feature_id, i)]}
                      onFeedback={(verdict) => handleFeedback(room.room_type, f.feature_id, i, verdict)}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400 text-sm">No confirmed features</p>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Right: images per room */}
      <div className="w-1/2 min-w-0 overflow-y-auto bg-slate-50 p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-4">
          Images by room
        </h3>
        <ul className="space-y-6">
          {rooms.map((room, idx) => {
            const images = getImagesForRoom(property, room.room_type)
            return (
              <li key={`img-${room.room_type}-${idx}`} className="border-b border-slate-200 pb-4 last:border-0">
                <h4 className="font-medium text-slate-800 capitalize mb-3">
                  {room.room_type.replace(/_/g, ' ')}
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {images.map((img) => (
                    <div key={img.filename} className="rounded-lg overflow-hidden bg-white border border-slate-200 shadow-sm">
                      <img
                        src={getImageUrl(property.property_id, img.filename)}
                        alt={img.filename}
                        className="w-full h-40 object-cover"
                      />
                      <p className="p-2 text-xs text-slate-500 truncate" title={img.filename}>
                        {img.filename}
                      </p>
                    </div>
                  ))}
                </div>
                {images.length === 0 && (
                  <p className="text-slate-400 text-sm">No images</p>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function App() {
  const [properties, setProperties] = useState([])
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`${API_BASE}/properties`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch properties')
        return res.json()
      })
      .then((data) => {
        setProperties(normalizeProperties(data))
        setSelectedProperty(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const formatDate = (isoString) => {
    if (!isoString) return '—'
    try {
      const d = new Date(isoString)
      return d.toLocaleString()
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
            <p className="px-3 py-2 text-sm text-slate-500">Loading…</p>
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
                Choose a property from the sidebar to view details
              </p>
            </div>
          )}
        </header>
        <div className="flex-1 overflow-auto p-0 min-h-0">
          {selectedProperty && (
            <PropertyReviewView property={selectedProperty} />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
