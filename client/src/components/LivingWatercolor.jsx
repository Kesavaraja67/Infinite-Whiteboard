export const LivingWatercolor = () => (
  <div className="fixed inset-0 -z-10 bg-white overflow-hidden pointer-events-none">
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <filter id="watercolor-bleed">
        <feTurbulence type="fractalNoise" baseFrequency="0.01 0.03" numOctaves="3" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="100" />
      </filter>
    </svg>
    <div className="watercolor-canvas">
      <div className="splotch splotch-1"></div>
      <div className="splotch splotch-2"></div>
    </div>
  </div>
)
