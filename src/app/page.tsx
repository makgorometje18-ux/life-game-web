export default function Home() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="text-center px-6">
        <h1 className="text-4xl md:text-6xl font-bold mb-4">
          Life Game Africa
        </h1>

        <p className="text-lg md:text-xl text-gray-300 mb-6">
          Build your character. Live the world. Play your story.
        </p>

      <a href="/create-character">
        <button className="bg-white text-black px-6 py-3 rounded-xl font-semibold">
        Start Your Life
        </button>
      </a>
      </div>
    </main>
  );
}