"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { GameLogo } from "@/components/game-logo";
import { supabase } from "@/lib/supabase";

type PlayerRecord = {
  id: string;
  name: string | null;
  age: number | null;
  country: string | null;
};

export default function PartnerSetupPage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("18");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const loadSetup = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = "/auth";
          return;
        }

        const { data: playerData, error: playerError } = await supabase
          .from("players")
          .select("id, name, age, country")
          .eq("id", user.id)
          .single();

        if (playerError || !playerData) {
          setError(playerError?.message || "Could not load your player record.");
          setLoading(false);
          return;
        }

        const { data: profileData, error: profileError } = await supabase
          .from("dating_profiles")
          .select("display_name, age, city, bio, interests, photo_url, is_active")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError && !profileError.message.toLowerCase().includes("no rows")) {
          setError("Dating setup is missing in Supabase. Run the SQL in supabase/dating_schema.sql first.");
          setLoading(false);
          return;
        }

        setPlayer(playerData as PlayerRecord);
        setDisplayName(profileData?.display_name || playerData.name || "");
        setAge(String(profileData?.age || playerData.age || 18));
        setCity(profileData?.city || playerData.country || "");
        setBio(profileData?.bio || "");
        setInterests((profileData?.interests || []).join(", "));
        setPhotoUrl(profileData?.photo_url || "");
        setIsActive(profileData?.is_active ?? true);
        setLoading(false);
      } catch (loadError) {
        console.error("Dating setup load failed", loadError);
        setError("Could not load dating profile setup.");
        setLoading(false);
      }
    };

    void loadSetup();
  }, []);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoFile(event.target.files?.[0] || null);
  };

  const saveProfile = async () => {
    if (!player) return;
    if (!displayName.trim() || !bio.trim() || !city.trim()) {
      setError("Fill in your name, city, and bio first.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    let nextPhotoUrl = photoUrl;

    try {
      if (photoFile) {
        const extension = photoFile.name.split(".").pop() || "jpg";
        const filePath = `${player.id}/${Date.now()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("dating-photos")
          .upload(filePath, photoFile, { upsert: true });

        if (uploadError) {
          setError("Could not upload your photo. Make sure the storage bucket exists.");
          setSaving(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage.from("dating-photos").getPublicUrl(filePath);
        nextPhotoUrl = publicUrlData.publicUrl;
      }

      const parsedInterests = interests
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);

      const { error: upsertError } = await supabase.from("dating_profiles").upsert(
        {
          user_id: player.id,
          display_name: displayName.trim(),
          age: Math.max(18, Number(age) || 18),
          city: city.trim(),
          bio: bio.trim(),
          interests: parsedInterests,
          photo_url: nextPhotoUrl || null,
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (upsertError) {
        setError("Could not save dating profile. Run the SQL in supabase/dating_schema.sql first.");
        setSaving(false);
        return;
      }

      setPhotoUrl(nextPhotoUrl);
      setMessage("Dating profile saved. You can now open the real partner finder.");
    } catch (saveError) {
      console.error("Dating profile save failed", saveError);
      setError("Could not save dating profile right now.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-[#0c0b10] text-white"><p className="text-2xl font-semibold">Opening dating profile setup...</p></main>;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#251724_0%,#0d0b10_45%,#020202_100%)] px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-black/45 p-8 shadow-2xl">
        <div className="flex items-center gap-4">
          <GameLogo className="h-16 w-16" />
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-stone-400">Dating Profile Setup</p>
            <h1 className="mt-2 text-4xl font-black">Create Your Real Profile</h1>
          </div>
        </div>

        <p className="mt-5 max-w-3xl text-base leading-7 text-stone-300">
          Real players build their own profile here, upload their own picture, and choose whether they want to appear in the partner finder.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="rounded-2xl bg-white px-4 py-3 text-black" />
          <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Age" type="number" min={18} className="rounded-2xl bg-white px-4 py-3 text-black" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="rounded-2xl bg-white px-4 py-3 text-black" />
          <input value={interests} onChange={(e) => setInterests(e.target.value)} placeholder="Interests separated by commas" className="rounded-2xl bg-white px-4 py-3 text-black" />
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Write your dating bio" className="min-h-36 rounded-2xl bg-white px-4 py-3 text-black md:col-span-2" />
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 md:col-span-2">
            <label className="text-sm uppercase tracking-[0.25em] text-stone-300">Upload your picture</label>
            <input type="file" accept="image/*" onChange={onFileChange} className="mt-3 block w-full text-sm text-stone-300" />
            {photoUrl ? <img src={photoUrl} alt="Dating profile preview" className="mt-4 h-48 w-40 rounded-2xl object-cover" /> : null}
          </div>
        </div>

        <label className="mt-6 flex items-center gap-3 text-sm text-stone-200">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Make my dating profile visible to other players
        </label>

        {error ? <p className="mt-6 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        {message ? <p className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button onClick={() => void saveProfile()} disabled={saving} className="rounded-2xl bg-fuchsia-400 px-4 py-3 font-semibold text-slate-950 transition hover:bg-fuchsia-300 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? "Saving Profile..." : "Save Dating Profile"}
          </button>
          <button onClick={() => { window.location.href = "/game/partner"; }} className="rounded-2xl bg-white/10 px-4 py-3 font-semibold text-white transition hover:bg-white/20">
            Open Partner Finder
          </button>
        </div>
      </div>
    </main>
  );
}
