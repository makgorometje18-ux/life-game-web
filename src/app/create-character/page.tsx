"use client";

import { useState } from "react";

export default function CreateCharacterPage() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");

  const startGame = () => {
    alert(`Welcome ${name} from ${country}!`);
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6">
      
      <h1 className="text-4xl font-bold mb-8">Create Your Character</h1>

      <input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full max-w-sm mb-4 px-4 py-3 rounded-lg text-black"
      />

      <select
        value={gender}
        onChange={(e) => setGender(e.target.value)}
        className="w-full max-w-sm mb-4 px-4 py-3 rounded-lg text-black"
      >
        <option value="">Select Gender</option>
        <option>Male</option>
        <option>Female</option>
      </select>

      <select
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        className="w-full max-w-sm mb-6 px-4 py-3 rounded-lg text-black"
      >
        <option value="">Select Country</option>
        <option>South Africa</option>
        <option>Nigeria</option>
        <option>Kenya</option>
      </select>

      <button
        onClick={startGame}
        className="bg-white text-black px-6 py-3 rounded-xl font-semibold"
      >
        Start Game
      </button>
    </main>
  );
}