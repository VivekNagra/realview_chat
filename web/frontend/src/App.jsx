import { useState, useEffect } from 'react'
import './App.css'
import { fetchFeedback, fetchProperties } from './services/api'
import GroundTruthGallery from './views/GroundTruthGallery'
import SummaryDashboard from './views/SummaryDashboard'
import PropertyReviewView from './views/PropertyReviewView'

function normalizeProperties(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data.property_id !== 'undefined') return [data]
  return []
}

function App() {
  const [properties, setProperties] = useState([])
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [allFeedback, setAllFeedback] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('property')

  useEffect(() => {
    fetchFeedback().then(setAllFeedback)
  }, [])

  useEffect(() => {
    fetchProperties()
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

  const selectPropertyById = (propertyId) => {
    const match = properties.find((p) => String(p.property_id) === String(propertyId))
    if (match) selectProperty(match)
  }

  const openMasterGallery = () => {
    setSelectedProperty(null)
    setViewMode('ground_truth')
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-900">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white shadow-sm flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">RealView</h2>
        </div>

        <div className="px-2 pt-2 space-y-1">
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
          <button
            type="button"
            onClick={() => { setSelectedProperty(null); setViewMode('summary') }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              viewMode === 'summary'
                ? 'bg-indigo-100 text-indigo-800'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            Summary Dashboard
          </button>
        </div>

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

      <main className="flex-1 flex flex-col min-w-0">
        {viewMode === 'summary' ? (
          <SummaryDashboard onNavigateToProperty={selectPropertyById} />
        ) : viewMode === 'ground_truth' ? (
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
