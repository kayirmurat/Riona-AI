export const OPENAI_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
export type OpenAIVoice = (typeof OPENAI_VOICES)[number];

export interface VoiceSettings {
  voice: OpenAIVoice;
  speed: number;
}

const STORAGE_KEY = "riona_voice_settings";
const DEFAULT_SETTINGS: VoiceSettings = { voice: "alloy", speed: 1 };

function isOpenAIVoice(v: unknown): v is OpenAIVoice {
  return typeof v === "string" && (OPENAI_VOICES as readonly string[]).includes(v);
}

export function getVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      voice: isOpenAIVoice(parsed.voice) ? parsed.voice : DEFAULT_SETTINGS.voice,
      speed: typeof parsed.speed === "number" ? parsed.speed : DEFAULT_SETTINGS.speed,
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
