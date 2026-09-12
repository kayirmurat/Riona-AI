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

const FATAL_ERRORS = new Set(["not-allowed", "audio-capture", "service-not-allowed"]);

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.",
  "service-not-allowed": "Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.",
  "audio-capture": "Mikrofon bulunamadı.",
  network: "Ağ bağlantısı sorunu, tekrar deneniyor…",
};

function isSpeechBusy(): boolean {
  return "speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending);
}

// speechSynthesis.onend bazı tarayıcılarda sesin fiziksel olarak bitmesinden
// az önce tetiklenebiliyor (bilinen bir motor tutarsızlığı) — sadece sabit bir
// gecikme yerine gerçekten "speaking=false" olana kadar yoklayarak bekleniyor.
// Mikrofon bu doğrulama olmadan açılırsa, Riona'nın kendi sesinin son kısmını
// yakalayıp kendi cevabına kendi cevap verdiği bir geri besleme döngüsü oluşuyordu.
function waitUntilSpeechFullyStopped(callback: () => void) {
  const check = () => {
    if (!isSpeechBusy()) {
      callback();
    } else {
      setTimeout(check, 250);
    }
  };
  setTimeout(check, 400);
}

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
    if (isSpeechBusy()) {
      window.speechSynthesis.cancel();
      setTimeout(doSpeak, 50);
    } else {
      doSpeak();
    }
  }

  // Eller serbest (sesli sohbet) modunda TÜM yeniden dinleme kararı burada,
  // TEK bir yerde veriliyor (onresult/onerror sadece durum topluyor, kendileri
  // yeniden başlatmıyor) — dağınık restart çağrıları hem çakışma riski
  // yaratıyordu hem de "Riona konuşurken yakalanan sonucu görmezden gel"
  // kuralını her yerde ayrı ayrı uygulamak gerekiyordu.
  function startListening(handsFree: boolean) {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // Bir önceki (artık eski) recognition örneğinin gecikmeli olayları, yeni
    // başlatılmış bir dinlemenin durumunu yanlışlıkla etkilemesin diye —
    // sadece hâlâ AKTİF örnekse state güncelleniyor/karar veriliyor.
    const isCurrent = () => recognitionRef.current === recognition;

    let capturedTranscript = "";
    let fatalErrorCode: string | null = null;

    recognition.onresult = (event: any) => {
      if (!isCurrent()) return;
      const transcript = (event.results?.[0]?.[0]?.transcript ?? "") as string;
      if (!handsFree) {
        setErrorMessage(null);
        onTranscriptRef.current(transcript);
        return;
      }
      capturedTranscript = transcript;
    };

    recognition.onerror = (event: any) => {
      if (!isCurrent()) return;
      const code = event?.error ?? "unknown";

      if (!handsFree) {
        if (code !== "aborted") setErrorMessage(ERROR_MESSAGES[code] ?? null);
        return;
      }

      if (FATAL_ERRORS.has(code)) {
        fatalErrorCode = code;
        setErrorMessage(ERROR_MESSAGES[code] ?? "Mikrofon hatası.");
        voiceModeRef.current = false;
        setVoiceMode(false);
      } else if (code === "network") {
        setErrorMessage(ERROR_MESSAGES.network);
      }
    };

    recognition.onend = async () => {
      if (!isCurrent()) return;
      setListening(false);

      if (!handsFree || !voiceModeRef.current || fatalErrorCode) return;

      // Bu oturum Riona hâlâ konuşurken (ya da konuşma kuyruğu boşalmadan)
      // bir şekilde aktif kaldıysa, yakaladığı her şey kendi sesinin
      // mikrofona sızmasıdır — gerçek kullanıcı girdisi SAYILMAZ, atlanır.
      if (isSpeechBusy()) {
        waitUntilSpeechFullyStopped(() => {
          if (voiceModeRef.current) startListening(true);
        });
        return;
      }

      const transcript = capturedTranscript.trim();
      if (!transcript) {
        startListening(true);
        return;
      }

      setErrorMessage(null);
      const reply = await onVoiceMessageRef.current(transcript);
      if (!voiceModeRef.current) return;

      speak(reply, () => {
        if (!voiceModeRef.current) return;
        waitUntilSpeechFullyStopped(() => {
          if (voiceModeRef.current) startListening(true);
        });
      });
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
