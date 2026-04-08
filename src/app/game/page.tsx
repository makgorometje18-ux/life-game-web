export default function GamePage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-2xl bg-zinc-900 rounded-2xl p-8 shadow-lg">
        <h1 className="text-4xl font-bold mb-6 text-center">Your Life Begins</h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Name</p>
            <p className="text-xl font-semibold">Player</p>
          </div>

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Age</p>
            <p className="text-xl font-semibold">18</p>
          </div>

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Money</p>
            <p className="text-xl font-semibold">R 500</p>
          </div>

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Country</p>
            <p className="text-xl font-semibold">South Africa</p>
          </div>
        </div>

        <div className="space-y-3">
          <button className="w-full bg-white text-black py-3 rounded-xl font-semibold">
            Go to School
          </button>

          <button className="w-full bg-white text-black py-3 rounded-xl font-semibold">
            Look for a Job
          </button>

          <button className="w-full bg-white text-black py-3 rounded-xl font-semibold">
            Start a Hustle
          </button>
        </div>
      </div>
    </main>
  );
}