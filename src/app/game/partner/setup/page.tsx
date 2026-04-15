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

type SetupStep = "welcome" | "verify" | "location" | "profile";
type ContactMethod = "google" | "phone" | "email";

type ExistingProfile = {
  display_name: string;
  age: number;
  city: string;
  bio: string;
  interests: string[] | null;
  photo_url: string | null;
  gallery_urls: string[] | null;
  gender: string | null;
  relationship_goal: string | null;
  preferred_contact_method: string | null;
  contact_value: string | null;
  contact_verified: boolean;
  location_label: string | null;
  latitude: number | null;
  longitude: number | null;
  onboarding_complete: boolean;
  profile_verified: boolean;
  is_photo_verified: boolean;
  is_active: boolean;
};

const codeKeyFor = (playerId: string) => `dating-code:${playerId}`;
const channelLabels: Record<ContactMethod, string> = {
  google: "Google",
  phone: "Phone Number",
  email: "Email",
};

const defaultGoalCards = [
  { title: "Long-term relationship", text: "Date with the intention of building something serious." },
  { title: "Short-term connection", text: "Meet new people and keep things open." },
  { title: "Still figuring it out", text: "Stay open while learning what feels right." },
];

export default function PartnerSetupPage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [step, setStep] = useState<SetupStep>("welcome");
  const [method, setMethod] = useState<ContactMethod>("email");
  const [contactValue, setContactValue] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("18");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("Man");
  const [relationshipGoal, setRelationshipGoal] = useState("Long-term relationship");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [sentCode, setSentCode] = useState("");
  const [contactVerified, setContactVerified] = useState(false);
  const [locationLabel, setLocationLabel] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
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
          .select(
            "display_name, age, city, bio, interests, photo_url, gallery_urls, gender, relationship_goal, preferred_contact_method, contact_value, contact_verified, location_label, latitude, longitude, onboarding_complete, profile_verified, is_photo_verified, is_active"
          )
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError && !profileError.message.toLowerCase().includes("no rows")) {
          setError("Dating setup is missing in Supabase. Run the SQL in supabase/dating_schema.sql first.");
          setLoading(false);
          return;
        }

        const typedProfile = profileData as ExistingProfile | null;
        setPlayer(playerData as PlayerRecord);
        setDisplayName(typedProfile?.display_name || playerData.name || "");
        setAge(String(typedProfile?.age || playerData.age || 18));
        setCity(typedProfile?.city || playerData.country || "");
        setGender(typedProfile?.gender || "Man");
        setRelationshipGoal(typedProfile?.relationship_goal || "Long-term relationship");
        setBio(typedProfile?.bio || "");
        setInterests((typedProfile?.interests || []).join(", "));
        setPhotoUrl(typedProfile?.photo_url || "");
        setGalleryUrls(typedProfile?.gallery_urls || []);
        setMethod((typedProfile?.preferred_contact_method as ContactMethod) || (user.app_metadata?.provider === "google" ? "google" : "email"));
        setContactValue(typedProfile?.contact_value || user.email || "");
        setContactVerified(Boolean(typedProfile?.contact_verified));
        setLocationLabel(typedProfile?.location_label || "");
        setLatitude(typedProfile?.latitude ?? null);
        setLongitude(typedProfile?.longitude ?? null);
        setIsActive(typedProfile?.is_active ?? true);
        setStep(typedProfile?.onboarding_complete ? "profile" : "welcome");
        setLoading(false);
      } catch (loadError) {
        console.error("Dating setup load failed", loadError);
        setError("Could not load dating profile setup.");
        setLoading(false);
      }
    };

    void loadSetup();
  }, []);

  const sendVerificationCode = async (nextMethod: ContactMethod) => {
    if (!player) return;

    const resolvedContact =
      nextMethod === "phone"
        ? contactValue.trim()
        : nextMethod === "google"
          ? contactValue.trim() || displayName.trim() || "Google account"
          : contactValue.trim();

    if (!resolvedContact) {
      setError(nextMethod === "phone" ? "Enter your phone number first." : "We could not find your email address.");
      return;
    }

    const generated = String(Math.floor(100000 + Math.random() * 900000));
    window.sessionStorage.setItem(codeKeyFor(player.id), generated);
    setSentCode(generated);
    setVerificationCode("");
    setMethod(nextMethod);
    setContactValue(resolvedContact);
    setError("");
    setMessage(`A verification code was prepared for ${resolvedContact}.`);
    setStep("verify");

    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification("Life Game Partner Finder", {
          body: `Your ${channelLabels[nextMethod]} verification code is ${generated}.`,
        });
      } else if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        if (permission === "granted") {
          new Notification("Life Game Partner Finder", {
            body: `Your ${channelLabels[nextMethod]} verification code is ${generated}.`,
          });
        }
      }
    }
  };

  const verifyCurrentCode = () => {
    if (!player) return;
    const storedCode = window.sessionStorage.getItem(codeKeyFor(player.id));
    if (!storedCode || verificationCode.trim() !== storedCode) {
      setError("That verification code does not match yet.");
      return;
    }

    setContactVerified(true);
    window.sessionStorage.removeItem(codeKeyFor(player.id));
    setMessage(`${channelLabels[method]} verification completed.`);
    setError("");
    setStep("location");
  };

  const allowLocation = () => {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }

    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = Number(position.coords.latitude.toFixed(6));
        const nextLongitude = Number(position.coords.longitude.toFixed(6));
        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        setLocationLabel(city.trim() || `Live near ${nextLatitude}, ${nextLongitude}`);
        setLocating(false);
        setMessage("Live location captured. You can now finish your profile.");
        setStep("profile");
      },
      () => {
        setLocating(false);
        setError("Location access was denied. Allow it so nearby profiles can work correctly.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const onPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoFiles(Array.from(event.target.files || []).slice(0, 4));
  };

  const uploadPhotos = async () => {
    if (!player) return { primary: photoUrl, gallery: galleryUrls };
    if (photoFiles.length === 0) return { primary: photoUrl, gallery: galleryUrls };

    const uploadedUrls: string[] = [];

    for (const [index, file] of photoFiles.entries()) {
      const extension = file.name.split(".").pop() || "jpg";
      const filePath = `${player.id}/${Date.now()}-${index}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("dating-photos").upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error("Could not upload one of your photos.");
      }

      const { data: publicUrlData } = supabase.storage.from("dating-photos").getPublicUrl(filePath);
      uploadedUrls.push(publicUrlData.publicUrl);
    }

    return { primary: uploadedUrls[0] || photoUrl, gallery: uploadedUrls.length ? uploadedUrls : galleryUrls };
  };

  const saveProfile = async () => {
    if (!player) return;
    if (!contactVerified) {
      setError("Finish the verification step first.");
      return;
    }
    if (!displayName.trim() || !bio.trim() || !city.trim()) {
      setError("Fill in your name, city, and bio first.");
      return;
    }
    if (latitude === null || longitude === null) {
      setError("Allow live location first.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const uploadResult = await uploadPhotos();
      const parsedInterests = interests
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10);

      const { error: upsertError } = await supabase.from("dating_profiles").upsert(
        {
          user_id: player.id,
          display_name: displayName.trim(),
          age: Math.max(18, Number(age) || 18),
          city: city.trim(),
          bio: bio.trim(),
          interests: parsedInterests,
          photo_url: uploadResult.primary || null,
          gallery_urls: uploadResult.gallery,
          gender,
          relationship_goal: relationshipGoal,
          preferred_contact_method: method,
          contact_value: contactValue.trim(),
          contact_verified: true,
          verification_completed_at: new Date().toISOString(),
          location_label: locationLabel.trim() || city.trim(),
          latitude,
          longitude,
          onboarding_complete: true,
          profile_verified: Boolean(uploadResult.primary),
          is_photo_verified: Boolean(uploadResult.primary),
          is_active: isActive,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      if (upsertError) {
        setError("Could not save dating profile. Run the latest SQL in supabase/dating_schema.sql first.");
        setSaving(false);
        return;
      }

      setPhotoUrl(uploadResult.primary || "");
      setGalleryUrls(uploadResult.gallery);
      setMessage("Your dating profile is ready. You can now swipe, explore, and chat.");
      window.location.href = "/game/partner";
    } catch (saveError) {
      console.error("Dating profile save failed", saveError);
      setError(saveError instanceof Error ? saveError.message : "Could not save dating profile right now.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c0b10] text-white">
        <p className="text-2xl font-semibold">Opening dating profile setup...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#ff5b7b_0%,#fd3974_22%,#17171b_22%,#0a0b10_100%)] px-5 py-6 text-white">
      <button
        type="button"
        onClick={() => {
          if (step === "welcome") {
            window.location.href = "/game";
            return;
          }
          if (step === "verify") setStep("welcome");
          if (step === "location") setStep("verify");
          if (step === "profile") setStep("location");
        }}
        className="fixed bottom-4 left-4 z-[80] rounded-full border border-white/15 bg-black/75 px-4 py-3 text-sm font-semibold text-white shadow-xl backdrop-blur transition hover:bg-black/85"
      >
        Back
      </button>

      <div className="mx-auto max-w-md">
        <div className="rounded-[2rem] border border-white/10 bg-black/20 p-5 shadow-2xl backdrop-blur">
          {step === "welcome" ? (
            <>
              <div className="pt-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white/12">
                  <GameLogo className="h-10 w-10" />
                </div>
                <h1 className="mt-6 text-5xl font-black tracking-tight">Find your person</h1>
                <p className="mt-6 text-sm leading-7 text-white/90">
                  By continuing, you agree to build a real dating profile, share a live location for nearby matching, and only upload pictures that belong to you.
                </p>
              </div>

              <div className="mt-10 space-y-4">
                <button
                  onClick={() => void sendVerificationCode("google")}
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100"
                >
                  <span className="text-2xl">G</span>
                  Continue with Google
                </button>
                <div className="rounded-[2rem] border border-white/10 bg-white/10 p-4">
                  <label className="text-xs uppercase tracking-[0.35em] text-white/70">Phone number</label>
                  <input
                    value={method === "phone" ? contactValue : ""}
                    onChange={(event) => {
                      setMethod("phone");
                      setContactValue(event.target.value);
                    }}
                    placeholder="+27 81 234 5678"
                    className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-black outline-none"
                  />
                  <button
                    onClick={() => void sendVerificationCode("phone")}
                    className="mt-3 w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100"
                  >
                    Continue with Phone Number
                  </button>
                </div>
                <button
                  onClick={() => void sendVerificationCode("email")}
                  className="w-full rounded-full border border-white/20 bg-black/20 px-5 py-4 text-lg font-semibold text-white transition hover:bg-black/30"
                >
                  Continue with Email
                </button>
              </div>
            </>
          ) : null}

          {step === "verify" ? (
            <>
              <p className="text-sm uppercase tracking-[0.35em] text-white/60">Verification</p>
              <h1 className="mt-4 text-5xl font-black tracking-tight">Enter your code</h1>
              <p className="mt-4 text-lg text-white/70">{contactValue || "Verification channel selected"}</p>
              <input
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="381117"
                inputMode="numeric"
                className="mt-8 w-full border-b-2 border-pink-400 bg-transparent px-1 py-4 text-center text-5xl font-black tracking-[0.6em] outline-none"
              />
              <p className="mt-5 text-sm text-white/70">Didn&apos;t get anything? No worries, let&apos;s try again.</p>
              <button onClick={() => void sendVerificationCode(method)} className="mt-2 text-sm font-semibold text-sky-300">
                Resend
              </button>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-white/80">
                Current verification method: {channelLabels[method]}
                {sentCode ? <p className="mt-2 text-white/60">Test code for this build: {sentCode}</p> : null}
              </div>
              <button
                onClick={verifyCurrentCode}
                className="mt-8 w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100"
              >
                Next
              </button>
            </>
          ) : null}

          {step === "location" ? (
            <>
              <div className="pt-8 text-center">
                <p className="text-sm uppercase tracking-[0.35em] text-white/60">Live Location</p>
                <h1 className="mt-4 text-4xl font-black tracking-tight">So, are you from around here?</h1>
                <p className="mt-5 text-base leading-7 text-white/70">
                  Set your location to see who&apos;s in your neighborhood or beyond. Nearby matching depends on real live location access.
                </p>
              </div>

              <div className="mx-auto mt-12 flex h-56 w-56 items-center justify-center rounded-full bg-white/90 text-stone-900 shadow-2xl">
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-stone-300 text-4xl">⌖</div>
              </div>

              <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/8 p-5">
                <p className="text-sm uppercase tracking-[0.25em] text-white/60">Access</p>
                <p className="mt-3 text-base leading-7 text-white/80">
                  Allow location only while in use so the partner finder can show verified nearby profiles.
                </p>
                {latitude !== null && longitude !== null ? (
                  <div className="mt-4 rounded-2xl bg-black/25 p-4 text-sm text-white/75">
                    Live coordinates saved: {latitude}, {longitude}
                  </div>
                ) : null}
              </div>

              <button
                onClick={allowLocation}
                disabled={locating}
                className="mt-8 w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100 disabled:opacity-60"
              >
                {locating ? "Allowing..." : "Allow"}
              </button>
            </>
          ) : null}

          {step === "profile" ? (
            <>
              <p className="text-sm uppercase tracking-[0.35em] text-white/60">Create Profile</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight">Build a real dating profile</h1>
              <p className="mt-4 text-sm leading-7 text-white/75">
                Add your real details, relationship goals, live location, and your own pictures. Verified profiles stand out under swipe and explore.
              </p>

              <div className="mt-8 grid gap-4">
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Name" className="rounded-2xl bg-white px-4 py-3 text-black outline-none" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input value={age} onChange={(event) => setAge(event.target.value)} placeholder="Age" type="number" min={18} className="rounded-2xl bg-white px-4 py-3 text-black outline-none" />
                  <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Where are you from?" className="rounded-2xl bg-white px-4 py-3 text-black outline-none" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <select value={gender} onChange={(event) => setGender(event.target.value)} className="rounded-2xl bg-white px-4 py-3 text-black outline-none">
                    <option>Man</option>
                    <option>Woman</option>
                    <option>Non-binary</option>
                    <option>Prefer not to say</option>
                  </select>
                  <select value={relationshipGoal} onChange={(event) => setRelationshipGoal(event.target.value)} className="rounded-2xl bg-white px-4 py-3 text-black outline-none">
                    {defaultGoalCards.map((goal) => (
                      <option key={goal.title}>{goal.title}</option>
                    ))}
                  </select>
                </div>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Write a bio that sounds like you." className="min-h-36 rounded-2xl bg-white px-4 py-3 text-black outline-none" />
                <input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="Interests separated by commas" className="rounded-2xl bg-white px-4 py-3 text-black outline-none" />
                <div className="rounded-[2rem] border border-white/10 bg-white/8 p-4">
                  <label className="text-xs uppercase tracking-[0.35em] text-white/70">Upload pictures</label>
                  <input type="file" accept="image/*" multiple onChange={onPhotoChange} className="mt-3 block w-full text-sm text-white/75" />
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[photoUrl, ...galleryUrls].filter(Boolean).slice(0, 4).map((url) => (
                      <img key={url} src={url} alt="Dating profile" className="h-36 w-full rounded-2xl object-cover" />
                    ))}
                  </div>
                </div>
                <div className="rounded-[2rem] border border-white/10 bg-white/8 p-4">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/70">Verification & location</p>
                  <div className="mt-3 grid gap-3 text-sm text-white/80">
                    <div className="rounded-2xl bg-black/20 p-3">Verified channel: {channelLabels[method]}</div>
                    <div className="rounded-2xl bg-black/20 p-3">Contact: {contactValue}</div>
                    <div className="rounded-2xl bg-black/20 p-3">Live location: {locationLabel || "Captured from browser permission"}</div>
                  </div>
                </div>
              </div>

              <label className="mt-6 flex items-center gap-3 text-sm text-white/85">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
                Show my profile under Swipe and Explore
              </label>

              <button
                onClick={() => void saveProfile()}
                disabled={saving}
                className="mt-8 w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100 disabled:opacity-60"
              >
                {saving ? "Saving..." : "Finish Profile"}
              </button>
            </>
          ) : null}

          {message ? <p className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
          {error ? <p className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
