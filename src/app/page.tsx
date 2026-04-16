import { GameLogo } from "@/components/game-logo";

export default function Home() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#04111c] text-white">
      <div className="game-background-photo absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(1,9,16,0.1)_0%,rgba(1,7,13,0.32)_47%,rgba(0,0,0,0.88)_100%)]" />

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
