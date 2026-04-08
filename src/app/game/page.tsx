"use client";

import { useEffect, useState } from "react";

export default function GamePage() {
  const [name, setName] = useState("Player");
  const [country, setCountry] = useState("Unknown");
  const [age, setAge] = useState(10);
  const [money, setMoney] = useState(500);
  const [eventMessage, setEventMessage] = useState("Welcome to your life journey.");

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

    if (savedMoney) {
      setMoney(Number(savedMoney));
    } else {
      localStorage.setItem("playerMoney", "500");
    }
  }, []);

  const ageUp = () => {
    const newAge = age + 1;
    setAge(newAge);
    localStorage.setItem("playerAge", String(newAge));
    setEventMessage(`You are now ${newAge} years old.`);
  };

  const goToSchool = () => {
    if (money < 100) {
      setEventMessage("You do not have enough money for school fees.");
      return;
    }

    const newMoney = money - 100;
    setMoney(newMoney);
    localStorage.setItem("playerMoney", String(newMoney));

    const chance = Math.random();

    if (chance < 0.5) {
      setEventMessage("You paid school fees and did well in class.");
    } else {
      setEventMessage("You paid school fees, but school was very tough this year.");
    }
  };

  const lookForJob = () => {
    const chance = Math.random();
    let newMoney = money;

    if (chance < 0.4) {
      setEventMessage("No job found this year.");
    } else if (chance < 0.8) {
      newMoney = money + 300;
      setEventMessage("You got a job and earned R300.");
    } else {
      newMoney = money + 800;
      setEventMessage("You landed a high-paying job and earned R800.");
    }

    setMoney(newMoney);
    localStorage.setItem("playerMoney", String(newMoney));
  };

  const startHustle = () => {
    const chance = Math.random();
    let newMoney = money;

    if (chance < 0.3) {
      newMoney = money - 200;
      setEventMessage("Your hustle failed and you lost R200.");
    } else if (chance < 0.7) {
      newMoney = money + 400;
      setEventMessage("Your hustle made profit and you earned R400.");
    } else {
      newMoney = money + 1000;
      setEventMessage("Your hustle blew up and earned R1000.");
    }

    setMoney(newMoney);
    localStorage.setItem("playerMoney", String(newMoney));
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
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

        <div className="bg-black rounded-xl p-4 mb-6">
          <p className="text-gray-400 text-sm mb-2">Latest Event</p>
          <p className="text-lg font-medium">{eventMessage}</p>
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

          <button
            onClick={() => {
              localStorage.clear();
              window.location.href = "/";
            }}
            className="w-full bg-red-500 text-white py-3 rounded-xl font-semibold mt-3"
          >
            Restart Life
          </button>
        </div>
      </div>
    </main>
  );
}