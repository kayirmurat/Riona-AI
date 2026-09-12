export interface VoiceSettings {
  voiceURI: string | null;
  rate: number;
  pitch: number;
}

const STORAGE_KEY = "riona_voice_settings";
const DEFAULT_SETTINGS: VoiceSettings = { voiceURI: null, rate: 1, pitch: 1 };

export function getVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
      rate: typeof parsed.rate === "number" ? parsed.rate : 1,
      pitch: typeof parsed.pitch === "number" ? parsed.pitch : 1,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage kapalı/dolu olabilir — sessizce yok sayılıyor, ses ayarı
    // sadece bu oturum için varsayılana döner.
  }
}

export function applyVoiceSettings(utterance: SpeechSynthesisUtterance, settings: VoiceSettings): void {
  utterance.rate = settings.rate;
  utterance.pitch = settings.pitch;
  if (settings.voiceURI && "speechSynthesis" in window) {
    const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === settings.voiceURI);
    if (voice) utterance.voice = voice;
  }
}
