import { useRef, useMemo, useState, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'

interface PatchOverlay {
  patch_id: string
  bounds_wgs84: [number, number, number, number]
  sources: Record<string, number>
}

interface GlobeViewerProps {
  patches: PatchOverlay[]
  selectedPatchId: string | null
  onSelectPatch: (patch: PatchOverlay | null) => void
  dataSource: 'monthly' | 'embedding'
}

// Convert lat/lon to 3D position on sphere
function latLonToVector3(
  lat: number,
  lon: number,
  radius: number
): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

// Earth sphere with tech aesthetic
function Earth() {
  const meshRef = useRef<THREE.Mesh>(null)

  const earthMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: '#0f2440',
      wireframe: false,
    })
  }, [])

  // Wireframe overlay for visibility
  const wireframeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: '#1e3a5f',
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    })
  }, [])

  return (
    <group>
      <mesh ref={meshRef} material={earthMaterial}>
        <sphereGeometry args={[2, 32, 32]} />
      </mesh>
      <mesh material={wireframeMaterial}>
        <sphereGeometry args={[2.01, 16, 16]} />
      </mesh>

      {/* Atmosphere glow */}
      <mesh>
        <sphereGeometry args={[2.15, 32, 32]} />
        <meshBasicMaterial
          color="#22d3ee"
          transparent
          opacity={0.05}
          side={THREE.BackSide}
        />
      </mesh>
    </group>
  )
}

// Patch overlay rectangles on globe
function PatchOverlays({
  patches,
  selectedPatchId,
  onSelectPatch,
  dataSource,
}: GlobeViewerProps) {
  const groupRef = useRef<THREE.Group>(null)

  // Sample patches for display (show every Nth to avoid clutter)
  const displayPatches = useMemo(() => {
    const step = Math.max(1, Math.floor(patches.length / 80))
    return patches.filter((_, i) => i % step === 0)
  }, [patches])

  return (
    <group ref={groupRef}>
      {displayPatches.map((patch) => {
        const [minLon, minLat, maxLon, maxLat] = patch.bounds_wgs84
        const centerLat = (minLat + maxLat) / 2
        const centerLon = (minLon + maxLon) / 2
        const pos = latLonToVector3(centerLat, centerLon, 2.05)

        const isSelected = selectedPatchId === patch.patch_id
        const hasData = Object.keys(patch.sources).length > 0

        const color = dataSource === 'embedding' ? '#f97316' : '#22d3ee'
        const opacity = isSelected ? 0.9 : hasData ? 0.5 : 0.2
        const scale = isSelected ? 1.5 : 1

        return (
          <mesh
            key={patch.patch_id}
            position={pos}
            scale={scale}
            onClick={(e) => {
              e.stopPropagation()
              onSelectPatch(isSelected ? null : patch)
            }}
            onPointerOver={(e) => {
              e.stopPropagation()
              document.body.style.cursor = 'pointer'
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'default'
            }}
          >
            <planeGeometry args={[0.04, 0.04]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={opacity}
              side={THREE.DoubleSide}
            />
            {isSelected && (
              <mesh>
                <ringGeometry args={[0.03, 0.05, 32]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.8}
                  side={THREE.DoubleSide}
                />
              </mesh>
            )}
          </mesh>
        )
      })}
    </group>
  )
}

// Harbin region marker
function RegionMarker() {
  const ref = useRef<THREE.Mesh>(null)
  const pos = latLonToVector3(45.8, 126.55, 2.08)

  useFrame((state) => {
    if (ref.current) {
      ref.current.rotation.z = state.clock.elapsedTime * 0.5
    }
  })

  return (
    <group position={pos}>
      <mesh ref={ref}>
        <ringGeometry args={[0.06, 0.07, 32]} />
        <meshBasicMaterial color="#f97316" transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.02, 16]} />
        <meshBasicMaterial color="#f97316" transparent opacity={1} />
      </mesh>
      {/* Pulse ring */}
      <PulseRing />
    </group>
  )
}

function PulseRing() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame((state) => {
    if (ref.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.3
      ref.current.scale.set(scale, scale, 1)
      const mat = ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = 0.4 - Math.sin(state.clock.elapsedTime * 2) * 0.2
    }
  })
  return (
    <mesh ref={ref}>
      <ringGeometry args={[0.07, 0.075, 32]} />
      <meshBasicMaterial color="#f97316" transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  )
}

// Auto-rotate controller
function AutoRotate({ enabled }: { enabled: boolean }) {
  const { controls } = useThree()
  useEffect(() => {
    const c = controls as any
    if (c) {
      c.autoRotate = enabled
      c.autoRotateSpeed = 0.5
    }
  }, [enabled, controls])
  return null
}

export default function GlobeViewer({
  patches,
  selectedPatchId,
  onSelectPatch,
  dataSource,
}: GlobeViewerProps) {
  const [autoRotate, setAutoRotate] = useState(true)

  return (
    <div className="w-full h-full relative" onMouseEnter={() => setAutoRotate(false)} onMouseLeave={() => setAutoRotate(true)}>
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
        <pointLight position={[-10, -5, -10]} intensity={0.3} color="#22d3ee" />

        <Stars radius={100} depth={50} count={2000} factor={4} saturation={0} fade speed={1} />

        <Earth />
        <PatchOverlays
          patches={patches}
          selectedPatchId={selectedPatchId}
          onSelectPatch={onSelectPatch}
          dataSource={dataSource}
        />
        <RegionMarker />

        <OrbitControls
          enablePan={false}
          enableZoom={true}
          minDistance={3}
          maxDistance={10}
          rotateSpeed={0.5}
        />
        <AutoRotate enabled={autoRotate} />
      </Canvas>

      {/* Legend overlay */}
      <div className="absolute bottom-4 left-4 glass rounded-lg px-4 py-3 text-xs space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-cyan-400/50" />
          <span className="text-slate-400">月度数据</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-orange-500/50" />
          <span className="text-slate-400">Embedding</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-orange-500" />
          <span className="text-slate-400">哈尔滨新区</span>
        </div>
      </div>
    </div>
  )
}
