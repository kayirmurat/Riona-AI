"use client";

import { useEffect, useState } from "react";
import { getVoiceSettings, saveVoiceSettings, applyVoiceSettings, type VoiceSettings } from "../../../lib/voice/voiceSettings";

export default function VoiceSettingsSection() {
  const [supported, setSupported] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [settings, setSettings] = useState<VoiceSettings>({ voiceURI: null, rate: 1, pitch: 1 });

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    setSupported(true);
    setSettings(getVoiceSettings());

    function loadVoices() {
      setVoices(window.speechSynthesis.getVoices());
    }
    loadVoices();
    // Sesler bazı tarayıcılarda (özellikle ilk yüklemede) asenkron geliyor.
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  function update(partial: Partial<VoiceSettings>) {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveVoiceSettings(next);
  }

  function testVoice() {
    const utterance = new SpeechSynthesisUtterance("Merhaba, ben Riona. Bu benim şu anki sesim.");
    utterance.lang = "tr-TR";
    applyVoiceSettings(utterance, settings);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  if (!supported) return null;

  const lower = (s: string) => s.toLowerCase();
  const turkishVoices = voices.filter((v) => lower(v.lang).startsWith("tr"));
  const otherVoices = voices.filter((v) => !lower(v.lang).startsWith("tr"));

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-ink">Riona'nın Sesi</h3>
      <p className="mb-2 text-xs text-ink-muted">
        Sesli sohbette Riona'nın cevaplarını okurken kullanılan ses, konuşma hızı ve ton.
      </p>

      <div className="space-y-3 rounded-lg border border-border bg-surface p-3 text-sm">
        <div>
          <label className="mb-1 block text-xs text-ink-muted">Ses</label>
          <select
            value={settings.voiceURI ?? ""}
            onChange={(ev) => update({ voiceURI: ev.target.value || null })}
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm text-ink"
          >
            <option value="">Tarayıcı varsayılanı</option>
            {turkishVoices.length > 0 && (
              <optgroup label="Türkçe">
                {turkishVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            )}
            {otherVoices.length > 0 && (
              <optgroup label="Diğer">
                {otherVoices.map((v) => (
                  <option key={v.voiceURI} value={v.voiceURI}>
                    {v.name} ({v.lang})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {voices.length === 0 && (
            <p className="mt-1 text-xs text-ink-muted">Bu tarayıcıda kayıtlı ses bulunamadı, varsayılan kullanılacak.</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink-muted">Konuşma Hızı: {settings.rate.toFixed(1)}x</label>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={settings.rate}
            onChange={(ev) => update({ rate: parseFloat(ev.target.value) })}
            className="w-full"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-ink-muted">Ton: {settings.pitch.toFixed(1)}</label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={settings.pitch}
            onChange={(ev) => update({ pitch: parseFloat(ev.target.value) })}
            className="w-full"
          />
        </div>

        <button
          onClick={testVoice}
          className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Test Et
        </button>
      </div>
    </div>
  );
}
