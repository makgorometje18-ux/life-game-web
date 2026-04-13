"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LoopState = {
  context: AudioContext;
  master: GainNode;
  timeoutId: number;
};

const MASTER_VOLUME = 0.22;

const melodyNotes = [261.63, 293.66, 329.63, 392, 440, 523.25];
const bassline = [65.41, 73.42, 82.41, 98];
const shakerPattern = [0.62, 0.2, 0.42, 0.18, 0.58, 0.22, 0.36, 0.16];
const clapPattern = [0, 1, 0, 0, 1, 0, 0, 1];
const kickPattern = [1, 0, 0, 1, 0, 1, 0, 0];
const notePattern = [0, 2, 3, 1, 4, 2, 5, 3];
const STEP_SECONDS = 0.42;
const LOOKAHEAD_STEPS = 8;
const WELCOME_MESSAGE =
  "Welcome to the real life game Africa. Build your character. Live the world and play your real story.";

const makeNoiseBuffer = (context: AudioContext) => {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.18), context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let index = 0; index < data.length; index += 1) {
    data[index] = Math.random() * 2 - 1;
  }

  return buffer;
};

const melodicTone = (
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number
) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  oscillator.frequency.linearRampToValueAtTime(frequency * 1.015, startTime + duration);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1600, startTime);
  filter.frequency.linearRampToValueAtTime(900, startTime + duration);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.03);
};

const bassTone = (context: AudioContext, destination: AudioNode, frequency: number, startTime: number) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(frequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.92, startTime + 0.28);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(280, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.17, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.32);

  oscillator.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + 0.35);
};

const kickTone = (context: AudioContext, destination: AudioNode, startTime: number) => {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(130, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(38, startTime + 0.18);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.3, startTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);

  oscillator.connect(gain);
  gain.connect(destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + 0.24);
};

const clapTone = (context: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer, startTime: number) => {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  source.buffer = noiseBuffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(1800, startTime);
  filter.Q.value = 1.2;

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.1, startTime + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.14);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  source.start(startTime);
  source.stop(startTime + 0.15);
};

const shakerTone = (
  context: AudioContext,
  destination: AudioNode,
  noiseBuffer: AudioBuffer,
  startTime: number,
  intensity: number
) => {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  source.buffer = noiseBuffer;
  filter.type = "highpass";
  filter.frequency.setValueAtTime(4200, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.04 * intensity, startTime + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  source.start(startTime);
  source.stop(startTime + 0.09);
};

export function AudioController() {
  const [isMuted, setIsMuted] = useState(true);
  const loopRef = useRef<LoopState | null>(null);
  const hasSpokenWelcomeRef = useRef(false);

  const stopLoop = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;

    window.clearTimeout(loop.timeoutId);
    loop.master.gain.cancelScheduledValues(loop.context.currentTime);
    loop.master.gain.setValueAtTime(loop.master.gain.value, loop.context.currentTime);
    loop.master.gain.linearRampToValueAtTime(0, loop.context.currentTime + 0.2);
    window.setTimeout(() => {
      void loop.context.close();
    }, 250);
    loopRef.current = null;
  }, []);

  const playClickSound = (context: AudioContext) => {
    const now = context.currentTime;
    melodicTone(context, context.destination, 1046.5, now, 0.09, 0.06);
    melodicTone(context, context.destination, 1318.5, now + 0.03, 0.08, 0.045);
  };

  const speakWelcomeMessage = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || hasSpokenWelcomeRef.current) {
      return;
    }

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(WELCOME_MESSAGE);
    const voices = synth.getVoices();
    const preferredVoice =
      voices.find((voice) =>
        /david|mark|microsoft guy|male|english united kingdom|en-gb/i.test(
          `${voice.name} ${voice.lang}`
        )
      ) ??
      voices.find((voice) => /en/i.test(voice.lang)) ??
      null;

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.rate = 0.84;
    utterance.pitch = 0.58;
    utterance.volume = 1;

    hasSpokenWelcomeRef.current = true;
    synth.cancel();
    synth.speak(utterance);
  }, []);

  const startLoop = useCallback(async () => {
    if (loopRef.current) return;

    const context = new window.AudioContext();
    if (context.state === "suspended") {
      await context.resume();
    }

    const master = context.createGain();
    const compressor = context.createDynamicsCompressor();
    const filter = context.createBiquadFilter();
    const noiseBuffer = makeNoiseBuffer(context);
    const stereo =
      "createStereoPanner" in context
        ? context.createStereoPanner()
        : null;

    filter.type = "lowpass";
    filter.frequency.value = 2200;

    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.01;
    compressor.release.value = 0.22;

    master.gain.value = MASTER_VOLUME;
    if (stereo) {
      filter.connect(stereo);
      stereo.pan.value = -0.03;
      stereo.connect(compressor);
    } else {
      filter.connect(compressor);
    }
    compressor.connect(master);
    master.connect(context.destination);

    let stepIndex = 0;

    const scheduleWindow = () => {
      const baseTime = context.currentTime + 0.06;

      for (let offset = 0; offset < LOOKAHEAD_STEPS; offset += 1) {
        const currentStep = stepIndex + offset;
        const startTime = baseTime + offset * STEP_SECONDS;

        if (kickPattern[currentStep % kickPattern.length]) {
          kickTone(context, filter, startTime);
        }

        if (clapPattern[currentStep % clapPattern.length]) {
          clapTone(context, filter, noiseBuffer, startTime + STEP_SECONDS * 0.5);
        }

        shakerTone(
          context,
          filter,
          noiseBuffer,
          startTime + STEP_SECONDS * 0.25,
          shakerPattern[currentStep % shakerPattern.length]
        );

        if (currentStep % 2 === 0) {
          bassTone(context, filter, bassline[Math.floor(currentStep / 2) % bassline.length], startTime);
        }

        melodicTone(
          context,
          filter,
          melodyNotes[notePattern[currentStep % notePattern.length]],
          startTime + 0.02,
          0.28,
          currentStep % 4 === 0 ? 0.14 : 0.1
        );
      }

      stepIndex += LOOKAHEAD_STEPS;
      const timeoutId = window.setTimeout(scheduleWindow, LOOKAHEAD_STEPS * STEP_SECONDS * 1000 - 140);
      if (loopRef.current) {
        loopRef.current.timeoutId = timeoutId;
      }
    };

    const timeoutId = window.setTimeout(() => undefined, 0);
    loopRef.current = { context, master, timeoutId };
    window.clearTimeout(timeoutId);
    scheduleWindow();
  }, []);

  const toggleSound = useCallback(async () => {
    if (isMuted) {
      setIsMuted(false);

      try {
        await startLoop();
        speakWelcomeMessage();
      } catch (error) {
        console.error("Audio could not start", error);
      }

      return;
    }

    setIsMuted(true);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    stopLoop();
  }, [isMuted, speakWelcomeMessage, startLoop, stopLoop]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;

    const synth = window.speechSynthesis;
    const loadVoices = () => {
      synth.getVoices();
    };

    loadVoices();
    synth.addEventListener("voiceschanged", loadVoices);
    return () => synth.removeEventListener("voiceschanged", loadVoices);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (isMuted) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("button")) return;

      const context = loopRef.current?.context;
      if (!context) return;
      playClickSound(context);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMuted]);

  useEffect(
    () => () => {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      stopLoop();
    },
    [stopLoop]
  );

  return (
    <button
      type="button"
      onClick={() => {
        void toggleSound();
      }}
      className="fixed bottom-4 right-4 z-50 rounded-full border border-white/15 bg-black/65 px-4 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur transition hover:bg-black/80"
      aria-pressed={!isMuted}
      aria-label={isMuted ? "Enable sound" : "Mute sound"}
    >
      {isMuted ? "Sound Off" : "Sound On"}
    </button>
  );
}
