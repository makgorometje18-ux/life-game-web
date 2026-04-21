"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import type { FaceLandmarker, FaceLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
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
type LivenessStepId = "face" | "mouth" | "blink" | "look-left" | "look-right" | "nod";
type LivenessStatus = "idle" | "starting" | "running" | "scanning" | "verified";
type FaceBox = { x: number; y: number; width: number; height: number };
type LivenessMetrics = {
  mouthOpen: number;
  leftEyeOpen: number;
  rightEyeOpen: number;
  blinkLeft: number;
  blinkRight: number;
  yaw: number;
  pitch: number;
  faceWidth: number;
  blendshapeNames: string[];
};

type BrowserFaceDetector = {
  detect: (source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap) => Promise<Array<{ boundingBox: DOMRectReadOnly }>>;
};

declare global {
  interface Window {
    FaceDetector?: new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => BrowserFaceDetector;
    webkitAudioContext?: typeof AudioContext;
  }
}

type ExistingProfile = {
  display_name: string;
  age: number;
  city: string;
  bio: string;
  interests: string[] | null;
  photo_url: string | null;
  gallery_urls: string[] | null;
  gender: string | null;
  preferred_gender: string | null;
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
  "Phone verification needs Supabase Phone Auth and an SMS provider enabled. Check Supabase Auth phone settings, then try again.";
const emailProviderHelp =
  "Use the email address you logged in with. Partner email verification uses your existing verified account so you do not need to wait for another code.";
const isRegisteredPhoneError = (message: string) => message.toLowerCase().includes("already") && message.toLowerCase().includes("registered");
const missingIsActiveColumnCode = "PGRST204";
const missingColumnPattern = /'([^']+)' column/i;
const faceMatchThreshold = 72;
const fingerprintSize = 12;
const faceLandmarkerModelUrl =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const faceLandmarkerWasmUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm";
const livenessSteps: Array<{ id: LivenessStepId; title: string; detail: string }> = [
  { id: "face", title: "Center your face", detail: "Keep your face inside the frame." },
  { id: "mouth", title: "Open your mouth", detail: "Open your mouth for the live check." },
  { id: "blink", title: "Blink your eyes", detail: "Blink once while looking at the screen." },
  { id: "look-left", title: "Look left", detail: "Turn your head slightly to the left." },
  { id: "look-right", title: "Look right", detail: "Turn your head slightly to the right." },
  { id: "nod", title: "Shake up and down", detail: "Move your head up, then down." },
];

type ImageSource = File | string;
type SchemaFallbackPayload = Record<string, string | number | boolean | string[] | null>;
type SchemaFallbackError = {
  code?: string;
  message: string;
};

const getMissingSchemaColumn = (error: SchemaFallbackError | null) => {
  if (!error || error.code !== missingIsActiveColumnCode) return "";
  return error.message.match(missingColumnPattern)?.[1] || "";
};

const landmarkDistance = (first?: NormalizedLandmark, second?: NormalizedLandmark) => {
  if (!first || !second) return 0;

  return Math.hypot(first.x - second.x, first.y - second.y, (first.z || 0) - (second.z || 0));
};

const scoreForBlendshape = (result: FaceLandmarkerResult, categoryName: string) =>
  result.faceBlendshapes[0]?.categories.find((category) => category.categoryName === categoryName)?.score ?? 0;

const faceBoxFromLandmarks = (landmarks: NormalizedLandmark[], video: HTMLVideoElement): FaceBox | null => {
  if (!landmarks.length) return null;

  const width = video.videoWidth || 640;
  const height = video.videoHeight || 480;
  const xs = landmarks.map((landmark) => landmark.x);
  const ys = landmarks.map((landmark) => landmark.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    x: minX * width,
    y: minY * height,
    width: (maxX - minX) * width,
    height: (maxY - minY) * height,
  };
};

const metricsFromLandmarks = (result: FaceLandmarkerResult): LivenessMetrics | null => {
  const landmarks = result.faceLandmarks[0];
  if (!landmarks?.length) return null;

  const faceWidth = Math.max(0.001, landmarkDistance(landmarks[234], landmarks[454]));
  const mouthOpen = Math.max(scoreForBlendshape(result, "jawOpen"), landmarkDistance(landmarks[13], landmarks[14]) / faceWidth);
  const blinkLeft = scoreForBlendshape(result, "eyeBlinkLeft");
  const blinkRight = scoreForBlendshape(result, "eyeBlinkRight");
  const leftEyeOpen = landmarkDistance(landmarks[159], landmarks[145]) / faceWidth;
  const rightEyeOpen = landmarkDistance(landmarks[386], landmarks[374]) / faceWidth;
  const nose = landmarks[1];
  const faceCenter = {
    x: ((landmarks[234]?.x || 0) + (landmarks[454]?.x || 0)) / 2,
    y: ((landmarks[10]?.y || 0) + (landmarks[152]?.y || 0)) / 2,
  };
  const yaw = ((nose?.x || faceCenter.x) - faceCenter.x) / faceWidth;
  const pitch = ((nose?.y || faceCenter.y) - faceCenter.y) / faceWidth;

  return {
    mouthOpen,
    leftEyeOpen,
    rightEyeOpen,
    blinkLeft,
    blinkRight,
    yaw,
    pitch,
    faceWidth,
    blendshapeNames: result.faceBlendshapes[0]?.categories.map((category) => category.categoryName) || [],
  };
};

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

const upsertDatingProfile = async (payload: SchemaFallbackPayload) => {
  const nextPayload = { ...payload };
  const ignoredColumns: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await supabase.from("dating_profiles").upsert(nextPayload, { onConflict: "user_id" });

    if (!error) return { error: null, ignoredColumns };

    const missingColumn = getMissingSchemaColumn(error);
    if (!missingColumn || !(missingColumn in nextPayload)) return { error, ignoredColumns };

    ignoredColumns.push(missingColumn);
    delete nextPayload[missingColumn];
  }

  return {
    error: {
      message: "Could not save dating profile because the Supabase schema cache is missing too many profile columns.",
    },
    ignoredColumns,
  };
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
  const [preferredGender, setPreferredGender] = useState("All");
  const [relationshipGoal, setRelationshipGoal] = useState("Long-term relationship");
  const [bio, setBio] = useState("");
  const [interests, setInterests] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [photoUrl, setPhotoUrl] = useState("");
  const [selfieUrl, setSelfieUrl] = useState("");
  const [faceMatchScore, setFaceMatchScore] = useState<number | null>(null);
  const [showLivenessCheck, setShowLivenessCheck] = useState(false);
  const [livenessStatus, setLivenessStatus] = useState<LivenessStatus>("idle");
  const [livenessStepIndex, setLivenessStepIndex] = useState(0);
  const [completedLivenessSteps, setCompletedLivenessSteps] = useState<LivenessStepId[]>([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [livenessVerified, setLivenessVerified] = useState(false);
  const [landmarkModelReady, setLandmarkModelReady] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [contactVerified, setContactVerified] = useState(false);
  const [canLoginWithExistingPhone, setCanLoginWithExistingPhone] = useState(false);
  const [phoneOtpMode, setPhoneOtpMode] = useState<"verify" | "login">("verify");
  const [locationLabel, setLocationLabel] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [showLocationPermission, setShowLocationPermission] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const livenessVideoRef = useRef<HTMLVideoElement | null>(null);
  const livenessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const livenessStreamRef = useRef<MediaStream | null>(null);
  const livenessDetectorRef = useRef<BrowserFaceDetector | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const livenessTimerRef = useRef<number | null>(null);
  const livenessStepStartedAtRef = useRef<number>(0);
  const previousFaceCenterRef = useRef<{ x: number; y: number } | null>(null);
  const baselineMetricsRef = useRef<LivenessMetrics | null>(null);
  const latestMetricsRef = useRef<LivenessMetrics | null>(null);
  const scanAudioContextRef = useRef<AudioContext | null>(null);
  const livenessStatusRef = useRef<LivenessStatus>("idle");
  const livenessStepIndexRef = useRef(0);
  const premiumFieldClass =
    "rounded-[1.35rem] border border-white/12 bg-[linear-gradient(145deg,rgba(255,255,255,0.16),rgba(255,255,255,0.07)_48%,rgba(0,0,0,0.28))] px-4 py-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),inset_0_-10px_20px_rgba(0,0,0,0.24),0_14px_32px_rgba(0,0,0,0.22)] outline-none transition placeholder:text-white/45 focus:border-pink-200/55 focus:bg-white/14 focus:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_0_0_3px_rgba(244,114,182,0.16),0_16px_36px_rgba(0,0,0,0.28)]";
  const premiumSelectClass = `${premiumFieldClass} appearance-none`;

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
        setPreferredGender(typedProfile?.preferred_gender || "All");
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

  useEffect(() => {
    livenessStatusRef.current = livenessStatus;
  }, [livenessStatus]);

  useEffect(() => {
    livenessStepIndexRef.current = livenessStepIndex;
  }, [livenessStepIndex]);

  const continueWithMethod = (nextMethod: ContactMethod) => {
    setMethod(nextMethod);
    setError("");
    setMessage("");
    setVerificationCode("");
    setContactVerified(false);
    setCanLoginWithExistingPhone(false);
    setPhoneOtpMode("verify");
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
    setCanLoginWithExistingPhone(false);
    setPhoneOtpMode("verify");

    try {
      if (method === "phone") {
        setContactValue(resolvedContact);
        const { error: otpError } = await supabase.auth.updateUser({
          phone: resolvedContact,
        });

        if (otpError) {
          if (isRegisteredPhoneError(otpError.message)) {
            setCanLoginWithExistingPhone(true);
          }

          setError(
            otpError.message.toLowerCase().includes("phone provider")
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
        setMessage("");
        setStep("location");
        setSaving(false);
        return;
      }

      setVerificationCode("");
      setMessage(
        method === "phone"
          ? `A phone verification code was sent to ${resolvedContact}.`
          : `A verification code was sent to ${resolvedContact}.`
      );
      setStep("verify");
    } catch (sendError) {
      console.error("Partner verification send failed", sendError);
      setError("Could not send the verification code right now.");
    } finally {
      setSaving(false);
    }
  };

  const sendExistingPhoneLoginCode = async () => {
    const resolvedContact = normalizePhoneNumber(contactValue, phoneDialCode);

    if (!/^\+\d{10,15}$/.test(resolvedContact)) {
      setError("Enter your phone number with country code, for example +27...");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      setContactValue(resolvedContact);
      const { error: otpError } = await supabase.auth.signInWithOtp({
        phone: resolvedContact,
        options: {
          shouldCreateUser: false,
        },
      });

      if (otpError) {
        setError(otpError.message || phoneProviderHelp);
        setSaving(false);
        return;
      }

      setPhoneOtpMode("login");
      setCanLoginWithExistingPhone(false);
      setVerificationCode("");
      setMessage(`A login code was sent to ${resolvedContact}.`);
      setStep("verify");
    } catch (sendError) {
      console.error("Existing phone login send failed", sendError);
      setError("Could not send the login code right now.");
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
              type: phoneOtpMode === "login" ? "sms" : "phone_change",
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
      setMessage("");
      setStep("location");
    } catch (verifyError) {
      console.error("Partner verification check failed", verifyError);
      setError("Could not verify the code right now.");
    } finally {
      setSaving(false);
    }
  };

  const openLocationPermission = () => {
    setError("");
    setMessage("");
    setShowLocationPermission(true);
  };

  const allowLocation = () => {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Live location only works on HTTPS. Open the deployed app link and try Allow again.");
      return;
    }

    setShowLocationPermission(false);
    setLocating(true);
    setError("");
    setMessage("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = Number(position.coords.latitude.toFixed(6));
        const nextLongitude = Number(position.coords.longitude.toFixed(6));
        setLatitude(nextLatitude);
        setLongitude(nextLongitude);
        setLocationLabel(city.trim() || `Live near ${nextLatitude}, ${nextLongitude}`);
        setLocating(false);
        setMessage("Live location captured.");
        setStep("profile");
      },
      (positionError) => {
        setLocating(false);
        setError(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location access was denied. Tap Allow again and choose Allow only while in use from your browser popup."
            : "Could not read your live location. Check that GPS/location is turned on, then try again."
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  const stopLivenessCamera = () => {
    if (livenessTimerRef.current !== null) {
      window.clearInterval(livenessTimerRef.current);
      livenessTimerRef.current = null;
    }

    livenessStreamRef.current?.getTracks().forEach((track) => track.stop());
    livenessStreamRef.current = null;

    if (livenessVideoRef.current) {
      livenessVideoRef.current.srcObject = null;
    }
  };

  const closeScanAudio = () => {
    scanAudioContextRef.current?.close().catch(() => undefined);
    scanAudioContextRef.current = null;
  };

  const scanAudioContext = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!scanAudioContextRef.current || scanAudioContextRef.current.state === "closed") {
      scanAudioContextRef.current = new AudioContextClass();
    }

    if (scanAudioContextRef.current.state === "suspended") {
      void scanAudioContextRef.current.resume();
    }

    return scanAudioContextRef.current;
  };

  const playScanTone = (kind: "ready" | "step" | "scan" | "lock" | "error") => {
    if (typeof window === "undefined") return;

    const context = scanAudioContext();
    if (!context) return;

    const now = context.currentTime;
    const master = context.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.connect(context.destination);

    const playTone = (frequency: number, start: number, duration: number, volume: number, type: OscillatorType = "sine") => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.03);
    };

    if (kind === "ready") {
      master.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      playTone(540, now, 0.1, 0.14, "triangle");
      playTone(810, now + 0.11, 0.16, 0.18, "sine");
      return;
    }

    if (kind === "step") {
      master.gain.exponentialRampToValueAtTime(0.22, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      playTone(920, now, 0.08, 0.15, "square");
      playTone(1220, now + 0.06, 0.1, 0.11, "triangle");
      return;
    }

    if (kind === "scan") {
      master.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      playTone(720, now, 0.08, 0.1, "sawtooth");
      return;
    }

    if (kind === "lock") {
      master.gain.exponentialRampToValueAtTime(0.28, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
      playTone(420, now, 0.11, 0.13, "triangle");
      playTone(630, now + 0.13, 0.12, 0.16, "triangle");
      playTone(960, now + 0.28, 0.22, 0.2, "sine");
      return;
    }

    master.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    playTone(220, now, 0.14, 0.12, "sawtooth");
    playTone(180, now + 0.16, 0.16, 0.1, "sawtooth");
  };

  useEffect(() => () => {
    stopLivenessCamera();
    closeScanAudio();
  }, []);

  const resetLivenessCheck = () => {
    setLivenessStatus("idle");
    setLivenessStepIndex(0);
    livenessStatusRef.current = "idle";
    livenessStepIndexRef.current = 0;
    setCompletedLivenessSteps([]);
    setFaceDetected(false);
    setLivenessVerified(false);
    setLandmarkModelReady(false);
    setScanProgress(0);
    setCameraError("");
    previousFaceCenterRef.current = null;
    baselineMetricsRef.current = null;
    latestMetricsRef.current = null;
    livenessStepStartedAtRef.current = 0;
  };

  const loadFaceLandmarker = async () => {
    if (faceLandmarkerRef.current) return faceLandmarkerRef.current;

    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks(faceLandmarkerWasmUrl);
    const options = {
      baseOptions: {
        modelAssetPath: faceLandmarkerModelUrl,
        delegate: "GPU" as const,
      },
      runningMode: "VIDEO" as const,
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };
    let landmarker: FaceLandmarker;

    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, options);
    } catch {
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: {
          modelAssetPath: faceLandmarkerModelUrl,
          delegate: "CPU",
        },
      });
    }

    faceLandmarkerRef.current = landmarker;
    return landmarker;
  };

  const readFaceBox = async (): Promise<FaceBox | null> => {
    const video = livenessVideoRef.current;
    if (!video || video.readyState < 2) return null;

    if (faceLandmarkerRef.current) {
      const result = faceLandmarkerRef.current.detectForVideo(video, performance.now());
      const landmarks = result.faceLandmarks[0];
      const metrics = metricsFromLandmarks(result);
      latestMetricsRef.current = metrics;

      if (!landmarks?.length) return null;
      return faceBoxFromLandmarks(landmarks, video);
    }

    if (!livenessDetectorRef.current && window.FaceDetector) {
      livenessDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    }

    if (livenessDetectorRef.current) {
      const faces = await livenessDetectorRef.current.detect(video);
      const firstFace = faces[0]?.boundingBox;
      if (!firstFace) return null;

      return {
        x: firstFace.x,
        y: firstFace.y,
        width: firstFace.width,
        height: firstFace.height,
      };
    }

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    return {
      x: width * 0.28,
      y: height * 0.16,
      width: width * 0.44,
      height: height * 0.58,
    };
  };

  const captureLiveSelfie = () => {
    const video = livenessVideoRef.current;
    const canvas = livenessCanvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 960;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `live-selfie-${Date.now()}.jpg`, { type: "image/jpeg" });
        setSelfieFile(file);
        setSelfieUrl("");
        setFaceMatchScore(null);
      },
      "image/jpeg",
      0.92
    );
  };

  const completeLivenessStep = (stepId: LivenessStepId) => {
    const currentStepIndex = livenessStepIndexRef.current;
    playScanTone("step");
    setCompletedLivenessSteps((current) => (current.includes(stepId) ? current : [...current, stepId]));

    if (currentStepIndex >= livenessSteps.length - 1) {
      playScanTone("scan");
      setLivenessStatus("scanning");
      livenessStatusRef.current = "scanning";
      setScanProgress(12);
      captureLiveSelfie();
      stopLivenessCamera();

      let progress = 12;
      const scanTimer = window.setInterval(() => {
        progress = Math.min(100, progress + 22);
        setScanProgress(progress);
        playScanTone(progress >= 100 ? "lock" : "scan");

        if (progress >= 100) {
          window.clearInterval(scanTimer);
          setLivenessVerified(true);
          setLivenessStatus("verified");
          livenessStatusRef.current = "verified";
          setMessage("Live selfie passed. The green scan is complete.");
        }
      }, 260);
      return;
    }

    const nextStepIndex = currentStepIndex + 1;
    livenessStepIndexRef.current = nextStepIndex;
    setLivenessStepIndex(nextStepIndex);
    livenessStepStartedAtRef.current = Date.now();
    previousFaceCenterRef.current = null;
  };

  const runLivenessTick = async () => {
    try {
      const nextFaceBox = await readFaceBox();
      setFaceDetected(Boolean(nextFaceBox));

      if (!nextFaceBox || livenessStatusRef.current !== "running") return;

      const currentStep = livenessSteps[livenessStepIndexRef.current];
      const now = Date.now();
      if (!livenessStepStartedAtRef.current) {
        livenessStepStartedAtRef.current = now;
      }

      const center = {
        x: nextFaceBox.x + nextFaceBox.width / 2,
        y: nextFaceBox.y + nextFaceBox.height / 2,
      };
      const previousCenter = previousFaceCenterRef.current;
      previousFaceCenterRef.current = center;

      const elapsed = now - livenessStepStartedAtRef.current;
      const movedX = previousCenter ? Math.abs(center.x - previousCenter.x) : 0;
      const movedY = previousCenter ? Math.abs(center.y - previousCenter.y) : 0;
      const movementDetected = movedX > nextFaceBox.width * 0.025 || movedY > nextFaceBox.height * 0.025;
      const metrics = latestMetricsRef.current;
      const baselineMetrics = baselineMetricsRef.current;
      const averageEyeOpen = metrics ? (metrics.leftEyeOpen + metrics.rightEyeOpen) / 2 : 0;
      const baselineAverageEyeOpen = baselineMetrics ? (baselineMetrics.leftEyeOpen + baselineMetrics.rightEyeOpen) / 2 : 0;
      const landmarkStepPassed = metrics && baselineMetrics
        ? currentStep.id === "mouth"
          ? metrics.mouthOpen > Math.max(0.11, baselineMetrics.mouthOpen + 0.055)
          : currentStep.id === "blink"
            ? metrics.blinkLeft > 0.35 ||
              metrics.blinkRight > 0.35 ||
              (baselineAverageEyeOpen > 0 && averageEyeOpen < baselineAverageEyeOpen * 0.68)
            : currentStep.id === "look-left"
              ? metrics.yaw < baselineMetrics.yaw - 0.04
              : currentStep.id === "look-right"
                ? metrics.yaw > baselineMetrics.yaw + 0.04
              : currentStep.id === "nod"
                ? Math.abs(metrics.pitch - baselineMetrics.pitch) > 0.045
                : false
        : false;

      const stepPassed =
        currentStep.id === "face"
          ? elapsed > 700
          : faceLandmarkerRef.current
            ? landmarkStepPassed
            : currentStep.id === "look-left" || currentStep.id === "look-right"
              ? movementDetected || elapsed > 2100
              : currentStep.id === "nod"
                ? movedY > nextFaceBox.height * 0.025 || elapsed > 2300
                : movementDetected || elapsed > 1800;

      if (stepPassed) {
        if (currentStep.id === "face" && metrics) {
          baselineMetricsRef.current = metrics;
        }
        completeLivenessStep(currentStep.id);
      }
    } catch (scanError) {
      console.error("Live selfie scan failed", scanError);
      setCameraError("The camera opened, but face scanning is not available in this browser.");
    }
  };

  const startLivenessCheck = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Camera access is not available in this browser.");
      return;
    }

    resetLivenessCheck();
    setShowLivenessCheck(true);
    setLivenessStatus("starting");
    livenessStatusRef.current = "starting";
    playScanTone("ready");
    setError("");
    setMessage("");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 720 },
          height: { ideal: 960 },
        },
        audio: false,
      });

      livenessStreamRef.current = stream;
      if (livenessVideoRef.current) {
        livenessVideoRef.current.srcObject = stream;
        await livenessVideoRef.current.play();
      }

      try {
        await loadFaceLandmarker();
        setLandmarkModelReady(true);
      } catch (modelError) {
        console.warn("MediaPipe Face Landmarker could not load", modelError);
        setCameraError("Precise face landmarks could not load, so this browser will use the guided fallback scan.");
      }

      setLivenessStatus("running");
      livenessStatusRef.current = "running";
      livenessStepIndexRef.current = 0;
      livenessStepStartedAtRef.current = Date.now();
      livenessTimerRef.current = window.setInterval(() => void runLivenessTick(), 320);
    } catch (cameraAccessError) {
      console.error("Live selfie camera failed", cameraAccessError);
      playScanTone("error");
      setLivenessStatus("idle");
      livenessStatusRef.current = "idle";
      setCameraError("Camera permission was blocked. Allow camera access and try again.");
    }
  };

  const closeLivenessCheck = () => {
    stopLivenessCamera();
    setShowLivenessCheck(false);
    if (livenessStatus !== "verified") {
      setLivenessStatus("idle");
      livenessStatusRef.current = "idle";
    }
  };

  const onPhotoChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPhotoFiles(Array.from(event.target.files || []).slice(0, 4));
    setFaceMatchScore(null);
  };

  const onSelfieChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSelfieFile(event.target.files?.[0] || null);
    setFaceMatchScore(null);
    setLivenessVerified(false);
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
    if (!livenessVerified && !selfieUrl) {
      setError("Complete the live selfie challenge before finishing your partner profile.");
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

      const profilePayload: SchemaFallbackPayload = {
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
        preferred_gender: preferredGender,
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
      };

      const { error: upsertError, ignoredColumns } = await upsertDatingProfile(profilePayload);

      if (upsertError) {
        console.error("Dating profile upsert failed", upsertError);
        setError(upsertError.message || "Could not save dating profile. Run the latest SQL in supabase/dating_schema.sql first.");
        setSaving(false);
        return;
      }

      if (ignoredColumns.length) {
        console.warn("Dating profile saved without newer Supabase columns", ignoredColumns);
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
    <main
      className={`${step === "profile" ? "min-h-screen overflow-x-hidden px-4 pb-24 pt-24 sm:px-5" : "flex h-[100dvh] overflow-hidden px-3 pb-3 pt-20 sm:px-5 sm:pb-5"} items-center justify-center transition-colors ${
        isLightMode
          ? "bg-[linear-gradient(180deg,#f8fbff_0%,#edf4ff_34%,#ffffff_100%)] text-slate-950"
          : "bg-[linear-gradient(180deg,#ff5b7b_0%,#fd3974_22%,#17171b_22%,#0a0b10_100%)] text-white"
      }`}
    >
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
        className={`fixed left-4 top-4 z-[80] rounded-full px-5 py-3 text-sm font-semibold shadow-xl backdrop-blur transition ${
          isLightMode
            ? "border border-slate-200 bg-white/90 text-slate-950 hover:bg-white"
            : "border border-white/15 bg-black/75 text-white hover:bg-black/85"
        }`}
      >
        Back
      </button>
      <button
        type="button"
        onClick={() => setIsLightMode((current) => !current)}
        className={`fixed right-4 top-4 z-[80] rounded-full px-5 py-3 text-sm font-semibold shadow-xl backdrop-blur transition ${
          isLightMode ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-white text-slate-950 hover:bg-stone-100"
        }`}
      >
        {isLightMode ? "Dark" : "Light"}
      </button>

      <div className={`mx-auto w-full max-w-lg ${step === "profile" ? "" : "max-h-full"}`}>
        <div
          className={`rounded-[2rem] p-4 shadow-2xl backdrop-blur sm:p-5 ${step === "profile" ? "" : "max-h-full overflow-hidden"} ${
            isLightMode ? "border border-slate-200 bg-white/82 text-slate-950" : "border border-white/10 bg-black/25 text-white"
          }`}
        >
          {step === "welcome" ? (
            <>
              <div className="pt-7 text-center max-[380px]:pt-5">
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl max-[380px]:text-3xl">Find your person</h1>
                <p className="mt-5 text-sm leading-7 text-white/90 max-[380px]:mt-3 max-[380px]:leading-6">
                  By continuing, you agree to build a real dating profile, share a live location for nearby matching, and only upload pictures that belong to you.
                </p>
              </div>

              <div className="mt-8 space-y-4 max-[380px]:mt-5 max-[380px]:space-y-3">
                <button
                  onClick={() => continueWithMethod("google")}
                  className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100 max-[380px]:py-3 max-[380px]:text-base"
                >
                  <span className="text-2xl">G</span>
                  Continue with Google
                </button>
                <button
                  onClick={() => continueWithMethod("phone")}
                  className="w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 transition hover:bg-stone-100 max-[380px]:py-3 max-[380px]:text-base"
                >
                  Continue with Phone Number
                </button>
                <button
                  onClick={() => continueWithMethod("email")}
                  className="w-full rounded-full border border-white/20 bg-black/20 px-5 py-4 text-lg font-semibold text-white transition hover:bg-black/30 max-[380px]:py-3 max-[380px]:text-base"
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
              {method === "phone" && canLoginWithExistingPhone ? (
                <button
                  type="button"
                  onClick={() => void sendExistingPhoneLoginCode()}
                  disabled={saving}
                  className="mt-4 w-full rounded-full border border-white/20 bg-white/10 px-5 py-4 text-base font-semibold text-white transition hover:bg-white/15 disabled:opacity-60"
                >
                  {saving ? "Sending login code..." : "This is my number, send login code"}
                </button>
              ) : null}
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
                Current verification method: {method === "phone" && phoneOtpMode === "login" ? "Phone Login" : channelLabels[method]}
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
            <div className="flex h-[calc(100dvh-8.5rem)] min-h-[30rem] max-h-[42rem] flex-col justify-between py-2 text-center max-[380px]:h-[calc(100dvh-7.5rem)] max-[380px]:min-h-0">
              <div className="mx-auto max-w-sm">
                <h1 className="text-3xl font-black leading-tight tracking-tight max-[380px]:text-2xl sm:text-4xl">So, are you from around here?</h1>
                <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-white/62 max-[380px]:mt-3 max-[380px]:leading-5">
                  Set your location to see who&apos;s in your neighborhood or beyond. You won&apos;t be able to match with people otherwise.
                </p>
              </div>

              <div className="relative mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-white/95 text-stone-900 shadow-[0_24px_70px_rgba(255,255,255,0.13),0_0_0_18px_rgba(255,255,255,0.035)] max-[380px]:h-28 max-[380px]:w-28 sm:h-44 sm:w-44">
                <span className="absolute h-9 w-9 rounded-full border-2 border-stone-400 border-b-transparent"></span>
                <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-stone-300 text-4xl">⌖</div>
              </div>

              <button
                onClick={openLocationPermission}
                disabled={locating}
                className="w-full rounded-full bg-white px-5 py-4 text-lg font-semibold text-stone-950 shadow-[0_18px_40px_rgba(0,0,0,0.35)] transition hover:bg-stone-100 active:translate-y-1 disabled:opacity-60 max-[380px]:py-3 max-[380px]:text-base"
              >
                {locating ? "Opening..." : "Allow"}
              </button>
              <button
                type="button"
                className="mx-auto mt-4 flex items-center justify-center gap-3 text-center text-sm font-black leading-6 text-white/80 max-[380px]:mt-3"
                onClick={() =>
                  setMessage("Your location is used only for nearby partner matching and is saved after you approve the device location popup.")
                }
              >
                <span>How is my location used?</span>
                <span className="text-3xl leading-none text-white/70">↓</span>
              </button>
            </div>
          ) : null}

          {step === "profile" ? (
            <>
              <p className="text-sm uppercase tracking-[0.35em] text-white/60">Create Profile</p>
              <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Build a real dating profile</h1>
              <p className="mt-4 text-sm leading-7 text-white/75">
                Add your real details, relationship goals, live location, and your own pictures. Verified profiles stand out under swipe and explore.
              </p>

              <div className="mt-8 grid w-full gap-4">
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Name" className={premiumFieldClass} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <input value={age} onChange={(event) => setAge(event.target.value)} placeholder="Age" type="number" min={18} className={premiumFieldClass} />
                  <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Where are you from?" className={premiumFieldClass} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <select value={gender} onChange={(event) => setGender(event.target.value)} className={premiumSelectClass}>
                    <option>Man</option>
                    <option>Woman</option>
                    <option>Non-binary</option>
                    <option>Prefer not to say</option>
                  </select>
                  <select value={preferredGender} onChange={(event) => setPreferredGender(event.target.value)} className={premiumSelectClass}>
                    <option value="All">Show me everyone</option>
                    <option value="Man">Show me men</option>
                    <option value="Woman">Show me women</option>
                  </select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <select value={relationshipGoal} onChange={(event) => setRelationshipGoal(event.target.value)} className={premiumSelectClass}>
                    {defaultGoalCards.map((goal) => (
                      <option key={goal.title}>{goal.title}</option>
                    ))}
                  </select>
                </div>
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Write a bio that sounds like you." className={`${premiumFieldClass} min-h-36 resize-none`} />
                <input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder="Interests separated by commas" className={premiumFieldClass} />
                <div className="w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.28)] sm:rounded-[2rem]">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/70">Upload pictures</p>
                  <label className="group mt-4 flex min-h-36 w-full cursor-pointer flex-col gap-4 rounded-[1.5rem] border border-white/15 bg-[linear-gradient(145deg,rgba(255,255,255,0.18),rgba(255,255,255,0.05)_46%,rgba(0,0,0,0.28))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-12px_22px_rgba(0,0,0,0.32),0_10px_0_rgba(0,0,0,0.3),0_20px_34px_rgba(0,0,0,0.38)] transition duration-200 hover:-translate-y-1 hover:border-pink-300/50 active:translate-y-2 active:shadow-[inset_0_5px_16px_rgba(0,0,0,0.45),0_4px_0_rgba(0,0,0,0.35),0_12px_24px_rgba(0,0,0,0.34)] sm:flex-row sm:items-center sm:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-12px_22px_rgba(0,0,0,0.32),0_16px_0_rgba(0,0,0,0.3),0_24px_38px_rgba(0,0,0,0.38)]">
                    <input type="file" accept="image/*" multiple onChange={onPhotoChange} className="sr-only" />
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.25rem] border border-white/20 bg-white text-base font-black text-stone-950 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.18),0_12px_24px_rgba(0,0,0,0.35)] transition group-active:translate-y-1 sm:h-20 sm:w-20 sm:text-lg">
                      PIC
                    </span>
                    <span className="min-w-0 max-w-full">
                      <span className="block text-lg font-black leading-tight text-white sm:text-xl">Choose profile photos</span>
                      <span className="mt-2 block break-words text-sm leading-6 text-white/72">
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
                <div className="w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/8 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(0,0,0,0.28)] sm:rounded-[2rem]">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/70">Selfie verification</p>
                  <button
                    type="button"
                    onClick={() => void startLivenessCheck()}
                    className="group mt-4 flex min-h-36 w-full flex-col gap-4 rounded-[1.5rem] border border-sky-200/20 bg-[linear-gradient(145deg,rgba(125,211,252,0.22),rgba(255,255,255,0.06)_48%,rgba(0,0,0,0.34))] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-12px_22px_rgba(0,0,0,0.32),0_10px_0_rgba(0,0,0,0.3),0_20px_34px_rgba(0,0,0,0.38)] transition duration-200 hover:-translate-y-1 hover:border-sky-200/60 active:translate-y-2 active:shadow-[inset_0_5px_16px_rgba(0,0,0,0.45),0_4px_0_rgba(0,0,0,0.35),0_12px_24px_rgba(0,0,0,0.34)] sm:flex-row sm:items-center sm:shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-12px_22px_rgba(0,0,0,0.32),0_16px_0_rgba(0,0,0,0.3),0_24px_38px_rgba(0,0,0,0.38)]"
                  >
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.25rem] border border-white/20 bg-white text-sm font-black text-stone-950 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.18),0_12px_24px_rgba(0,0,0,0.35)] transition group-active:translate-y-1 sm:h-20 sm:w-20 sm:text-base">
                      LIVE
                    </span>
                    <span className="min-w-0 max-w-full">
                      <span className="block text-lg font-black leading-tight text-white sm:text-xl">Start live selfie scan</span>
                      <span className="mt-2 block break-words text-sm leading-6 text-white/72">
                        {livenessVerified
                          ? "Face detected, challenge passed, and selfie captured"
                          : selfieFile?.name || (selfieUrl ? "Saved selfie ready for matching" : "Open camera, follow the face actions, then scan for verification")}
                      </span>
                    </span>
                  </button>
                  <label className="mt-3 block cursor-pointer rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-semibold text-white/75 transition hover:bg-black/30">
                    Backup: upload selfie from camera
                    <input type="file" accept="image/*" capture="user" onChange={onSelfieChange} className="sr-only" />
                  </label>
                  <div className="mt-4 grid w-full gap-3 text-sm text-white/80">
                    <div className="break-words rounded-2xl bg-black/20 p-3">
                      Selfie: {selfieFile?.name || (selfieUrl ? "Saved" : "Needed before verified badge")}
                    </div>
                    <div className="break-words rounded-2xl bg-black/20 p-3">
                      Liveness: {livenessVerified || selfieUrl ? "Passed" : "Open camera and complete the guided scan"}
                    </div>
                    <div className="rounded-2xl bg-black/20 p-3">
                      Face match: {faceMatchScore === null ? "Not checked yet" : `${faceMatchScore}%`}
                    </div>
                    <div className="break-words rounded-2xl bg-black/20 p-3">
                      Verified badge: {faceMatchScore !== null && faceMatchScore >= faceMatchThreshold ? "Ready" : "Selfie must match your uploaded pictures"}
                    </div>
                  </div>
                </div>
                <div className="w-full overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/8 p-4 sm:rounded-[2rem]">
                  <p className="text-xs uppercase tracking-[0.35em] text-white/70">Verification & location</p>
                  <div className="mt-3 grid w-full gap-3 text-sm text-white/80">
                    <div className="w-full rounded-2xl bg-black/20 p-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Verified channel</span>
                      <span className="mt-1 block break-words text-white/85">{channelLabels[method]}</span>
                    </div>
                    <div className="w-full rounded-2xl bg-black/20 p-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Contact</span>
                      <span className="mt-1 block break-words text-white/85">{contactValue}</span>
                    </div>
                    <div className="w-full rounded-2xl bg-black/20 p-3">
                      <span className="block text-xs uppercase tracking-[0.18em] text-white/45">Live location</span>
                      <span className="mt-1 block break-words text-white/85">{locationLabel || "Captured from browser permission"}</span>
                    </div>
                  </div>
                </div>
              </div>

              <label className="mt-6 flex w-full items-start gap-3 rounded-[1.5rem] border border-white/10 bg-white/8 p-4 text-left text-sm leading-6 text-white/85">
                <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} className="mt-1 shrink-0" />
                <span className="min-w-0 break-words">Show my profile under Swipe and Explore</span>
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

          {message ? <p className="mt-6 w-full break-words rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">{message}</p> : null}
          {error ? <p className="mt-4 w-full break-words rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">{error}</p> : null}
        </div>
      </div>

      {showLivenessCheck ? (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-[#020611]/92 px-3 pb-4 backdrop-blur-md sm:items-center sm:pb-0 lg:p-6">
          <div className="flex max-h-[calc(100dvh-1.25rem)] w-full max-w-md flex-col overflow-hidden rounded-[1.5rem] border border-emerald-200/15 bg-[#06101f] text-white shadow-[0_30px_100px_rgba(0,0,0,0.72),0_0_70px_rgba(16,185,129,0.16)] sm:max-h-[calc(100dvh-2rem)] lg:max-h-[calc(100dvh-3rem)] lg:max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:rounded-[2rem]">
            <div className="flex items-start justify-between gap-4 border-b border-emerald-200/10 bg-[#081424] px-5 py-4 lg:col-span-2 lg:py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/70">Biometric security gate</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight">
                  {livenessStatus === "verified"
                    ? "Identity locked"
                    : livenessStatus === "scanning"
                      ? "Encrypting scan..."
                      : livenessSteps[livenessStepIndex]?.title || "Camera check"}
                </h2>
                <p className="mt-1 text-xs font-semibold text-white/45">Face match, motion challenge, and liveness signal</p>
              </div>
              <button
                type="button"
                onClick={closeLivenessCheck}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/10 text-lg font-black text-white transition hover:bg-white/15"
                aria-label="Close live selfie verification"
              >
                x
              </button>
            </div>

            <div className="relative min-h-0 overflow-hidden bg-black lg:flex lg:items-center lg:justify-center">
              <video ref={livenessVideoRef} autoPlay muted playsInline className="aspect-[3/4] max-h-[54dvh] w-full bg-black object-cover sm:max-h-[60dvh] lg:h-full lg:max-h-[calc(100dvh-10rem)] lg:w-auto lg:max-w-full" />
              <canvas ref={livenessCanvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(6,16,31,0.2),transparent_22%,transparent_70%,rgba(6,16,31,0.6))]" />
              <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(110,231,183,0.13)_1px,transparent_1px),linear-gradient(90deg,rgba(110,231,183,0.12)_1px,transparent_1px)] [background-size:44px_44px]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,rgba(16,185,129,0.18),transparent)]" />
              <div className={`pointer-events-none absolute inset-x-0 h-1 bg-emerald-300/80 shadow-[0_0_28px_rgba(110,231,183,0.9)] transition-all duration-300 ${livenessStatus === "scanning" || livenessStatus === "verified" ? "top-[72%]" : faceDetected ? "top-[42%]" : "top-[26%]"}`} />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div
                  className={`relative h-[52%] w-[58%] rounded-[42%] border-[5px] transition ${
                    livenessStatus === "verified" || livenessStatus === "scanning"
                      ? "border-emerald-300 shadow-[0_0_0_10px_rgba(16,185,129,0.14),0_0_55px_rgba(16,185,129,0.8),inset_0_0_28px_rgba(16,185,129,0.16)]"
                      : faceDetected
                        ? "border-emerald-300 shadow-[0_0_0_8px_rgba(16,185,129,0.12),0_0_36px_rgba(16,185,129,0.5),inset_0_0_22px_rgba(16,185,129,0.12)]"
                        : "border-amber-300 shadow-[0_0_0_8px_rgba(251,191,36,0.1),0_0_28px_rgba(251,191,36,0.32)]"
                  }`}
                >
                  <span className="absolute -left-2 -top-2 h-8 w-8 border-l-2 border-t-2 border-white/70" />
                  <span className="absolute -right-2 -top-2 h-8 w-8 border-r-2 border-t-2 border-white/70" />
                  <span className="absolute -bottom-2 -left-2 h-8 w-8 border-b-2 border-l-2 border-white/70" />
                  <span className="absolute -bottom-2 -right-2 h-8 w-8 border-b-2 border-r-2 border-white/70" />
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-4 top-4 rounded-2xl border border-emerald-200/15 bg-black/62 px-4 py-3 text-center text-sm font-bold text-white shadow-[0_16px_40px_rgba(0,0,0,0.35)] backdrop-blur">
                {livenessStatus === "starting"
                  ? "Initializing secure camera..."
                  : livenessStatus === "scanning"
                    ? `Encrypted liveness scan ${scanProgress}%`
                    : livenessStatus === "verified"
                      ? "Identity lock complete"
                      : faceDetected
                        ? livenessSteps[livenessStepIndex]?.detail
                        : "Put your face inside the circle"}
              </div>

              {livenessStatus === "scanning" ? (
                <div className="absolute inset-x-6 bottom-6 overflow-hidden rounded-full border border-emerald-200/20 bg-black/45 p-1 backdrop-blur">
                  <div className="h-2 rounded-full bg-[linear-gradient(90deg,#67e8f9,#6ee7b7,#d9f99d)] transition-all shadow-[0_0_22px_rgba(110,231,183,0.75)]" style={{ width: `${scanProgress}%` }} />
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 z-10 min-h-0 border-t border-emerald-200/10 bg-[#081424]/96 px-4 py-4 shadow-[0_-18px_45px_rgba(0,0,0,0.35)] backdrop-blur lg:static lg:border-l lg:border-t-0 lg:border-emerald-200/10 lg:bg-[#081424] lg:px-5 lg:py-4 lg:shadow-none lg:backdrop-blur-0 max-[420px]:py-3">
              <div className="grid grid-cols-6 gap-2">
                {livenessSteps.map((item) => {
                  const done = completedLivenessSteps.includes(item.id) || livenessStatus === "verified";
                  const active = item.id === livenessSteps[livenessStepIndex]?.id && livenessStatus === "running";

                  return (
                    <div
                      key={item.id}
                      className={`h-2 rounded-full transition ${done ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.75)]" : active ? "bg-sky-300 shadow-[0_0_12px_rgba(125,211,252,0.65)]" : "bg-white/15"}`}
                      title={item.title}
                    />
                  );
                })}
              </div>

              <div className="mt-4 grid gap-3 text-sm text-white/72">
                {cameraError ? <p className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-rose-100">{cameraError}</p> : null}
              </div>

              <button
                type="button"
                onClick={livenessStatus === "verified" ? closeLivenessCheck : () => void startLivenessCheck()}
                className="mt-4 w-full rounded-full bg-[linear-gradient(135deg,#ecfeff,#d9f99d)] px-5 py-3.5 text-base font-black text-slate-950 shadow-[0_18px_35px_rgba(34,197,94,0.22)] transition hover:brightness-105 lg:mt-5 lg:py-4 max-[420px]:py-3 max-[420px]:text-sm"
              >
                {livenessStatus === "verified" ? "Use Verified Selfie" : "Restart Secure Scan"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showLocationPermission ? (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/72 px-3 pb-8 backdrop-blur-[2px] sm:items-center sm:pb-0">
          <div className="w-full max-w-sm overflow-hidden rounded-[1.75rem] bg-[#202124] text-white shadow-[0_28px_90px_rgba(0,0,0,0.62)]">
            <div className="px-6 pb-4 pt-6">
              <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-white/40">
                <span className="h-3 w-3 rounded-full border border-white/70"></span>
              </div>
              <p className="mt-7 text-lg leading-6 text-white/92">Allow Find a Partner to access this device&apos;s location?</p>
            </div>

            <div className="relative h-44 overflow-hidden bg-[#252b3d]">
              <div className="absolute inset-0 opacity-80">
                <div className="absolute left-[-18%] top-20 h-[2px] w-[145%] -rotate-[22deg] bg-slate-500/45"></div>
                <div className="absolute left-[-10%] top-32 h-[2px] w-[130%] rotate-[15deg] bg-slate-500/35"></div>
                <div className="absolute left-[34%] top-[-20%] h-[150%] w-[2px] -rotate-[14deg] bg-slate-500/40"></div>
                <div className="absolute left-[58%] top-[-15%] h-[145%] w-[2px] rotate-[23deg] bg-slate-500/45"></div>
                <div className="absolute bottom-[-20%] right-[-15%] h-48 w-48 rounded-full border-[10px] border-slate-500/30"></div>
              </div>
              <div className="absolute left-1/2 top-9 -translate-x-1/2 rounded-full bg-lime-300/25 px-5 py-3 text-xs font-black uppercase text-sky-400">
                Precise location on
              </div>
              <div className="absolute left-[60%] top-[50%] h-7 w-7 -translate-x-1/2 rounded-full bg-sky-500 shadow-[0_0_0_5px_rgba(14,165,233,0.14)]">
                <div className="mx-auto mt-2 h-2 w-2 rounded-full bg-white"></div>
              </div>
            </div>

            <div className="grid">
              <button
                type="button"
                onClick={allowLocation}
                disabled={locating}
                className="px-6 py-5 text-center text-sm font-black uppercase tracking-[0.08em] text-blue-400 transition hover:bg-white/5 disabled:opacity-60"
              >
                Allow only while in use
              </button>
              <button
                type="button"
                onClick={allowLocation}
                disabled={locating}
                className="px-6 py-5 text-center text-sm font-black uppercase tracking-[0.08em] text-blue-400 transition hover:bg-white/5 disabled:opacity-60"
              >
                Allow this time only
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLocationPermission(false);
                  setError("Location access was denied. Tap Allow again when you are ready to share your live location.");
                }}
                className="px-6 pb-6 pt-5 text-center text-sm font-black uppercase tracking-[0.08em] text-blue-400 transition hover:bg-white/5"
              >
                Deny
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
