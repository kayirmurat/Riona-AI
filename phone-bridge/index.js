import "dotenv/config";
import express from "express";
import expressWs from "express-ws";
import WebSocket from "ws";

const {
  OPENAI_API_KEY,
  APP_BASE_URL,
  PHONE_BRIDGE_SECRET,
  TWILIO_WEBHOOK_PATH_SECRET,
  REALTIME_MODEL = "gpt-realtime-2.1",
  VOICE = "alloy",
  PORT = 8080,
} = process.env;

if (!OPENAI_API_KEY || !APP_BASE_URL || !PHONE_BRIDGE_SECRET || !TWILIO_WEBHOOK_PATH_SECRET) {
  console.error(
    "[phone-bridge] Eksik ortam değişkeni: OPENAI_API_KEY, APP_BASE_URL, PHONE_BRIDGE_SECRET, TWILIO_WEBHOOK_PATH_SECRET hepsi gerekli."
  );
  process.exit(1);
}

const expressApp = express();
expressApp.set("trust proxy", true);
const { app } = expressWs(expressApp);
app.use(express.urlencoded({ extended: false }));

function escapeXml(value) {
  return String(value ?? "").replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

// Ana Next.js uygulamasındaki /api/phone/* iç endpoint'lerini çağırır — bu
// köprü sunucusu bilinçli olarak "aptal" tutuluyor: sistem talimatı, araç
// çalıştırma, onay kuyruğu ve konuşma kaydı gibi TÜM iş mantığı orada,
// burada tekrarlanmıyor.
async function callApp(path, options = {}) {
  try {
    const res = await fetch(`${APP_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PHONE_BRIDGE_SECRET}`,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      console.error(`[phone-bridge] ${path} isteği başarısız: HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`[phone-bridge] ${path} isteği sırasında hata:`, err);
    return null;
  }
}

app.get("/", (req, res) => {
  res.json({ message: "Riona telefon köprü sunucusu çalışıyor." });
});

// Twilio'nun gelen arama webhook'u — path'teki secret ek bir doğrulama
// katmanı (diğer webhook'larla aynı desen, bkz. ana repodaki
// app/api/webhooks/*/[secret]/route.ts).
app.post("/incoming-call/:secret", (req, res) => {
  if (req.params.secret !== TWILIO_WEBHOOK_PATH_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  const callerNumber = escapeXml(req.body?.From ?? "");
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${req.headers.host}/media-stream">
      <Parameter name="callerNumber" value="${callerNumber}" />
    </Stream>
  </Connect>
</Response>`;

  res.type("text/xml").send(twiml);
});

app.ws("/media-stream", (twilioWs) => {
  let streamSid = null;
  let callerNumber = "bilinmeyen numara";
  let conversationId = null;
  let openAiWs = null;

  // Twilio'nun "mark" olayını sırayla eşleştirip Riona konuşurken arayanın
  // araya girip girmediğini (barge-in) anlamak, o anki asistan cevabını
  // kesip (conversation.item.truncate) Twilio'nun kendi ses kuyruğunu da
  // temizlemek (event: "clear") için kullanılıyor — aksi halde araya girme
  // sonrası Riona kendi eski cevabını çalmaya devam ederdi.
  let latestMediaTimestamp = 0;
  let lastAssistantItem = null;
  let markQueue = [];
  let responseStartTimestampTwilio = null;

  function sendMark() {
    if (!streamSid) return;
    twilioWs.send(JSON.stringify({ event: "mark", streamSid, mark: { name: "responsePart" } }));
    markQueue.push("responsePart");
  }

  function handleSpeechStarted() {
    if (markQueue.length > 0 && responseStartTimestampTwilio != null) {
      const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
      if (lastAssistantItem && openAiWs?.readyState === WebSocket.OPEN) {
        openAiWs.send(
          JSON.stringify({
            type: "conversation.item.truncate",
            item_id: lastAssistantItem,
            content_index: 0,
            audio_end_ms: elapsedTime,
          })
        );
      }
      twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
      markQueue = [];
      lastAssistantItem = null;
      responseStartTimestampTwilio = null;
    }
  }

  function connectToOpenAI(sessionConfig) {
    openAiWs = new WebSocket(`wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    });

    openAiWs.on("open", () => {
      openAiWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            type: "realtime",
            model: REALTIME_MODEL,
            output_modalities: ["audio"],
            audio: {
              input: { format: { type: "audio/pcmu" }, turn_detection: { type: "server_vad" } },
              output: { format: { type: "audio/pcmu" }, voice: VOICE },
            },
            instructions: sessionConfig?.instructions ?? "Sen Riona'sın, bir telefon asistanısın.",
            tools: sessionConfig?.tools ?? [],
          },
        })
      );
    });

    openAiWs.on("message", async (raw) => {
      let event;
      try {
        event = JSON.parse(raw);
      } catch {
        return;
      }

      if (event.type === "response.output_audio.delta" && event.delta) {
        twilioWs.send(JSON.stringify({ event: "media", streamSid, media: { payload: event.delta } }));
        if (!responseStartTimestampTwilio) responseStartTimestampTwilio = latestMediaTimestamp;
        if (event.item_id) lastAssistantItem = event.item_id;
        sendMark();
      }

      if (event.type === "input_audio_buffer.speech_started") {
        handleSpeechStarted();
      }

      if (event.type === "response.function_call_arguments.done") {
        let args = {};
        try {
          args = JSON.parse(event.arguments || "{}");
        } catch {
          // boş bırakılıyor, execute-tool boş args ile çağrılır.
        }
        const result = await callApp("/api/phone/execute-tool", {
          method: "POST",
          body: JSON.stringify({ conversationId, name: event.name, arguments: args }),
        });
        if (openAiWs?.readyState === WebSocket.OPEN) {
          openAiWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: {
                type: "function_call_output",
                call_id: event.call_id,
                output: JSON.stringify(result ?? { message: "İşlem yapılamadı." }),
              },
            })
          );
          openAiWs.send(JSON.stringify({ type: "response.create" }));
        }
      }

      // Transkript: arayanın ve Riona'nın söyledikleri, arama bittikten
      // sonra web arayüzünde bir "konuşma" olarak görünsün ve hafıza/
      // kişiselleştirme sürecine dahil olsun diye ana uygulamaya yazılıyor.
      if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript && conversationId) {
        callApp("/api/phone/log-message", {
          method: "POST",
          body: JSON.stringify({ conversationId, role: "user", content: event.transcript }),
        });
      }
      if (event.type === "response.output_audio_transcript.done" && event.transcript && conversationId) {
        callApp("/api/phone/log-message", {
          method: "POST",
          body: JSON.stringify({ conversationId, role: "assistant", content: event.transcript }),
        });
      }

      if (event.type === "error") {
        console.error("[phone-bridge] OpenAI Realtime hatası:", JSON.stringify(event));
      }
    });

    openAiWs.on("error", (err) => console.error("[phone-bridge] OpenAI WS bağlantı hatası:", err));
    openAiWs.on("close", () => console.log("[phone-bridge] OpenAI Realtime bağlantısı kapandı."));
  }

  twilioWs.on("message", async (raw) => {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    switch (data.event) {
      case "start": {
        streamSid = data.start.streamSid;
        callerNumber = data.start.customParameters?.callerNumber || "bilinmeyen numara";
        latestMediaTimestamp = 0;
        responseStartTimestampTwilio = null;

        const [sessionConfig, startResult] = await Promise.all([
          callApp("/api/phone/session-config", { method: "GET" }),
          callApp("/api/phone/start-call", { method: "POST", body: JSON.stringify({ callerNumber }) }),
        ]);
        conversationId = startResult?.conversationId ?? null;
        connectToOpenAI(sessionConfig);
        break;
      }
      case "media":
        latestMediaTimestamp = data.media.timestamp;
        if (openAiWs?.readyState === WebSocket.OPEN) {
          openAiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: data.media.payload }));
        }
        break;
      case "mark":
        if (markQueue.length > 0) markQueue.shift();
        break;
      case "stop":
        if (openAiWs?.readyState === WebSocket.OPEN) openAiWs.close();
        break;
      default:
        break;
    }
  });

  twilioWs.on("close", () => {
    if (openAiWs?.readyState === WebSocket.OPEN) openAiWs.close();
    console.log("[phone-bridge] Arama sona erdi.");
  });
});

app.listen(PORT, () => {
  console.log(`[phone-bridge] ${PORT} portunda dinliyor.`);
});
