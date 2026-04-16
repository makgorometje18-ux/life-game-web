import { GameLogo } from "@/components/game-logo";

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#163f60_0%,#071624_42%,#03070d_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="game-neon-map absolute inset-x-0 top-0 h-[82vh] opacity-95" />
        <div className="game-map-grid absolute inset-0 opacity-45" />
        <span className="game-map-pin left-[10%] top-[43%]" />
        <span className="game-map-pin game-map-pin-lg left-[31%] top-[28%]" />
        <span className="game-map-pin game-map-pin-xl left-[50%] top-[19%]" />
        <span className="game-map-pin game-map-pin-lg left-[68%] top-[28%]" />
        <span className="game-map-pin game-map-pin-xl left-[84%] top-[39%]" />
        <span className="game-map-ripple left-[9%] top-[59%]" />
        <span className="game-map-ripple game-map-ripple-lg left-[31%] top-[41%]" />
        <span className="game-map-ripple game-map-ripple-xl left-[50%] top-[48%]" />
        <span className="game-map-ripple game-map-ripple-lg left-[68%] top-[41%]" />
        <span className="game-map-ripple game-map-ripple-xl left-[83%] top-[62%]" />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(5,14,24,0.12)_0%,rgba(3,8,15,0.64)_52%,rgba(0,0,0,0.95)_100%)]" />

      <div className="relative z-10 px-6 text-center">
        <div className="mx-auto flex w-fit flex-col items-center">
          <GameLogo className="h-40 w-40 text-white" />
        </div>
        <h1 className="mb-4 text-4xl font-bold md:text-6xl">
          Life Game Africa
        </h1>

        <p className="mb-6 text-lg text-gray-300 md:text-xl">
          Build your character. Live the world. Play your story.
        </p>

        <a href="/auth">
          <button className="rounded-xl bg-white px-6 py-3 font-semibold text-black">
            Start Your Life
          </button>
        </a>
      </div>
    </main>
  );
}
