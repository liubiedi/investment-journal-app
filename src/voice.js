// Voice input hook — wraps @react-native-voice/voice
// Graceful fallback when native module unavailable (Expo Go).

import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

let Voice = null;
try {
  // Dynamic require so Expo Go doesn't crash
  Voice = require("@react-native-voice/voice").default;
} catch (e) {
  Voice = null;
}

export function useSpeech(onFinalText) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const onFinalRef = useRef(onFinalText);
  const accumRef = useRef("");

  useEffect(() => { onFinalRef.current = onFinalText; }, [onFinalText]);

  useEffect(() => {
    if (!Voice) return;

    Voice.onSpeechResults = (e) => {
      const latest = e?.value?.[0];
      if (!latest) return;
      // results contains growing interim text; combine with accumulated
      const combined = [accumRef.current, latest].filter(Boolean).join(" ").trim();
      if (onFinalRef.current) onFinalRef.current(combined);
    };
    Voice.onSpeechPartialResults = (e) => {
      const latest = e?.value?.[0];
      if (!latest) return;
      const combined = [accumRef.current, latest].filter(Boolean).join(" ").trim();
      if (onFinalRef.current) onFinalRef.current(combined);
    };
    Voice.onSpeechEnd = () => {
      // Snapshot the current combined text to accum, so next session appends.
      // We don't have direct access here, but listening = false suffices;
      // caller re-seeds with current text on next start().
      setListening(false);
    };
    Voice.onSpeechError = (e) => {
      setError(e?.error?.message || "speech error");
      setListening(false);
    };

    return () => {
      try { Voice.destroy().then(Voice.removeAllListeners); } catch {}
    };
  }, []);

  const supported = !!Voice;

  const start = async (initialText = "") => {
    if (!Voice) return false;
    accumRef.current = initialText || "";
    setError(null);
    try {
      await Voice.start("zh-CN");
      setListening(true);
      return true;
    } catch (e) {
      setError(e?.message || String(e));
      return false;
    }
  };

  const stop = async () => {
    if (!Voice) return;
    try { await Voice.stop(); } catch {}
    setListening(false);
  };

  return { listening, supported, start, stop, error };
}
