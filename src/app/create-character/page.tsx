export default function CreateCharacterPage() {
  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      <h1 className="text-4xl font-bold mb-6">Create Your Character</h1>

      <input
        type="text"
        placeholder="Enter your name"
        className="w-full max-w-sm mb-4 px-4 py-3 rounded-lg text-black"
      />

      <select className="w-full max-w-sm mb-4 px-4 py-3 rounded-lg text-black">
        <option>Select Gender</option>
        <option>Male</option>
        <option>Female</option>
      </select>

      <select className="w-full max-w-sm mb-6 px-4 py-3 rounded-lg text-black">
        <option>Select Country</option>
        <option>South Africa</option>
        <option>Nigeria</option>
        <option>Kenya</option>
      </select>

      <button className="bg-white text-black px-6 py-3 rounded-xl font-semibold">
        Start Game
      </button>
    </main>
  );
}