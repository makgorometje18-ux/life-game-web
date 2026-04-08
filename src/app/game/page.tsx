"use client";

import { useEffect, useState } from "react";

export default function GamePage() {
  const [name, setName] = useState("Player");
  const [country, setCountry] = useState("Unknown");
  const [age, setAge] = useState(10);
  const [money, setMoney] = useState(500);

  useEffect(() => {
    const savedName = localStorage.getItem("playerName");
    const savedCountry = localStorage.getItem("playerCountry");
    const savedAge = localStorage.getItem("playerAge");
    const savedMoney = localStorage.getItem("playerMoney");

    if (savedName) setName(savedName);
    if (savedCountry) setCountry(savedCountry);
    if (savedAge) {
     setAge(Number(savedAge));
    } else {
    localStorage.setItem("playerAge", "10");
    }
    if (savedMoney) setMoney(Number(savedMoney));
  }, []);

  const ageUp = () => {
    const newAge = age + 1;
    setAge(newAge);
    localStorage.setItem("playerAge", String(newAge));
  };

  const goToSchool = () => {
    const newMoney = money - 100;
    setMoney(newMoney);
    localStorage.setItem("playerMoney", String(newMoney));
    alert("You paid school fees.");
  };

  const lookForJob = () => {
    const newMoney = money + 250;
    setMoney(newMoney);
    localStorage.setItem("playerMoney", String(newMoney));
    alert("You found part-time work and earned money.");
  };

  const startHustle = () => {
    const newMoney = money + 400;
    setMoney(newMoney);
    localStorage.setItem("playerMoney", String(newMoney));
    alert("Your hustle made profit.");
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-2xl bg-zinc-900 rounded-2xl p-8 shadow-lg">
        <h1 className="text-4xl font-bold mb-6 text-center">Your Life Begins</h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Name</p>
            <p className="text-xl font-semibold">{name}</p>
          </div>

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Age</p>
            <p className="text-xl font-semibold">{age}</p>
          </div>

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Money</p>
            <p className="text-xl font-semibold">R {money}</p>
          </div>

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Country</p>
            <p className="text-xl font-semibold">{country}</p>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={ageUp}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold"
          >
            Next Year
          </button>

          <button
            onClick={goToSchool}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold"
          >
            Go to School
          </button>

          <button
            onClick={lookForJob}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold"
          >
            Look for a Job
          </button>

          <button
            onClick={startHustle}
            className="w-full bg-white text-black py-3 rounded-xl font-semibold"
          >
            Start a Hustle
          </button>
        </div>
      </div>
    </main>
  );
}