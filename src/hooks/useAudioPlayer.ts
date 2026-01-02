"use client";

import { useCallback, useRef, useState } from "react";
import { pcmBlobToFloat32Array } from "@/lib/gemini-adapter";

export function useAudioPlayer(sampleRate: number = 24000) {
  const [isPlaying, setIsPlaying] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isProcessingRef = useRef(false);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current || audioContextRef.current.state === "closed") {
      audioContextRef.current = new AudioContext({ sampleRate });
    }
    return audioContextRef.current;
  }, [sampleRate]);

  // Unlock AudioContext for iOS Safari - must be called from user gesture
  const unlock = useCallback(async () => {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    // Play a tiny silent buffer to fully unlock on iOS
    const buffer = ctx.createBuffer(1, 1, sampleRate);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }, [getAudioContext, sampleRate]);

  const playNextInQueue = useCallback(async () => {
    if (isProcessingRef.current || audioQueueRef.current.length === 0) {
      if (audioQueueRef.current.length === 0) {
        setIsPlaying(false);
      }
      return;
    }

    isProcessingRef.current = true;
    setIsPlaying(true);

    const audioContext = getAudioContext();
    
    // Resume context if suspended (browser autoplay policy)
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // Combine all queued audio into one buffer
    const allSamples = audioQueueRef.current;
    audioQueueRef.current = [];
    
    const totalLength = allSamples.reduce((sum, arr) => sum + arr.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    for (const samples of allSamples) {
      combined.set(samples, offset);
      offset += samples.length;
    }

    const audioBuffer = audioContext.createBuffer(1, combined.length, sampleRate);
    audioBuffer.getChannelData(0).set(combined);

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);
    
    currentSourceRef.current = source;

    source.onended = () => {
      isProcessingRef.current = false;
      currentSourceRef.current = null;
      playNextInQueue();
    };

    source.start();
  }, [getAudioContext, sampleRate]);

  const queueAudio = useCallback(async (audioBlob: Blob) => {
    const samples = await pcmBlobToFloat32Array(audioBlob);
    audioQueueRef.current.push(samples);
    
    if (!isProcessingRef.current) {
      playNextInQueue();
    }
  }, [playNextInQueue]);

  const stop = useCallback(() => {
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
      currentSourceRef.current = null;
    }
    audioQueueRef.current = [];
    isProcessingRef.current = false;
    setIsPlaying(false);
  }, []);

  const cleanup = useCallback(() => {
    stop();
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, [stop]);

  return {
    isPlaying,
    queueAudio,
    stop,
    cleanup,
    unlock,
  };
}
