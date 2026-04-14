import { GameLogo } from "@/components/game-logo";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#322116_0%,#0f0c08_45%,#000000_100%)] text-white">
      <div className="px-6 text-center">
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
