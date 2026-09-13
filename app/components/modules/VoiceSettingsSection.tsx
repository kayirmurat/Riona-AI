"use client";

import { useRef, useState } from "react";
import { getVoiceSettings, saveVoiceSettings, OPENAI_VOICES, type VoiceSettings } from "../../../lib/voice/voiceSettings";

const VOICE_LABELS: Record<string, string> = {
  alloy: "Alloy",
  echo: "Echo",
  fable: "Fable",
  onyx: "Onyx",
  nova: "Nova",
  shimmer: "Shimmer",
};

export default function VoiceSettingsSection() {
  const [settings, setSettings] = useState<VoiceSettings>(() => getVoiceSettings());
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastUrlRef = useRef<string | null>(null);

  function update(partial: Partial<VoiceSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveVoiceSettings(next);
  }

  async function testVoice() {
    if (testing) return;
    setTesting(true);
    setTestError(null);
    try {
      const res = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: "Merhaba, ben Riona. Bu benim şu anki sesim.",
          voice: settings.voice,
          speed: settings.speed,
        }),
      });
      if (!res.ok) throw new Error("Seslendirme başarısız.");
      const blob = await res.blob();
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
      const url = URL.createObjectURL(blob);
      lastUrlRef.current = url;
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = url;
      await audioRef.current.play();
    } catch (e) {
      setTestError("Ses test edilemedi.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">Riona'nın Sesi</h3>
      <p className="mb-2 text-xs text-ink-muted">
        Sesli sohbette Riona'nın cevaplarını okurken kullanılan ses ve konuşma hızı.
      </p>

      <div className="space-y-3 rounded-lg border border-border bg-surface p-3 text-sm">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Ses</label>
          <select
            value={settings.voice}
            onChange={(ev) => update({ voice: ev.target.value as VoiceSettings["voice"] })}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            {OPENAI_VOICES.map((v) => (
              <option key={v} value={v}>
                {VOICE_LABELS[v] ?? v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink-muted">Konuşma Hızı: {settings.speed.toFixed(1)}x</label>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.speed}
            onChange={(ev) => update({ speed: parseFloat(ev.target.value) })}
            className="w-full"
          />
        </div>

        <button
          onClick={testVoice}
          disabled={testing}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken disabled:opacity-50"
        >
          {testing ? "Çalınıyor…" : "Test Et"}
        </button>
        {testError && <p className="text-xs text-red-600">{testError}</p>}
      </div>
    </div>
  );
}
