type GameLogoProps = {
  className?: string;
};

export function GameLogo({ className = "" }: GameLogoProps) {
  return (
    <img
      src="/game-logo.png"
      alt="Life Game Africa logo"
      draggable={false}
      className={`${className} object-contain select-none`}
    />
  );
}
