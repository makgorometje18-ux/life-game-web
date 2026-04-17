"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { GameLogo } from "@/components/game-logo";
import { requestNotificationPermission } from "@/lib/browser-notifications";
import { supabase } from "@/lib/supabase";

type PlayerRecord = {
  id: string;
  name: string | null;
  age: number | null;
  country: string | null;
  email?: string | null;
};

type SetupStep = "welcome" | "contact" | "verify" | "location" | "profile";
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
  selfie_url: string | null;
  face_match_score: number | null;
  is_active: boolean;
};

const startingSrdGrant = 370;

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

const africanDialCodes = [
  { country: "Algeria", code: "+213" },
  { country: "Angola", code: "+244" },
  { country: "Benin", code: "+229" },
  { country: "Botswana", code: "+267" },
  { country: "Burkina Faso", code: "+226" },
  { country: "Burundi", code: "+257" },
  { country: "Cabo Verde", code: "+238" },
  { country: "Cameroon", code: "+237" },
  { country: "Central African Republic", code: "+236" },
  { country: "Chad", code: "+235" },
  { country: "Comoros", code: "+269" },
  { country: "Congo", code: "+242" },
  { country: "Democratic Republic of the Congo", code: "+243" },
  { country: "Cote d'Ivoire", code: "+225" },
  { country: "Djibouti", code: "+253" },
  { country: "Egypt", code: "+20" },
  { country: "Equatorial Guinea", code: "+240" },
  { country: "Eritrea", code: "+291" },
  { country: "Eswatini", code: "+268" },
  { country: "Ethiopia", code: "+251" },
  { country: "Gabon", code: "+241" },
  { country: "Gambia", code: "+220" },
  { country: "Ghana", code: "+233" },
  { country: "Guinea", code: "+224" },
  { country: "Guinea-Bissau", code: "+245" },
  { country: "Kenya", code: "+254" },
  { country: "Lesotho", code: "+266" },
  { country: "Liberia", code: "+231" },
  { country: "Libya", code: "+218" },
  { country: "Madagascar", code: "+261" },
  { country: "Malawi", code: "+265" },
  { country: "Mali", code: "+223" },
  { country: "Mauritania", code: "+222" },
  { country: "Mauritius", code: "+230" },
  { country: "Morocco", code: "+212" },
  { country: "Mozambique", code: "+258" },
  { country: "Namibia", code: "+264" },
  { country: "Niger", code: "+227" },
  { country: "Nigeria", code: "+234" },
  { country: "Rwanda", code: "+250" },
  { country: "Sao Tome and Principe", code: "+239" },
  { country: "Senegal", code: "+221" },
  { country: "Seychelles", code: "+248" },
  { country: "Sierra Leone", code: "+232" },
  { country: "Somalia", code: "+252" },
  { country: "South Africa", code: "+27" },
  { country: "South Sudan", code: "+211" },
  { country: "Sudan", code: "+249" },
  { country: "Tanzania", code: "+255" },
  { country: "Togo", code: "+228" },
  { country: "Tunisia", code: "+216" },
  { country: "Uganda", code: "+256" },
  { country: "Zambia", code: "+260" },
  { country: "Zimbabwe", code: "+263" },
];

const normalizePhoneNumber = (value: string, dialCode: string) => {
  const compactValue = value.trim().replace(/[\s()-]/g, "");
  const compactDialCode = dialCode.replace("+", "");

  if (!compactValue) return "";
  if (compactValue.startsWith("+")) return compactValue;
  if (compactValue.startsWith("00")) return `+${compactValue.slice(2)}`;
  if (compactValue.startsWith(compactDialCode)) return `+${compactValue}`;
  if (compactValue.startsWith("0")) return `${dialCode}${compactValue.slice(1)}`;

  return `${dialCode}${compactValue}`;
};

const normalizeEmailAddress = (value: string) => value.trim().toLowerCase();

const phoneProviderHelp =
  "Phone verification is not enabled in Supabase yet. Enable Phone Auth and connect an SMS provider in Supabase, then try again.";
const emailProviderHelp =
  "Use the email address you logged in with. Partner email verification uses your existing verified account so you do not need to wait for another code.";
const faceMatchThreshold = 72;
const fingerprintSize = 12;

type ImageSource = File | string;

const loadImageElement = (source: ImageSource) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    let objectUrl = "";

    image.onload = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read one of the photos for verification."));
    };

    if (typeof source === "string") {
      image.crossOrigin = "anonymous";
      image.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      image.src = objectUrl;
    }
  });

const imageFingerprint = async (source: ImageSource) => {
  const image = await loadImageElement(source);
  const canvas = document.createElement("canvas");
  canvas.width = fingerprintSize;
  canvas.height = fingerprintSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) throw new Error("Photo verification is not available in this browser.");

  context.drawImage(image, 0, 0, fingerprintSize, fingerprintSize);
  const pixels = context.getImageData(0, 0, fingerprintSize, fingerprintSize).data;
  const values: number[] = [];

  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index] / 255;
    const green = pixels[index + 1] / 255;
    const blue = pixels[index + 2] / 255;
    values.push((red + green + blue) / 3, red - green, blue - green);
  }

  return values;
};

const compareFingerprints = (first: number[], second: number[]) => {
  const length = Math.min(first.length, second.length);
  if (!length) return 0;

  let difference = 0;
  for (let index = 0; index < length; index += 1) {
    difference += Math.abs(first[index] - second[index]);
  }

  return Math.round(Math.max(0, 100 - (difference / length) * 145));
};

const compareSelfieToPhotos = async (selfie: ImageSource, profilePhotos: ImageSource[]) => {
  const selfieFingerprint = await imageFingerprint(selfie);
  const scores = await Promise.all(
    profilePhotos.map(async (photo) => compareFingerprints(selfieFingerprint, await imageFingerprint(photo)))
  );

  return Math.max(...scores, 0);
};

export default function PartnerSetupPage() {
  const [player, setPlayer] = useState<PlayerRecord | null>(null);
  const [step, setStep] = useState<SetupStep>("welcome");
  const [method, setMethod] = useState<ContactMethod>("email");
  const [contactValue, setContactValue] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState("+27");
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState("18");
  const [city, setCity] = useState("");
  const [gender, setGender] = useState("Man");
  const [relationshipGoal, setRelationshipGoal] = useState("Long-term relationship");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [faceMatchScore, setFaceMatchScore] = useState<number | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
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

  const syncCurrentPlayer = async () => {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error("Your login session changed. Please log in again.");
    }

    const { data: existingPlayer, error: existingPlayerError } = await supabase
      .from("players")
      .select("id, name, age, country, email")
      .eq("id", user.id)
      .maybeSingle();

    if (existingPlayerError) {
      throw new Error(existingPlayerError.message || "Could not check your player record.");
    }

    if (existingPlayer) {
      const typedPlayer = existingPlayer as PlayerRecord;
      setPlayer(typedPlayer);
      return typedPlayer;
    }

    const fallbackEmail = user.email?.trim().toLowerCase() || "";
    const fallbackName = displayName.trim() || player?.name || fallbackEmail.split("@")[0] || "Player";
    const fallbackAge = Math.max(18, Number(age) || player?.age || 18);
    const fallbackCountry = city.trim() || player?.country || "South Africa";

    const { data: createdPlayer, error: createPlayerError } = await supabase
      .from("players")
      .insert({
        id: user.id,
        email: fallbackEmail,
        name: fallbackName,
        age: fallbackAge,
        money: startingSrdGrant,
        country: fallbackCountry,
        is_online: true,
        updated_at: new Date().toISOString(),
      })
      .select("id, name, age, country, email")
      .single();

    if (createPlayerError || !createdPlayer) {
      throw new Error(createPlayerError?.message || "Could not create your player record for photo uploads.");
    }

    const typedPlayer = createdPlayer as PlayerRecord;
    setPlayer(typedPlayer);
    return typedPlayer;
  };

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
          .select("*")
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
        setSelfieUrl(typedProfile?.selfie_url || "");
        setFaceMatchScore(typedProfile?.face_match_score ?? null);
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

  const continueWithMethod = (nextMethod: ContactMethod) => {
    setMethod(nextMethod);
    setError("");
    setMessage("");
    setVerificationCode("");
    setContactVerified(false);
    if (nextMethod === "google") {
      setContactValue((current) => current || "");
    } else if (nextMethod === "email") {
      setContactValue((current) => current || "");
    } else {
      setContactValue("");
    }
    setStep("contact");
  };

  const sendVerificationCode = async () => {
    if (!player) return;
    const resolvedContact = method === "phone" ? normalizePhoneNumber(contactValue, phoneDialCode) : normalizeEmailAddress(contactValue);

    if (!resolvedContact) {
      setError(method === "phone" ? "Enter your phone number first." : "Enter your email address first.");
      return;
    }

    if (method === "phone" && !/^\+\d{10,15}$/.test(resolvedContact)) {
      setError("Enter your phone number with country code, for example +27...");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      if (method === "phone") {
        setContactValue(resolvedContact);
        const { error: otpError } = await supabase.auth.signInWithOtp({
          phone: resolvedContact,
        });

        if (otpError) {
          setError(
            otpError.message.toLowerCase().includes("unsupported phone provider")
              ? phoneProviderHelp
              : otpError.message || phoneProviderHelp
          );
          setSaving(false);
          return;
        }
      } else {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        const accountEmail = normalizeEmailAddress(user?.email || "");

        if (userError || !user || !accountEmail) {
          setError("Your login session changed. Please log in again before opening partner finder.");
          setSaving(false);
          return;
        }

        if (resolvedContact !== accountEmail) {
          setError(emailProviderHelp);
          setSaving(false);
          return;
        }

        setContactValue(accountEmail);
        setVerificationCode("");
        setContactVerified(true);
        setMessage(`${channelLabels[method]} verification completed.`);
        setStep("location");
        setSaving(false);
        return;
      }

      setVerificationCode("");
      setMessage(`A verification code was sent to ${resolvedContact}.`);
      setStep("verify");
    } catch (sendError) {
      console.error("Partner verification send failed", sendError);
      setError("Could not send the verification code right now.");
    } finally {
      setSaving(false);
    }
  };

  const verifyCurrentCode = async () => {
    if (!player) return;
    if (verificationCode.trim().length !== 6) {
      setError("Enter the full 6-digit code first.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const resolvedContact = method === "phone" ? normalizePhoneNumber(contactValue, phoneDialCode) : normalizeEmailAddress(contactValue);
      const verification =
        method === "phone"
          ? await supabase.auth.verifyOtp({
              phone: resolvedContact,
              token: verificationCode.trim(),
              type: "sms",
            })
          : await supabase.auth.verifyOtp({
              email: resolvedContact,
              token: verificationCode.trim(),
              type: "email",
            });

      if (verification.error) {
        setError(verification.error.message || "That verification code does not match yet.");
        setSaving(false);
        return;
      }

      await syncCurrentPlayer();
      setContactVerified(true);
      setMessage(`${channelLabels[method]} verification completed.`);
      setStep("location");
    } catch (verifyError) {
      console.error("Partner verification check failed", verifyError);
      setError("Could not verify the code right now.");
    } finally {
      setSaving(false);
    }
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
    setFaceMatchScore(null);
  };

  const onSelfieChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelfieFile(event.target.files?.[0] || null);
    setFaceMatchScore(null);
  };

  const uploadPhotos = async () => {
    const currentPlayer = await syncCurrentPlayer();
    if (photoFiles.length === 0) return { primary: photoUrl, gallery: galleryUrls };

    const uploadedUrls: string[] = [];

    for (const [index, file] of photoFiles.entries()) {
      const extension = file.name.split(".").pop() || "jpg";
      const filePath = `${currentPlayer.id}/${Date.now()}-${index}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("dating-photos").upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(`Could not upload one of your photos: ${uploadError.message}`);
      }

      const { data: publicUrlData } = supabase.storage.from("dating-photos").getPublicUrl(filePath);
      uploadedUrls.push(publicUrlData.publicUrl);
    }

    return { primary: uploadedUrls[0] || photoUrl, gallery: uploadedUrls.length ? uploadedUrls : galleryUrls };
  };

  const uploadSelfie = async () => {
    const currentPlayer = await syncCurrentPlayer();
    if (!selfieFile) return selfieUrl;

    const extension = selfieFile.name.split(".").pop() || "jpg";
    const filePath = `${currentPlayer.id}/selfie-${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("dating-photos").upload(filePath, selfieFile, { upsert: true });

    if (uploadError) {
      throw new Error(`Could not upload your selfie: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage.from("dating-photos").getPublicUrl(filePath);
    return publicUrlData.publicUrl;
  };

  const verifySelfieMatch = async () => {
    const profilePhotoSources: ImageSource[] = photoFiles.length ? photoFiles : [photoUrl, ...galleryUrls].filter(Boolean);
    const selfieSource = selfieFile || selfieUrl;

    if (!profilePhotoSources.length) {
      throw new Error("Upload at least one profile picture before photo verification.");
    }

    if (!selfieSource) {
      throw new Error("Take or upload a selfie before photo verification.");
    }

    const score = await compareSelfieToPhotos(selfieSource, profilePhotoSources);
    setFaceMatchScore(score);

    if (score < faceMatchThreshold) {
      throw new Error("The selfie does not look close enough to the uploaded pictures yet. Use clear photos of the same person and try again.");
    }

    return score;
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
      const currentPlayer = await syncCurrentPlayer();
      const nextFaceMatchScore = await verifySelfieMatch();
      const uploadResult = await uploadPhotos();
      const nextSelfieUrl = await uploadSelfie();
      const parsedInterests = interests
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10);

      const { error: upsertError } = await supabase.from("dating_profiles").upsert(
        {
          user_id: currentPlayer.id,
          display_name: displayName.trim(),
          age: Math.max(18, Number(age) || 18),
          city: city.trim(),
          bio: bio.trim(),
          interests: parsedInterests,
          photo_url: uploadResult.primary || null,
          gallery_urls: uploadResult.gallery,
          selfie_url: nextSelfieUrl || null,
          face_match_score: nextFaceMatchScore,
          gender,
          relationship_goal: relationshipGoal,
          preferred_contact_method: method,
          contact_value: method === "phone" ? normalizePhoneNumber(contactValue, phoneDialCode) : normalizeEmailAddress(contactValue),
          contact_verified: true,
          verification_completed_at: new Date().toISOString(),
          location_label: locationLabel.trim() || city.trim(),
          latitude,
          longitude,
          onboarding_complete: true,
          profile_verified: Boolean(uploadResult.primary && nextSelfieUrl && nextFaceMatchScore >= faceMatchThreshold),
          is_photo_verified: Boolean(uploadResult.primary && nextSelfieUrl && nextFaceMatchScore >= faceMatchThreshold),
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

      if (typeof window !== "undefined" && Notification.permission === "default") {
        await requestNotificationPermission();
      }

      setPhotoUrl(uploadResult.primary || "");
      setGalleryUrls(uploadResult.gallery);
      setSelfieUrl(nextSelfieUrl || "");
      setFaceMatchScore(nextFaceMatchScore);
      setMessage("Your dating profile is ready and photo verified. You can now swipe, explore, and chat.");
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
          if (step === "contact") setStep("welcome");
          if (step === "verify") setStep("contact");
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
                  onClick={() => continueWithMethod("google")}
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100"
                >
                  <span className="text-2xl">G</span>
                  Continue with Google
                </button>
                <button
                  onClick={() => continueWithMethod("phone")}
                  className="w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100"
                >
                  Continue with Phone Number
                </button>
                <button
                  onClick={() => continueWithMethod("email")}
                  className="w-full rounded-full border border-white/20 bg-black/20 px-5 py-4 text-lg font-semibold text-white transition hover:bg-black/30"
                >
                  Continue with Email
                </button>
              </div>
            </>
          ) : null}

          {step === "contact" ? (
            <>
              <p className="text-sm uppercase tracking-[0.35em] text-white/60">{channelLabels[method]}</p>
              <h1 className="mt-4 text-5xl font-black tracking-tight">Enter your details</h1>
              <p className="mt-4 text-sm leading-7 text-white/70">
                {method === "phone"
                  ? "Enter your real phone number so we can send a verification code."
                  : method === "google"
                    ? "Use the Google email you logged in with to verify instantly."
                    : "Use the email address you logged in with to verify instantly."}
              </p>
              {method === "phone" ? (
                <div className="mt-8 grid gap-3 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)]">
                  <label className="sr-only" htmlFor="phone-country-code">
                    Country code
                  </label>
                  <select
                    id="phone-country-code"
                    value={phoneDialCode}
                    onChange={(event) => setPhoneDialCode(event.target.value)}
                    className="min-w-0 rounded-2xl bg-white px-4 py-4 text-base font-semibold text-black outline-none"
                  >
                    {africanDialCodes.map((item) => (
                      <option key={`${item.country}-${item.code}`} value={item.code}>
                        {item.country} {item.code}
                      </option>
                    ))}
                  </select>
                  <label className="sr-only" htmlFor="phone-number">
                    Phone number
                  </label>
                  <input
                    id="phone-number"
                    value={contactValue}
                    onChange={(event) => setContactValue(event.target.value)}
                    placeholder="Phone"
                    inputMode="tel"
                    autoComplete="tel"
                    className="min-w-0 rounded-2xl bg-white px-4 py-4 text-lg text-black outline-none"
                  />
                </div>
              ) : (
                <input
                  value={contactValue}
                  onChange={(event) => setContactValue(event.target.value)}
                  placeholder="name@gmail.com"
                  inputMode="email"
                  autoComplete="email"
                  className="mt-8 w-full rounded-2xl bg-white px-4 py-4 text-lg text-black outline-none"
                />
              )}
              <button
                onClick={() => void sendVerificationCode()}
                disabled={saving}
                className="mt-8 w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100 disabled:opacity-60"
              >
                {saving ? (method === "phone" ? "Sending..." : "Checking...") : "Continue"}
              </button>
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
              <button onClick={() => void sendVerificationCode()} className="mt-2 text-sm font-semibold text-sky-300">
                Resend
              </button>
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/8 p-4 text-sm text-white/80">
                Current verification method: {channelLabels[method]}
              </div>
              <button
                onClick={() => void verifyCurrentCode()}
                disabled={saving}
                className="mt-8 w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100 disabled:opacity-60"
              >
                {saving ? "Checking..." : "Next"}
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
                <div className="rounded-[2rem] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.28)]">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/70">Upload pictures</p>
                  <label className="group mt-4 flex min-h-36 cursor-pointer items-center gap-4 rounded-[1.5rem] border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05)_46%,rgba(0,0,0,0.28))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-12px_22px_rgba(0,0,0,0.32),0_16px_0_rgba(0,0,0,0.3),0_24px_38px_rgba(0,0,0,0.38)] transition duration-200 hover:-translate-y-1 hover:border-pink-300/50 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-12px_22px_rgba(0,0,0,0.28),0_20px_0_rgba(0,0,0,0.28),0_30px_48px_rgba(0,0,0,0.42)] active:translate-y-2 active:shadow-[inset_0_5px_16px_rgba(0,0,0,0.45),0_6px_0_rgba(0,0,0,0.35),0_12px_24px_rgba(0,0,0,0.34)]">
                    <input type="file" accept="image/*" multiple onChange={onPhotoChange} className="sr-only" />
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.25rem] border border-white/20 bg-white text-lg font-black text-stone-950 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.18),0_12px_24px_rgba(0,0,0,0.35)] transition group-active:translate-y-1">
                      PIC
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xl font-black text-white">Choose profile photos</span>
                      <span className="mt-2 block text-sm leading-6 text-white/72">
                        {photoFiles.length
                          ? `${photoFiles.length} new photo${photoFiles.length === 1 ? "" : "s"} ready`
                          : galleryUrls.length || photoUrl
                            ? "Tap to replace or add more photos"
                            : "Tap to open your gallery and upload real pictures"}
                      </span>
                    </span>
                  </label>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[photoUrl, ...galleryUrls].filter(Boolean).slice(0, 4).map((url) => (
                      <img key={url} src={url} alt="Dating profile" className="h-36 w-full rounded-2xl object-cover" />
                    ))}
                  </div>
                </div>
                <div className="rounded-[2rem] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.28)]">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/70">Selfie verification</p>
                  <label className="group mt-4 flex min-h-36 cursor-pointer items-center gap-4 rounded-[1.5rem] border border-sky-200/20 bg-[linear-gradient(145deg,rgba(125,211,252,0.22),rgba(255,255,255,0.06)_48%,rgba(0,0,0,0.34))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-12px_22px_rgba(0,0,0,0.32),0_16px_0_rgba(0,0,0,0.3),0_24px_38px_rgba(0,0,0,0.38)] transition duration-200 hover:-translate-y-1 hover:border-sky-200/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.24),inset_0_-12px_22px_rgba(0,0,0,0.28),0_20px_0_rgba(0,0,0,0.28),0_30px_48px_rgba(0,0,0,0.42)] active:translate-y-2 active:shadow-[inset_0_5px_16px_rgba(0,0,0,0.45),0_6px_0_rgba(0,0,0,0.35),0_12px_24px_rgba(0,0,0,0.34)]">
                    <input type="file" accept="image/*" capture="user" onChange={onSelfieChange} className="sr-only" />
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[1.25rem] border border-white/20 bg-white text-base font-black text-stone-950 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.18),0_12px_24px_rgba(0,0,0,0.35)] transition group-active:translate-y-1">
                      FACE
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xl font-black text-white">Take verification selfie</span>
                      <span className="mt-2 block break-words text-sm leading-6 text-white/72">
                        {selfieFile?.name || (selfieUrl ? "Saved selfie ready for matching" : "Tap to open your camera and prove it is you")}
                      </span>
                    </span>
                  </label>
                  <div className="mt-4 grid gap-3 text-sm text-white/80">
                    <div className="rounded-2xl bg-black/20 p-3">
                      Selfie: {selfieFile?.name || (selfieUrl ? "Saved" : "Needed before verified badge")}
                    </div>
                    <div className="rounded-2xl bg-black/20 p-3">
                      Face match: {faceMatchScore === null ? "Not checked yet" : `${faceMatchScore}%`}
                    </div>
                    <div className="rounded-2xl bg-black/20 p-3">
                      Verified badge: {faceMatchScore !== null && faceMatchScore >= faceMatchThreshold ? "Ready" : "Selfie must match your uploaded pictures"}
                    </div>
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
