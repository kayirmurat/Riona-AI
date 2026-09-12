import { useEffect, useRef, useState } from "react";

// Tarayıcının yerleşik konuşma tanıma (SpeechRecognition) ve seslendirme
// (speechSynthesis) API'leri kullanılıyor — ekstra bir API anahtarı veya
// sunucu maliyeti gerektirmiyor. Chrome/Edge/Safari destekliyor, Firefox
// desteklemiyor; desteklenmiyorsa `supported` false döner ve arayüz mikrofon
// butonlarını hiç göstermemeli.
interface UseVoiceChatOptions {
  lang?: string;
  onTranscript: (text: string) => void;
  onVoiceMessage: (text: string) => Promise<string>;
}

export function useVoiceChat({ lang = "tr-TR", onTranscript, onVoiceMessage }: UseVoiceChatOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const voiceModeRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onVoiceMessageRef = useRef(onVoiceMessage);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onVoiceMessageRef.current = onVoiceMessage;
  }, [onVoiceMessage]);

  useEffect(() => {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(Boolean(Ctor) && "speechSynthesis" in window);
    return () => {
      recognitionRef.current?.stop();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  function speak(text: string, onEnd?: () => void) {
    if (!("speechSynthesis" in window) || !text.trim()) {
      onEnd?.();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    setSpeaking(true);
    utterance.onend = () => {
      setSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setSpeaking(false);
      onEnd?.();
    };
    window.speechSynthesis.speak(utterance);
  }

  function startListening(handsFree: boolean) {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = async (event: any) => {
      const transcript = (event.results?.[0]?.[0]?.transcript ?? "") as string;
      if (!handsFree) {
        onTranscriptRef.current(transcript);
        return;
      }
      if (!transcript.trim()) {
        if (voiceModeRef.current) startListening(true);
        return;
      }
      const reply = await onVoiceMessageRef.current(transcript);
      if (voiceModeRef.current) {
        speak(reply, () => {
          if (voiceModeRef.current) startListening(true);
        });
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function dictate() {
    if (listening || voiceModeRef.current) return;
    startListening(false);
  }

  function toggleVoiceMode() {
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      stopListening();
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      setSpeaking(false);
    } else {
      voiceModeRef.current = true;
      setVoiceMode(true);
      startListening(true);
    }
  }

  return { supported, listening, voiceMode, speaking, dictate, toggleVoiceMode };
}
