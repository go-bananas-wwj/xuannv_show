import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

interface ResultMapViewerProps {
  imageUrl?: string
  center?: [number, number]
  zoom?: number
}

export default function ResultMapViewer({
  imageUrl,
  center = [126.55, 45.8],
  zoom = 11,
}: ResultMapViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap',
          },
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
        ],
      },
      center,
      zoom,
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [center, zoom])

  // Add image overlay when URL changes
  useEffect(() => {
    const map = mapRef.current
    if (!map || !imageUrl) return

    // For demo, show a notification that overlay would be added
    // In production, add raster overlay source/layer
  }, [imageUrl])

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-xl overflow-hidden">
      <div ref={mapContainer} className="w-full h-full" />
      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="glass px-6 py-4 rounded-xl text-center">
            <p className="text-slate-400 text-sm">MapLibre 地图就绪</p>
            <p className="text-slate-500 text-xs mt-1">选择 Task Head 加载结果图层</p>
          </div>
        </div>
      )}
    </div>
  )
}
