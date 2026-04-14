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
      />
    </div>
  );
}
