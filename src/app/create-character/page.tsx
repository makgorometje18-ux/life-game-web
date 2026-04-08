"use client";

import { useState } from "react";

export default function CreateCharacterPage() {
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");

    const startGame = () => {
     localStorage.setItem("playerName", name);
     localStorage.setItem("playerGender", gender);
     localStorage.setItem("playerCountry", country);

     window.location.href = "/game";
    };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-md flex flex-col gap-4">
        <h1 className="text-4xl font-bold text-center mb-4">
          Create Your Character
        </h1>

        <input
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white text-black border border-gray-300 outline-none"
        />

        <select
          value={gender}
          onChange={(e) => setGender(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white text-black border border-gray-300 outline-none"
        >
          <option value="">Select Gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </select>

        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="w-full px-4 py-3 rounded-xl bg-white text-black border border-gray-300 outline-none"
        >
          <option value="">Select Country</option>
          <option value="South Africa">South Africa</option>
          <option value="Nigeria">Nigeria</option>
          <option value="Kenya">Kenya</option>
        </select>

        <button
          onClick={startGame}
          className="mt-2 bg-white text-black px-6 py-3 rounded-xl font-semibold"
        >
          Start Game
        </button>
      </div>
    </main>
  );
}