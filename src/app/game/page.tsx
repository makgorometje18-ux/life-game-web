"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function GamePage() {
  const [playerId, setPlayerId] = useState("");
  const [name, setName] = useState("Player");
  const [country, setCountry] = useState("Unknown");
  const [age, setAge] = useState(10);
  const [money, setMoney] = useState(500);
  const [health, setHealth] = useState(100);
  const [happiness, setHappiness] = useState(100);
  const [education, setEducation] = useState(0);
  const [eventMessage, setEventMessage] = useState("Welcome to your life journey.");
  const [loading, setLoading] = useState(true);

  const loadPlayer = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/auth";
      return;
    }

    setPlayerId(user.id);

    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      setEventMessage("Could not load player profile.");
      setLoading(false);
      return;
    }

    setName(data.name || "Player");
    setCountry(data.country || "Unknown");
    setAge(data.age ?? 10);
    setMoney(data.money ?? 500);
    setHealth(data.health ?? 100);
    setHappiness(data.happiness ?? 100);
    setEducation(data.education ?? 0);
    setLoading(false);
  };

  useEffect(() => {
    loadPlayer();
  }, []);

  const savePlayer = async (updates: {
    age?: number;
    money?: number;
    health?: number;
    happiness?: number;
    education?: number;
    country?: string;
    name?: string;
  }) => {
    if (!playerId) return;

    await supabase
      .from("players")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId);
  };

  const ageUp = async () => {
    const newAge = age + 1;
    const newHealth = Math.max(0, health - 2);
    const newHappiness = Math.max(0, happiness - 1);

    setAge(newAge);
    setHealth(newHealth);
    setHappiness(newHappiness);
    setEventMessage(`You are now ${newAge} years old.`);

    await savePlayer({
      age: newAge,
      health: newHealth,
      happiness: newHappiness,
    });
  };

  const goToSchool = async () => {
    if (money < 100) {
      setEventMessage("You do not have enough money for school fees.");
      return;
    }

    const newMoney = money - 100;
    const newEducation = education + 10;
    const newHappiness = Math.max(0, happiness - 5);

    setMoney(newMoney);
    setEducation(newEducation);
    setHappiness(newHappiness);

    const chance = Math.random();

    if (chance < 0.5) {
      setEventMessage("You paid school fees and did well in class. Education increased.");
    } else {
      setEventMessage("You paid school fees, but school was stressful this year.");
    }

    await savePlayer({
      money: newMoney,
      education: newEducation,
      happiness: newHappiness,
    });
  };

  const lookForJob = async () => {
    const chance = Math.random();
    let newMoney = money;
    let newHappiness = happiness;
    let message = "";

    if (chance < 0.4) {
      newHappiness = Math.max(0, happiness - 5);
      message = "No job found this year. You feel disappointed.";
    } else if (chance < 0.8) {
      newMoney = money + 300;
      newHappiness = Math.min(100, happiness + 5);
      message = "You got a job and earned R300.";
    } else {
      newMoney = money + 800;
      newHappiness = Math.min(100, happiness + 10);
      message = "You landed a high-paying job and earned R800.";
    }

    setMoney(newMoney);
    setHappiness(newHappiness);
    setEventMessage(message);

    await savePlayer({
      money: newMoney,
      happiness: newHappiness,
    });
  };

  const startHustle = async () => {
    const chance = Math.random();
    let newMoney = money;
    let newHappiness = happiness;
    let newHealth = health;
    let message = "";

    if (chance < 0.3) {
      newMoney = money - 200;
      newHappiness = Math.max(0, happiness - 10);
      newHealth = Math.max(0, health - 5);
      message = "Your hustle failed and you lost R200.";
    } else if (chance < 0.7) {
      newMoney = money + 400;
      newHappiness = Math.min(100, happiness + 8);
      message = "Your hustle made profit and you earned R400.";
    } else {
      newMoney = money + 1000;
      newHappiness = Math.min(100, happiness + 15);
      message = "Your hustle blew up and earned R1000.";
    }

    setMoney(newMoney);
    setHappiness(newHappiness);
    setHealth(newHealth);
    setEventMessage(message);

    await savePlayer({
      money: newMoney,
      happiness: newHappiness,
      health: newHealth,
    });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-2xl font-semibold">Loading your life...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-4xl bg-zinc-900 rounded-2xl p-8 shadow-lg">
        <h1 className="text-4xl font-bold mb-6 text-center">Your Life Begins</h1>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
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

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Health</p>
            <p className="text-xl font-semibold">{health}</p>
          </div>

          <div className="bg-black rounded-xl p-4">
            <p className="text-gray-400 text-sm">Happiness</p>
            <p className="text-xl font-semibold">{happiness}</p>
          </div>

          <div className="bg-black rounded-xl p-4 md:col-span-3">
            <p className="text-gray-400 text-sm">Education</p>
            <p className="text-xl font-semibold">{education}</p>
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
            onClick={async () => {
              if (playerId) {
                await supabase
                  .from("players")
                  .update({
                    is_online: false,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("id", playerId);
              }

              await supabase.auth.signOut();
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