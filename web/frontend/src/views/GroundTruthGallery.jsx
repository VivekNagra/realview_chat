import { useMemo } from 'react'
import ImageCard from '../components/ui/ImageCard'
import BenchmarkingReport from './BenchmarkingReport'

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

export default function GroundTruthGallery({ properties, allFeedback, onNavigateToProperty, onReset }) {
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

      <BenchmarkingReport allFeedback={allFeedback} onReset={onReset} />

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
                  onScoreFeedback={() => {}}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
