type GameLogoProps = {
  className?: string;
};

export function GameLogo({ className = "" }: GameLogoProps) {
  return (
    <div
      className={`relative overflow-hidden rounded-[28%] ${className}`}
      aria-label="Life Game Africa logo"
    >
      <img
        src="/game-logo.png"
        alt="Life Game Africa logo"
        draggable={false}
        className="h-full w-full object-cover object-center scale-[1.24] select-none"
        style={{
          filter:
            "brightness(0) saturate(100%) invert(82%) sepia(6%) saturate(278%) hue-rotate(176deg) brightness(96%) contrast(91%) drop-shadow(0 2px 1px rgba(255,255,255,0.45)) drop-shadow(0 10px 18px rgba(0,0,0,0.55))",
        }}
      />
      <div className="pointer-events-none absolute inset-0 rounded-[28%] bg-[linear-gradient(135deg,rgba(255,255,255,0.35)_0%,rgba(255,255,255,0.06)_28%,rgba(255,255,255,0)_48%,rgba(255,255,255,0.12)_78%,rgba(255,255,255,0.3)_100%)] mix-blend-screen" />
    </div>
  );
}
