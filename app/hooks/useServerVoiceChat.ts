import { useEffect, useRef, useState } from "react";
import { getVoiceSettings } from "../../lib/voice/voiceSettings";

// Tarayıcının SpeechRecognition/speechSynthesis API'leri mikrofon ve hoparlör
// erişimini TAMAMEN kendi içinde yönetiyor — dışarıya hiçbir kontrol vermiyor.
// Bu yüzden Riona konuşurken kendi sesini duyup kendine cevap verdiği bir geri
// besleme döngüsü canlı testte ısrarla tekrar etti (5 farklı yama denendi,
// hiçbiri kökten çözmedi — kök neden mimariydi, mantık hatası değildi).
//
// Bu hook onun yerine üç ayrı, gerçek çözüm kullanıyor:
// 1) getUserMedia({echoCancellation:true}) — WebRTC'nin GERÇEK akustik yankı
//    bastırması (video görüşme uygulamalarının kullandığı aynı mekanizma:
//    cihazın kendi hoparlör çıkışını kendi mikrofon girişinden çıkarıyor).
// 2) Konuşma bitişini tarayıcının tutarsız "endpointing"ine bırakmak yerine
//    enerji/RMS tabanlı özel bir Sesli Aktivite Algılama (VAD) döngüsü.
// 3) STT ve TTS sunucu tarafında (OpenAI Whisper/TTS) — oynatma standart bir
//    <audio> elemanıyla yapılıyor (speechSynthesis'in aksine güvenilir,
//    gerçek bir "ended" olayı var).
//
// Ek güvence olarak: TTS çalarken mikrofon KAYDI tamamen durduruluyor (sadece
// AEC'ye güvenilmiyor) — konuşma bitip <audio> "ended" olayı gelmeden yeniden
// dinleme başlamıyor.
interface UseServerVoiceChatOptions {
  onTranscript: (text: string) => void;
  onVoiceMessage: (text: string) => Promise<string>;
}

const FATAL_GETUSERMEDIA_ERRORS = new Set(["NotAllowedError", "SecurityError"]);

const ERROR_MESSAGES: Record<string, string> = {
  NotAllowedError: "Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.",
  SecurityError: "Mikrofon izni reddedildi. Tarayıcı ayarlarından izin ver.",
  NotFoundError: "Mikrofon bulunamadı.",
  NotReadableError: "Mikrofona erişilemedi (başka bir uygulama kullanıyor olabilir).",
};

// VAD ayarları — canlı testte makul bir başlangıç noktası; ortam gürültüsüne
// göre ayar gerekebilir (bu yüzden ayrı sabitler olarak tutuluyor).
const SPEECH_RMS_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1100;
const MIN_SPEECH_DURATION_MS = 350;
const MAX_RECORDING_MS = 25000;

function pickMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

export function useServerVoiceChat({ onTranscript, onVoiceMessage }: UseServerVoiceChatOptions) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const voiceModeRef = useRef(false);
  const onTranscriptRef = useRef(onTranscript);
  const onVoiceMessageRef = useRef(onVoiceMessage);

  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const rafRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const lastObjectUrlRef = useRef<string | null>(null);

  // Eski (artık geçersiz) bir kaydın/döngünün gecikmeli olay/geri çağrıları
  // yeni başlatılan bir oturumu yanlışlıkla etkilemesin diye bir sürüm sayacı.
  const sessionRef = useRef(0);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);
  useEffect(() => {
    onVoiceMessageRef.current = onVoiceMessage;
  }, [onVoiceMessage]);

  useEffect(() => {
    const hasGetUserMedia = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
    const hasMediaRecorder = typeof window !== "undefined" && "MediaRecorder" in window;
    setSupported(hasGetUserMedia && hasMediaRecorder);
    return () => {
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function teardown() {
    sessionRef.current += 1;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // zaten durmuş olabilir.
      }
    }
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.src = "";
    }
    if (lastObjectUrlRef.current) {
      URL.revokeObjectURL(lastObjectUrlRef.current);
      lastObjectUrlRef.current = null;
    }
  }

  async function ensureStream(): Promise<MediaStream | null> {
    if (streamRef.current && streamRef.current.getAudioTracks().some((t) => t.readyState === "live")) {
      return streamRef.current;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      return stream;
    } catch (e: any) {
      const code = e?.name ?? "unknown";
      setErrorMessage(ERROR_MESSAGES[code] ?? "Mikrofona erişilemedi.");
      if (FATAL_GETUSERMEDIA_ERRORS.has(code)) {
        voiceModeRef.current = false;
        setVoiceMode(false);
      }
      return null;
    }
  }

  function getRms(analyser: AnalyserNode, dataArray: Uint8Array): number {
    analyser.getByteTimeDomainData(dataArray as any);
    let sumSquares = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    return Math.sqrt(sumSquares / dataArray.length);
  }

  // Tek bir kayıt turu: mikrofonu dinler, VAD ile konuşmanın bittiğini
  // algılayınca kaydı durdurur ve callback ile sonucu döner. `handsFree`
  // false ise (tek seferlik "konuşarak yaz"), true ise (sesli sohbet modu).
  async function recordOneUtterance(mySession: number): Promise<Blob | null> {
    const stream = await ensureStream();
    if (!stream || sessionRef.current !== mySession) return null;

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const audioCtx: AudioContext = audioCtxRef.current ?? new AudioCtx();
    audioCtxRef.current = audioCtx;
    if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => {});

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    dataArrayRef.current = dataArray;

    const mimeType = pickMimeType();
    const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    recorder.ondataavailable = (ev: BlobEvent) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };

    setListening(true);

    return new Promise<Blob | null>((resolve) => {
      let resolved = false;
      const finish = (blob: Blob | null) => {
        if (resolved) return;
        resolved = true;
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        setListening(false);
        resolve(blob);
      };

      recorder.onstop = () => {
        if (sessionRef.current !== mySession) return finish(null);
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType || "audio/webm" }) : null;
        finish(blob);
      };

      recorder.onerror = () => finish(null);

      let speechDetectedAt: number | null = null;
      let lastSpeechAt = 0;
      const startedAt = performance.now();

      const monitor = () => {
        if (sessionRef.current !== mySession) return;
        const rms = getRms(analyser, dataArray);
        const now = performance.now();
        if (rms > SPEECH_RMS_THRESHOLD) {
          lastSpeechAt = now;
          if (speechDetectedAt === null) speechDetectedAt = now;
        }
        if (speechDetectedAt !== null) {
          const silenceFor = now - lastSpeechAt;
          const spokeFor = now - speechDetectedAt;
          if ((silenceFor > SILENCE_DURATION_MS && spokeFor > MIN_SPEECH_DURATION_MS) || now - startedAt > MAX_RECORDING_MS) {
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
        } else if (now - startedAt > MAX_RECORDING_MS) {
          // Hiç konuşma algılanmadı ama azami süreye ulaşıldı — boş kayıt olarak bitir.
          if (recorder.state !== "inactive") recorder.stop();
          return;
        }
        rafRef.current = requestAnimationFrame(monitor);
      };

      recorder.start();
      rafRef.current = requestAnimationFrame(monitor);
    });
  }

  function extensionForMimeType(mimeType: string): string {
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("ogg")) return "ogg";
    return "webm";
  }

  async function transcribe(blob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append("audio", blob, `audio.${extensionForMimeType(blob.type)}`);
    try {
      const res = await fetch("/api/voice/transcribe", { method: "POST", body: formData });
      if (!res.ok) return "";
      const data = await res.json();
      return typeof data.text === "string" ? data.text : "";
    } catch {
      return "";
    }
  }

  async function playReply(text: string, mySession: number): Promise<void> {
    if (!text.trim()) return;
    const settings = getVoiceSettings();
    let res: Response;
    try {
      res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: settings.voice, speed: settings.speed }),
      });
    } catch {
      return;
    }
    if (!res.ok || sessionRef.current !== mySession) return;

    const blob = await res.blob();
    if (sessionRef.current !== mySession) return;

    if (lastObjectUrlRef.current) URL.revokeObjectURL(lastObjectUrlRef.current);
    const url = URL.createObjectURL(blob);
    lastObjectUrlRef.current = url;

    if (!audioElRef.current) audioElRef.current = new Audio();
    const audioEl = audioElRef.current;
    audioEl.src = url;

    setSpeaking(true);
    await new Promise<void>((resolve) => {
      const finish = () => {
        audioEl.onended = null;
        audioEl.onerror = null;
        resolve();
      };
      audioEl.onended = finish;
      audioEl.onerror = finish;
      audioEl.play().catch(finish);
    });
    if (sessionRef.current === mySession) setSpeaking(false);
  }

  async function handsFreeLoop(mySession: number) {
    while (voiceModeRef.current && sessionRef.current === mySession) {
      const blob = await recordOneUtterance(mySession);
      if (sessionRef.current !== mySession || !voiceModeRef.current) return;
      if (!blob) continue;

      const transcript = (await transcribe(blob)).trim();
      if (sessionRef.current !== mySession || !voiceModeRef.current) return;
      if (!transcript) continue;

      setErrorMessage(null);
      const reply = await onVoiceMessageRef.current(transcript);
      if (sessionRef.current !== mySession || !voiceModeRef.current) return;

      await playReply(reply, mySession);
      if (sessionRef.current !== mySession || !voiceModeRef.current) return;
    }
  }

  async function dictate() {
    if (listening || voiceModeRef.current) return;
    setErrorMessage(null);
    const mySession = sessionRef.current;
    const blob = await recordOneUtterance(mySession);
    if (sessionRef.current !== mySession || !blob) return;
    const transcript = (await transcribe(blob)).trim();
    if (sessionRef.current !== mySession || !transcript) return;
    onTranscriptRef.current(transcript);
  }

  function toggleVoiceMode() {
    if (voiceModeRef.current) {
      voiceModeRef.current = false;
      setVoiceMode(false);
      teardown();
      setSpeaking(false);
      setListening(false);
    } else {
      setErrorMessage(null);
      voiceModeRef.current = true;
      setVoiceMode(true);
      const mySession = sessionRef.current;
      handsFreeLoop(mySession);
    }
  }

  return { supported, listening, voiceMode, speaking, errorMessage, dictate, toggleVoiceMode };
}
