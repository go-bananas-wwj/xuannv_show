import { useRef, useMemo, useCallback } from 'react'
import { Canvas, useFrame, useLoader } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
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

const HARBIN_LAT = 45.8
const HARBIN_LON = 126.55
const EARTH_RADIUS = 2
const SPREAD_FACTOR = 25

function latLonToVector3(lat: number, lon: number, radius: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  const x = -(radius * Math.sin(phi) * Math.cos(theta))
  const z = radius * Math.sin(phi) * Math.sin(theta)
  const y = radius * Math.cos(phi)
  return new THREE.Vector3(x, y, z)
}

function getInitialCameraPosition(): [number, number, number] {
  const pos = latLonToVector3(HARBIN_LAT, HARBIN_LON, 5.5)
  return [pos.x, pos.y, pos.z]
}

// 真实地球纹理 — 参考 terrabit 风格
function Earth() {
  const [colorMap, normalMap, specularMap] = useLoader(
    THREE.TextureLoader,
    [
      '/textures/earth_atmos_2048.jpg',
      '/textures/earth_normal_2048.jpg',
      '/textures/earth_specular_2048.jpg',
    ]
  )

  // 修正纹理方向
  colorMap.colorSpace = THREE.SRGBColorSpace

  return (
    <group>
      {/* 地球本体 */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS, 64, 64]} />
        <meshStandardMaterial
          map={colorMap}
          normalMap={normalMap}
          roughnessMap={specularMap}
          roughness={0.65}
          metalness={0.05}
          emissive="#001133"
          emissiveIntensity={0.2}
        />
      </mesh>

      {/* 大气层光晕 — 参考 terrabit 边缘散射效果 */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.04, 64, 64]} />
        <meshBasicMaterial
          color="#5ba4ff"
          transparent
          opacity={0.08}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 外层淡光晕 */}
      <mesh>
        <sphereGeometry args={[EARTH_RADIUS * 1.15, 32, 32]} />
        <meshBasicMaterial
          color="#3d8bff"
          transparent
          opacity={0.03}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[5, 3, 5]}
        intensity={1.5}
        color="#fff8e7"
      />
      <directionalLight
        position={[-3, -2, -3]}
        intensity={0.2}
        color="#5ba4ff"
      />
      {/* 边缘补光，让地球背面不完全黑 */}
      <pointLight position={[0, 0, -5]} intensity={0.3} color="#6bb5ff" />
    </>
  )
}

function RegionBoundary({ patches }: { patches: PatchOverlay[] }) {
  const points = useMemo(() => {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
    for (const p of patches) {
      const [wMinLon, wMinLat, wMaxLon, wMaxLat] = p.bounds_wgs84
      minLat = Math.min(minLat, wMinLat)
      maxLat = Math.max(maxLat, wMaxLat)
      minLon = Math.min(minLon, wMinLon)
      maxLon = Math.max(maxLon, wMaxLon)
    }
    const corners = [
      latLonToVector3(maxLat, minLon, EARTH_RADIUS + 0.03),
      latLonToVector3(maxLat, maxLon, EARTH_RADIUS + 0.03),
      latLonToVector3(minLat, maxLon, EARTH_RADIUS + 0.03),
      latLonToVector3(minLat, minLon, EARTH_RADIUS + 0.03),
      latLonToVector3(maxLat, minLon, EARTH_RADIUS + 0.03),
    ]
    return corners
  }, [patches])

  const positions = useMemo(() => new Float32Array(points.flatMap((p) => [p.x, p.y, p.z])), [points])
  if (points.length < 3) return null

  return (
    <line>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ff6b35" transparent opacity={0.8} />
    </line>
  )
}

function createDotTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.7)')
  grad.addColorStop(1, 'transparent')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function spreadLatLon(
  lat: number,
  lon: number,
  centerLat: number,
  centerLon: number,
  factor: number
): [number, number] {
  return [centerLat + (lat - centerLat) * factor, centerLon + (lon - centerLon) * factor]
}

function PatchPoints({
  patches,
  selectedPatchId,
  onSelectPatch,
  dataSource,
}: GlobeViewerProps) {
  const dotTex = useMemo(() => createDotTexture(), [])

  const displayPatches = useMemo(() => {
    if (patches.length <= 200) return patches
    const step = Math.ceil(patches.length / 200)
    return patches.filter((_, i) => i % step === 0)
  }, [patches])

  const { positionArray, colorArray } = useMemo(() => {
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180
    for (const p of patches) {
      const [wMinLon, wMinLat, wMaxLon, wMaxLat] = p.bounds_wgs84
      minLat = Math.min(minLat, wMinLat)
      maxLat = Math.max(maxLat, wMaxLat)
      minLon = Math.min(minLon, wMinLon)
      maxLon = Math.max(maxLon, wMaxLon)
    }
    const cLat = (minLat + maxLat) / 2
    const cLon = (minLon + maxLon) / 2

    const posArr = new Float32Array(displayPatches.length * 3)
    const colArr = new Float32Array(displayPatches.length * 3)

    displayPatches.forEach((patch, i) => {
      const [minLon, minLat, maxLon, maxLat] = patch.bounds_wgs84
      const centerPatchLat = (minLat + maxLat) / 2
      const centerPatchLon = (minLon + maxLon) / 2
      const [spreadLat, spreadLon] = spreadLatLon(centerPatchLat, centerPatchLon, cLat, cLon, SPREAD_FACTOR)
      const pos = latLonToVector3(spreadLat, spreadLon, EARTH_RADIUS + 0.03)
      posArr[i * 3] = pos.x
      posArr[i * 3 + 1] = pos.y
      posArr[i * 3 + 2] = pos.z

      const isSelected = selectedPatchId === patch.patch_id
      const c = new THREE.Color(
        isSelected ? '#ffffff' : dataSource === 'embedding' ? '#ff6b35' : '#00d4ff'
      )
      colArr[i * 3] = c.r
      colArr[i * 3 + 1] = c.g
      colArr[i * 3 + 2] = c.b
    })

    return { positionArray: posArr, colorArray: colArr }
  }, [displayPatches, patches, dataSource, selectedPatchId])

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const intersection = e.intersections?.[0]
    if (intersection && typeof intersection.index === 'number') {
      const idx = intersection.index
      if (idx >= 0 && idx < displayPatches.length) {
        const patch = displayPatches[idx]
        const isSelected = selectedPatchId === patch.patch_id
        onSelectPatch(isSelected ? null : patch)
      }
    }
  }, [displayPatches, onSelectPatch, selectedPatchId])

  return (
    <points
      onClick={handleClick}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'default' }}
    >
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positionArray, 3]} />
        <bufferAttribute attach="attributes-color" args={[colorArray, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.35}
        vertexColors
        map={dotTex}
        transparent
        opacity={0.95}
        sizeAttenuation
        depthTest={false}
        alphaTest={0.01}
      />
    </points>
  )
}

function RegionMarker() {
  const ref1 = useRef<THREE.Mesh>(null)
  const ref2 = useRef<THREE.Mesh>(null)
  const pos = latLonToVector3(HARBIN_LAT, HARBIN_LON, EARTH_RADIUS + 0.04)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (ref1.current) {
      const s = 1 + Math.sin(t * 2) * 0.3
      ref1.current.scale.set(s, s, 1)
      ;(ref1.current.material as THREE.MeshBasicMaterial).opacity = 0.5 - Math.sin(t * 2) * 0.25
    }
    if (ref2.current) {
      ref2.current.rotation.z = t * 0.8
    }
  })

  return (
    <group position={pos}>
      <mesh ref={ref2}>
        <ringGeometry args={[0.1, 0.11, 32]} />
        <meshBasicMaterial color="#ff6b35" transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <circleGeometry args={[0.03, 16]} />
        <meshBasicMaterial color="#ff6b35" />
      </mesh>
      <mesh ref={ref1}>
        <ringGeometry args={[0.11, 0.13, 32]} />
        <meshBasicMaterial color="#ff6b35" transparent opacity={0.4} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

export default function GlobeViewer({
  patches,
  selectedPatchId,
  onSelectPatch,
  dataSource,
}: GlobeViewerProps) {
  const cameraPos = useMemo(() => getInitialCameraPosition(), [])

  return (
    <div className="w-full h-full relative">
      <Canvas
        camera={{ position: cameraPos, fov: 50, near: 0.1, far: 100 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <Stars radius={80} depth={50} count={1500} factor={4} saturation={0} fade speed={1} />
        <Lights />
        <Earth />
        <RegionBoundary patches={patches} />
        <PatchPoints
          patches={patches}
          selectedPatchId={selectedPatchId}
          onSelectPatch={onSelectPatch}
          dataSource={dataSource}
        />
        <RegionMarker />
        <OrbitControls
          enablePan={false}
          minDistance={2.8}
          maxDistance={12}
          rotateSpeed={0.4}
          zoomSpeed={0.8}
          autoRotate
          autoRotateSpeed={0.3}
        />
      </Canvas>

      <div className="absolute bottom-4 left-4 glass rounded-lg px-4 py-3 text-xs space-y-2 select-none">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-cyan-400/60" />
          <span className="text-slate-400">月度数据</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-orange-500/60" />
          <span className="text-slate-400">Embedding</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-2 border-orange-500" />
          <span className="text-slate-400">哈尔滨新区中心</span>
        </div>
        <div className="text-slate-600 text-[10px] mt-1">
          栅格: {patches.length} 个
        </div>
      </div>
    </div>
  )
}
