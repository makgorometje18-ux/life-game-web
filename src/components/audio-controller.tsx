"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type LoopState = {
  context: AudioContext;
  master: GainNode;
  timeoutId: number;
};

const MASTER_VOLUME = 0.22;

const darkBassline = [49, 43.65, 38.89, 43.65];
const darkOrganNotes = [98, 116.54, 130.81, 87.31];
const darkBellNotes = [392, 349.23, 293.66, 261.63];
const deepHitPattern = [1, 0, 0, 0, 1, 0, 0, 0];
const bellPattern = [1, 0, 0, 1, 0, 0, 1, 0];
const organPattern = [1, 0, 1, 0, 1, 0, 1, 0];
const STEP_SECONDS = 0.78;
const LOOKAHEAD_STEPS = 8;

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

const darkBellTone = (context: AudioContext, destination: AudioNode, frequency: number, startTime: number) => {
  const body = context.createOscillator();
  const shimmer = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  body.type = "sine";
  body.frequency.setValueAtTime(frequency, startTime);
  shimmer.type = "triangle";
  shimmer.frequency.setValueAtTime(frequency * 2.01, startTime);

  filter.type = "bandpass";
  filter.frequency.setValueAtTime(frequency * 2.4, startTime);
  filter.Q.value = 3.4;

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.2, startTime + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.9);

  body.connect(filter);
  shimmer.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  body.start(startTime);
  shimmer.start(startTime);
  body.stop(startTime + 2);
  shimmer.stop(startTime + 2);
};

const darkOrganTone = (context: AudioContext, destination: AudioNode, frequency: number, startTime: number) => {
  const root = context.createOscillator();
  const fifth = context.createOscillator();
  const octave = context.createOscillator();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();

  root.type = "sawtooth";
  fifth.type = "triangle";
  octave.type = "sine";
  root.frequency.setValueAtTime(frequency, startTime);
  fifth.frequency.setValueAtTime(frequency * 1.5, startTime);
  octave.frequency.setValueAtTime(frequency * 2, startTime);

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(620, startTime);
  filter.frequency.linearRampToValueAtTime(420, startTime + 1.2);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.linearRampToValueAtTime(0.095, startTime + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.65);

  root.connect(filter);
  fifth.connect(filter);
  octave.connect(filter);
  filter.connect(gain);
  gain.connect(destination);

  root.start(startTime);
  fifth.start(startTime);
  octave.start(startTime);
  root.stop(startTime + 1.7);
  fifth.stop(startTime + 1.7);
  octave.stop(startTime + 1.7);
};

const darkImpactTone = (context: AudioContext, destination: AudioNode, noiseBuffer: AudioBuffer, startTime: number) => {
  const boom = context.createOscillator();
  const boomGain = context.createGain();
  const noise = context.createBufferSource();
  const noiseGain = context.createGain();
  const noiseFilter = context.createBiquadFilter();

  boom.type = "sine";
  boom.frequency.setValueAtTime(92, startTime);
  boom.frequency.exponentialRampToValueAtTime(30, startTime + 0.42);
  boomGain.gain.setValueAtTime(0.0001, startTime);
  boomGain.gain.linearRampToValueAtTime(0.34, startTime + 0.018);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.5);

  noise.buffer = noiseBuffer;
  noiseFilter.type = "lowpass";
  noiseFilter.frequency.setValueAtTime(520, startTime);
  noiseGain.gain.setValueAtTime(0.0001, startTime);
  noiseGain.gain.linearRampToValueAtTime(0.08, startTime + 0.012);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.28);

  boom.connect(boomGain);
  boomGain.connect(destination);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(destination);

  boom.start(startTime);
  boom.stop(startTime + 0.55);
  noise.start(startTime);
  noise.stop(startTime + 0.32);
};

export function AudioController() {
  const [isMuted, setIsMuted] = useState(true);
  const loopRef = useRef<LoopState | null>(null);

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
    const noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.035), context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);

    for (let index = 0; index < noiseData.length; index += 1) {
      noiseData[index] = (Math.random() * 2 - 1) * (1 - index / noiseData.length);
    }

    const noise = context.createBufferSource();
    const noiseGain = context.createGain();
    const noiseFilter = context.createBiquadFilter();
    const tap = context.createOscillator();
    const tapGain = context.createGain();

    noise.buffer = noiseBuffer;
    noiseFilter.type = "highpass";
    noiseFilter.frequency.setValueAtTime(2800, now);

    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.linearRampToValueAtTime(0.08, now + 0.004);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    tap.type = "square";
    tap.frequency.setValueAtTime(1200, now);
    tap.frequency.exponentialRampToValueAtTime(580, now + 0.035);

    tapGain.gain.setValueAtTime(0.0001, now);
    tapGain.gain.linearRampToValueAtTime(0.035, now + 0.003);
    tapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(context.destination);
    tap.connect(tapGain);
    tapGain.connect(context.destination);

    noise.start(now);
    noise.stop(now + 0.04);
    tap.start(now);
    tap.stop(now + 0.05);
  };

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

        if (deepHitPattern[currentStep % deepHitPattern.length]) {
          darkImpactTone(context, filter, noiseBuffer, startTime);
        }

        if (bellPattern[currentStep % bellPattern.length]) {
          darkBellTone(context, filter, darkBellNotes[Math.floor(currentStep / 3) % darkBellNotes.length], startTime + 0.08);
        }

        if (organPattern[currentStep % organPattern.length]) {
          darkOrganTone(context, filter, darkOrganNotes[Math.floor(currentStep / 2) % darkOrganNotes.length], startTime + 0.18);
        }

        bassTone(context, filter, darkBassline[Math.floor(currentStep / 2) % darkBassline.length], startTime + 0.36);
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
      } catch (error) {
        console.error("Audio could not start", error);
      }

      return;
    }

    setIsMuted(true);
    stopLoop();
  }, [isMuted, startLoop, stopLoop]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (isMuted) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (!button || button.disabled) return;

      const context = loopRef.current?.context;
      if (!context) return;
      if (context.state === "suspended") {
        void context.resume();
      }
      playClickSound(context);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isMuted]);

  useEffect(
    () => () => {
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
