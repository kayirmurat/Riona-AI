import { useEffect, useRef, useState } from "react";
import { getVoiceSettings, applyVoiceSettings } from "../../lib/voice/voiceSettings";

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

const RETRYABLE_ERRORS = new Set(["no-speech", "network", "aborted"]);
const FATAL_ERRORS = new Set(["not-allowed", "audio-capture", "service-not-allowed"]);

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.",
  "service-not-allowed": "Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.",
  "audio-capture": "Mikrofon bulunamadı.",
  network: "Ağ bağlantısı sorunu, tekrar deneniyor…",
};

export function useVoiceChat({ lang = "tr-TR", onTranscript, onVoiceMessage }: UseVoiceChatOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    const settings = getVoiceSettings();
    const doSpeak = () => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      applyVoiceSettings(utterance, settings);
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
    };
    // Chrome'da cancel() hemen ardından speak() çağrılırsa bazen hiç ses
    // çıkmıyor (bilinen bir motor hatası) — sadece gerçekten konuşuyorsa iptal
    // edip küçük bir gecikmeyle yeniden başlatılıyor.
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
      setTimeout(doSpeak, 50);
    } else {
      doSpeak();
    }
  }

  function startListening(handsFree: boolean) {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Bir önceki (artık eski) recognition örneğinin gecikmeli onend/onerror
    // olayları, yeni başlatılmış bir dinlemenin "listening" durumunu yanlışlıkla
    // false'a çekmesin diye — sadece hâlâ AKTİF örnekse state güncelleniyor.
    const isCurrent = () => recognitionRef.current === recognition;

    recognition.onresult = async (event: any) => {
      if (!isCurrent()) return;
      setErrorMessage(null);
      const transcript = (event.results?.[0]?.[0]?.transcript ?? "") as string;
      if (!handsFree) {
        onTranscriptRef.current(transcript);
        return;
      }
      if (!transcript.trim()) {
        if (voiceModeRef.current) startListening(true);
        return;
      }
      // Riona hâlâ konuşuyorsa (TTS çalıyorsa) kullanıcı araya girmiş demektir
      // — sesi hemen kesiyoruz (barge-in).
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel();
        setSpeaking(false);
      }
      const reply = await onVoiceMessageRef.current(transcript);
      if (voiceModeRef.current) {
        speak(reply);
        // Cevap seslendirilirken AYNI ANDA dinlemeye devam ediliyor ki kullanıcı
        // Riona konuşurken araya girip konuşabilsin. Not: mikrofon ve hoparlör
        // aynı cihazdaysa (kulaklıksız) Riona kendi sesini duyup yanlışlıkla
        // araya girilmiş sanabilir — düzgün barge-in için kulaklık önerilir.
        startListening(true);
      }
    };

    recognition.onerror = (event: any) => {
      if (!isCurrent()) return;
      setListening(false);
      const code = event?.error ?? "unknown";

      if (!handsFree) {
        if (code !== "aborted") setErrorMessage(ERROR_MESSAGES[code] ?? null);
        return;
      }

      // Eller serbest moddayken tek bir hata (sessizlik, geçici ağ sorunu)
      // tüm sesli sohbeti sessizce öldürmesin diye otomatik olarak yeniden
      // dinlemeye devam ediliyor — eskiden burada hiç yeniden başlatma
      // olmadığı için ilk hatada sesli sohbet donuyordu.
      if (FATAL_ERRORS.has(code)) {
        setErrorMessage(ERROR_MESSAGES[code] ?? "Mikrofon hatası.");
        voiceModeRef.current = false;
        setVoiceMode(false);
        return;
      }
      if (RETRYABLE_ERRORS.has(code)) {
        setErrorMessage(code === "network" ? ERROR_MESSAGES.network : null);
        if (voiceModeRef.current) startListening(true);
        return;
      }
      // Tanınmayan bir hata kodu — yine de sesli sohbeti öldürmemek için dener.
      if (voiceModeRef.current) startListening(true);
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      setListening(false);
    };

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function dictate() {
    if (listening || voiceModeRef.current) return;
    setErrorMessage(null);
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
      setErrorMessage(null);
      voiceModeRef.current = true;
      setVoiceMode(true);
      startListening(true);
    }
  }

  return { supported, listening, voiceMode, speaking, errorMessage, dictate, toggleVoiceMode };
}
