// frontend/app.js
// Conecta la cámara, MediaPipe, la lógica de gestos y la API en la nube.
import {
  FilesetResolver,
  FaceLandmarker,
  GestureRecognizer,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs";

import { API_URL } from "./config.js";
import {
  GESTURES,
  CONFIG,
  computeFaceMetrics,
  classify,
  isWinking,
  GestureStabilizer,
  NeutralPoseTracker,
} from "./gestures.js";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm";
const FACE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const GESTURE_MODEL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

const CLOUD = Boolean(API_URL);
const STATS_REFRESH_MS = 4000;
const EVENT_NAME = "Congreso CIETA XVIII - 2026";

const WINK_FRAMES = 5;            // frames seguidos con un ojo cerrado para contar como guiño
const CAPTURE_COUNTDOWN = 3;      // segundos para alcanzar a hacer el gesto
const CAPTURE_COOLDOWN_MS = 4000; // evita capturas repetidas por un mismo guiño
const CAPTURES_PER_PAGE = 6;

// ---------- Elementos de la página ----------
const $ = (id) => document.getElementById(id);
const video = $("video");
const overlay = $("overlay");
const ctx = overlay.getContext("2d");
const startBtn = $("start");
const statusEl = $("status");
const modeEl = $("mode");
const memeImg = $("meme-img");
const memeEmpty = $("meme-empty");
const memeLabel = $("meme-label");
const gestureGrid = $("gestures");
const rankingEl = $("ranking");
const totalEl = $("total");
const debugToggle = $("debug-toggle");
const debugPanel = $("debug");
const debugValues = $("debug-values");
const calibrateBtn = $("calibrate");
const fileInput = $("file-input");
const toastEl = $("toast");
const countdownEl = $("countdown");
const flashEl = $("flash");
const captureBtn = $("capture-btn");
const capturesEl = $("captures");
const capturesEmpty = $("captures-empty");
const capturesCount = $("captures-count");
const clearBtn = $("clear-captures");
const pagerEl = $("pager");
const prevBtn = $("prev-page");
const nextBtn = $("next-page");
const pageInfo = $("page-info");

// ---------- Estado ----------
let memes = {}; // gestureId -> { label, url }
const localCounts = Object.fromEntries(GESTURES.map((g) => [g.id, 0]));
const stabilizer = new GestureStabilizer();
const neutral = new NeutralPoseTracker();
let faceLandmarker;
let gestureRecognizer;
let lastVideoTime = -1;
let uploadTarget = null;
let cameraOn = false;
let activeGesture = null;
let winkFrames = 0;
let capturing = false;
let lastCaptureAt = 0;
let captureCount = 0;          // consecutivo para el nombre del archivo
let captures = [];             // [{ id, url }] la más reciente primero
let capturesPage = 0;

// ---------- Utilidades ----------
function setStatus(text) {
  statusEl.textContent = text;
}

let toastTimer;
function toast(text, kind = "") {
  toastEl.textContent = text;
  toastEl.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.className = "toast"), 3500);
}

async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Error ${res.status}`);
  return data;
}

const labelOf = (id) => GESTURES.find((g) => g.id === id)?.label ?? id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Memes ----------
async function loadMemes() {
  if (!CLOUD) {
    memes = Object.fromEntries(
      GESTURES.map((g) => [g.id, { label: g.label, url: `memes/${g.id}.jpg` }])
    );
  } else {
    memes = await api("/memes");
  }
  renderGestureGrid();
}

function renderGestureGrid() {
  gestureGrid.replaceChildren(
    ...GESTURES.map((g) => {
      const card = document.createElement("div");
      card.className = "gesture";
      card.dataset.id = g.id;
      if (g.id === activeGesture) card.classList.add("active");

      const thumb = document.createElement("div");
      thumb.className = "thumb";
      if (memes[g.id]) {
        const img = document.createElement("img");
        // crossOrigin permite dibujar la imagen en el canvas de la captura
        img.crossOrigin = "anonymous";
        img.src = memes[g.id].url;
        img.alt = g.label;
        thumb.append(img);
      } else {
        thumb.textContent = "?";
      }

      const name = document.createElement("strong");
      name.textContent = g.label;
      const hint = document.createElement("span");
      hint.textContent = g.hint;

      card.append(thumb, name, hint);

      if (CLOUD) {
        const change = document.createElement("button");
        change.className = "change";
        change.textContent = "Cambiar meme";
        change.addEventListener("click", () => {
          uploadTarget = g.id;
          fileInput.click();
        });
        card.append(change);
      }
      return card;
    })
  );
}

function showGesture(gestureId) {
  activeGesture = gestureId;
  document.querySelectorAll(".gesture").forEach((el) => {
    el.classList.toggle("active", el.dataset.id === gestureId);
  });

  if (!gestureId) {
    memeImg.hidden = true;
    memeEmpty.hidden = false;
    memeLabel.textContent = "Haz un gesto";
    return;
  }

  const meme = memes[gestureId];
  memeLabel.textContent = labelOf(gestureId);

  if (meme) {
    memeImg.src = meme.url;
    memeImg.hidden = false;
    memeEmpty.hidden = true;
    memeImg.classList.remove("pop");
    void memeImg.offsetWidth; // reinicia la animación
    memeImg.classList.add("pop");
  } else {
    memeImg.hidden = true;
    memeEmpty.hidden = false;
  }
}

// ---------- Subida de memes propios ----------
fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  fileInput.value = "";
  if (!file || !uploadTarget) return;

  try {
    toast("Subiendo meme...");
    const { upload } = await api("/memes/upload-url", {
      method: "POST",
      body: JSON.stringify({ gestureId: uploadTarget, contentType: file.type }),
    });

    // POST directo a S3: los campos firmados primero y el archivo al final
    const form = new FormData();
    Object.entries(upload.fields).forEach(([k, v]) => form.append(k, v));
    form.append("file", file);
    const res = await fetch(upload.url, { method: "POST", body: form });
    if (!res.ok) throw new Error("S3 rechazó el archivo (¿pesa más de 5 MB?)");

    // La Lambda register_meme se dispara sola con el evento de S3. Se espera a que registre.
    const before = memes[uploadTarget]?.url.split("?")[0];
    for (let i = 0; i < 6; i++) {
      await sleep(1000);
      await loadMemes();
      const after = memes[uploadTarget]?.url.split("?")[0];
      if (after && after !== before) break;
    }
    toast("¡Meme actualizado!", "success");
  } catch (err) {
    toast(err.message, "error");
  }
});

// ---------- Ranking ----------
function renderRanking(rows, total) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  totalEl.textContent = `${total} gestos`;
  rankingEl.replaceChildren(
    ...rows.map((row) => {
      const li = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = labelOf(row.gestureId);
      const bar = document.createElement("div");
      bar.className = "bar";
      const fill = document.createElement("div");
      fill.style.width = `${(row.count / max) * 100}%`;
      bar.append(fill);
      const count = document.createElement("b");
      count.textContent = row.count;
      li.append(label, bar, count);
      return li;
    })
  );
}

async function refreshStats() {
  if (CLOUD) {
    try {
      const { total, ranking } = await api("/stats");
      // Incluye los gestos que todavía no tienen conteo
      const seen = new Set(ranking.map((r) => r.gestureId));
      const rows = [
        ...ranking,
        ...GESTURES.filter((g) => !seen.has(g.id)).map((g) => ({ gestureId: g.id, count: 0 })),
      ];
      renderRanking(rows, total);
    } catch (err) {
      console.warn("No se pudo cargar el ranking", err);
    }
  } else {
    const rows = GESTURES.map((g) => ({ gestureId: g.id, count: localCounts[g.id] }))
      .sort((a, b) => b.count - a.count);
    renderRanking(rows, rows.reduce((s, r) => s + r.count, 0));
  }
}

function trackGesture(gestureId) {
  localCounts[gestureId] += 1;
  if (CLOUD) {
    api("/events", { method: "POST", body: JSON.stringify({ gestureId }) })
      .then(refreshStats)
      .catch((err) => console.warn("No se pudo registrar el gesto", err));
  } else {
    refreshStats();
  }
}

// ---------- Capturas ----------
function todayLabel() {
  return new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

// Arma una imagen con la cámara a la izquierda, el meme a la derecha y una franja del congreso abajo.
function composeCapture() {
  const W = 640, H = 480, BAND = 72;
  const canvas = document.createElement("canvas");
  canvas.width = W * 2;
  canvas.height = H + BAND;
  const c = canvas.getContext("2d");

  c.fillStyle = "#0d0f17";
  c.fillRect(0, 0, canvas.width, canvas.height);

  // Cámara en espejo, recortada para llenar el recuadro
  const vw = video.videoWidth, vh = video.videoHeight;
  const scale = Math.max(W / vw, H / vh);
  const sw = W / scale, sh = H / scale;
  c.save();
  c.translate(W, 0);
  c.scale(-1, 1);
  c.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H);
  c.restore();

  // Meme ajustado sin recortar
  c.fillStyle = "#07080d";
  c.fillRect(W, 0, W, H);
  const hasMeme = !memeImg.hidden && memeImg.complete && memeImg.naturalWidth > 0;
  if (hasMeme) {
    const s = Math.min(W / memeImg.naturalWidth, H / memeImg.naturalHeight);
    const mw = memeImg.naturalWidth * s, mh = memeImg.naturalHeight * s;
    c.drawImage(memeImg, W + (W - mw) / 2, (H - mh) / 2, mw, mh);
  } else {
    c.fillStyle = "#9097ab";
    c.font = "600 28px Geist, system-ui, sans-serif";
    c.textAlign = "center";
    c.fillText("Sin gesto 👀", W + W / 2, H / 2);
  }

  // Franja inferior con la identidad del evento
  const grad = c.createLinearGradient(0, 0, canvas.width, 0);
  grad.addColorStop(0, "#6366f1");
  grad.addColorStop(1, "#a78bfa");
  c.fillStyle = grad;
  c.fillRect(0, H, canvas.width, BAND);
  c.fillStyle = "#ffffff";
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.font = "800 30px Geist, system-ui, sans-serif";
  c.fillText("MemeCam", 28, H + BAND / 2);
  // El emoji y la fecha se dibujan por separado: si comparten fuente, los números salen con la de emojis
  const dateText = todayLabel();
  const emojiFont = "24px 'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif";
  const textFont = "600 22px Geist, system-ui, sans-serif";
  c.font = emojiFont;
  const emojiW = c.measureText("📸").width;
  c.font = textFont;
  const textW = c.measureText(dateText).width;
  const gap = 10;
  const startX = canvas.width / 2 - (emojiW + gap + textW) / 2;
  c.textAlign = "left";
  c.font = emojiFont;
  c.fillText("📸", startX, H + BAND / 2);
  c.font = textFont;
  c.fillText(dateText, startX + emojiW + gap, H + BAND / 2);
  c.textAlign = "right";
  c.font = "600 22px Geist, system-ui, sans-serif";
  c.fillText(EVENT_NAME, canvas.width - 28, H + BAND / 2);

  return canvas;
}

function addCaptureToGallery(blob) {
  captureCount += 1;
  captures.unshift({ id: captureCount, url: URL.createObjectURL(blob) });
  capturesPage = 0;
  renderCaptures();
}

function deleteCapture(id) {
  const capture = captures.find((c) => c.id === id);
  if (capture) URL.revokeObjectURL(capture.url); // libera la memoria de la imagen
  captures = captures.filter((c) => c.id !== id);
  renderCaptures();
}

function clearCaptures() {
  captures.forEach((c) => URL.revokeObjectURL(c.url));
  captures = [];
  capturesPage = 0;
  renderCaptures();
  toast("Capturas eliminadas");
}

function renderCaptures() {
  const pages = Math.max(1, Math.ceil(captures.length / CAPTURES_PER_PAGE));
  capturesPage = Math.min(capturesPage, pages - 1);
  const start = capturesPage * CAPTURES_PER_PAGE;

  capturesEl.replaceChildren(
    ...captures.slice(start, start + CAPTURES_PER_PAGE).map((capture) => {
      const item = document.createElement("div");
      item.className = "capture-item";

      const link = document.createElement("a");
      link.href = capture.url;
      link.download = `memecam-cieta-${String(capture.id).padStart(2, "0")}.png`;
      link.title = "Descargar captura";
      const img = document.createElement("img");
      img.src = capture.url;
      img.alt = `Captura ${capture.id}`;
      link.append(img);

      const del = document.createElement("button");
      del.className = "delete";
      del.type = "button";
      del.textContent = "✕";
      del.title = "Borrar captura";
      del.setAttribute("aria-label", `Borrar captura ${capture.id}`);
      del.addEventListener("click", () => deleteCapture(capture.id));

      item.append(link, del);
      return item;
    })
  );

  const total = captures.length;
  capturesEmpty.hidden = total > 0;
  clearBtn.hidden = total === 0;
  capturesCount.textContent = total ? `${total} ${total === 1 ? "captura" : "capturas"}` : "";
  pagerEl.hidden = total <= CAPTURES_PER_PAGE;
  pageInfo.textContent = `${capturesPage + 1} / ${pages}`;
  prevBtn.disabled = capturesPage === 0;
  nextBtn.disabled = capturesPage >= pages - 1;
}

prevBtn.addEventListener("click", () => { capturesPage -= 1; renderCaptures(); });
nextBtn.addEventListener("click", () => { capturesPage += 1; renderCaptures(); });

// Vaciar pide confirmación con un segundo clic, sin ventanas emergentes
let clearArmed = false;
let clearTimer;
clearBtn.addEventListener("click", () => {
  if (!clearArmed) {
    clearArmed = true;
    clearBtn.textContent = "¿Vaciar todo?";
    clearBtn.classList.add("danger");
    clearTimer = setTimeout(resetClearBtn, 3000);
    return;
  }
  clearTimeout(clearTimer);
  resetClearBtn();
  clearCaptures();
});
function resetClearBtn() {
  clearArmed = false;
  clearBtn.textContent = "Vaciar";
  clearBtn.classList.remove("danger");
}

async function startCapture(source) {
  if (!cameraOn) {
    toast("Activa la cámara primero", "error");
    return;
  }
  if (capturing || Date.now() - lastCaptureAt < CAPTURE_COOLDOWN_MS) return;
  capturing = true;
  captureBtn.disabled = true;

  try {
    countdownEl.hidden = false;
    for (let n = CAPTURE_COUNTDOWN; n > 0; n--) {
      countdownEl.textContent = n;
      await sleep(1000);
    }
    countdownEl.hidden = true;

    const canvas = composeCapture();
    flashEl.classList.remove("go");
    void flashEl.offsetWidth;
    flashEl.classList.add("go");

    const blob = await new Promise((resolve, reject) => {
      try {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar la imagen"))), "image/png");
      } catch (err) {
        reject(err);
      }
    });
    addCaptureToGallery(blob);
    toast("📸 Captura lista. Haz clic en ella para descargarla.", "success");
  } catch (err) {
    console.error(err);
    toast(
      err.name === "SecurityError"
        ? "El navegador bloqueó la imagen del meme. Revisa la configuración CORS del bucket."
        : `No se pudo tomar la captura: ${err.message}`,
      "error"
    );
  } finally {
    countdownEl.hidden = true;
    lastCaptureAt = Date.now();
    capturing = false;
    captureBtn.disabled = false;
  }
}

captureBtn.addEventListener("click", () => startCapture("botón"));

// ---------- MediaPipe ----------
async function createModels(delegate) {
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: FACE_MODEL, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
  });
  gestureRecognizer = await GestureRecognizer.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: GESTURE_MODEL, delegate },
    runningMode: "VIDEO",
    numHands: 2,
  });
}

async function loadModels() {
  setStatus("Cargando modelos de MediaPipe...");
  try {
    await createModels("GPU");
  } catch (err) {
    console.warn("GPU no disponible, usando CPU", err);
    await createModels("CPU");
  }
}

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;
}

function drawHands(hands) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  ctx.fillStyle = "#a78bfa";
  for (const hand of hands) {
    for (const p of hand.landmarks) {
      ctx.beginPath();
      ctx.arc(p.x * overlay.width, p.y * overlay.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function renderDebug(face, hands, detected) {
  if (debugPanel.hidden) return;
  const f = (n) => (typeof n === "number" ? n.toFixed(2) : "-");
  const drop = face && neutral.pitch ? (neutral.pitch - face.pitchRatio) / neutral.pitch : null;
  debugValues.textContent = [
    `jawOpen      ${f(face?.jawOpen)}   (umbral ${CONFIG.jawOpen})`,
    `smile        ${f(face?.smile)}   (umbral ${CONFIG.smile})`,
    `roll         ${f(face?.roll)}°  (umbral ${CONFIG.tiltDegrees}°)`,
    `cabeza atrás ${f(drop)}   (umbral ${CONFIG.headBackDrop})`,
    `ojos (L/R)   ${f(face?.blinkLeft)} / ${f(face?.blinkRight)}`,
    `manos        ${hands.map((h) => `${h.name} ${f(h.score)}`).join(", ") || "-"}`,
    `detectado    ${detected ?? "-"}`,
  ].join("\n");
}

function loop() {
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const now = performance.now();

    const faceResult = faceLandmarker.detectForVideo(video, now);
    const handResult = gestureRecognizer.recognizeForVideo(video, now);

    const face = faceResult.faceLandmarks.length
      ? computeFaceMetrics(
          faceResult.faceLandmarks[0],
          faceResult.faceBlendshapes[0]?.categories ?? [],
          video.videoWidth / video.videoHeight
        )
      : null;

    const hands = handResult.landmarks.map((landmarks, i) => ({
      landmarks,
      name: handResult.gestures[i]?.[0]?.categoryName ?? "None",
      score: handResult.gestures[i]?.[0]?.score ?? 0,
    }));

    const detected = classify(face, hands, neutral.pitch);
    const { active, changed } = stabilizer.update(detected);
    neutral.update(face, active ?? detected);

    if (changed) {
      showGesture(active);
      if (active) trackGesture(active);
    }

    // Guiño sostenido unos frames = captura
    winkFrames = isWinking(face) ? winkFrames + 1 : 0;
    if (winkFrames === WINK_FRAMES) startCapture("guiño");

    drawHands(hands);
    renderDebug(face, hands, detected);
  }
  requestAnimationFrame(loop);
}

// ---------- Arranque ----------
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  try {
    await loadModels();
    setStatus("Pidiendo acceso a la cámara...");
    await startCamera();
    startBtn.hidden = true;
    cameraOn = true;
    setStatus("Mira a la cámara con cara neutral un segundo y empieza a hacer gestos");
    loop();
  } catch (err) {
    console.error(err);
    startBtn.disabled = false;
    let message = `Error al iniciar: ${err.message}`;
    if (err.name === "NotAllowedError") {
      message = "Sin permiso para usar la cámara. Revisa el candado de la barra de direcciones.";
    } else if (err.name === "NotFoundError") {
      message = "No se encontró ninguna cámara conectada.";
    } else if (!window.isSecureContext) {
      message = "La cámara solo funciona en https:// o en localhost.";
    } else if (err.message.includes("fetch")) {
      message = "No se pudieron descargar los modelos de MediaPipe. Revisa la conexión a internet.";
    }
    setStatus(message);
  }
});

debugToggle.addEventListener("click", () => {
  debugPanel.hidden = !debugPanel.hidden;
  debugToggle.classList.toggle("on", !debugPanel.hidden);
});
calibrateBtn.addEventListener("click", () => {
  neutral.reset();
  toast("Pose neutral reiniciada: mira a la cámara con la cabeza derecha");
});

modeEl.textContent = CLOUD ? "Nube (AWS)" : "Modo local";
modeEl.classList.add(CLOUD ? "cloud" : "local");
showGesture(null);

loadMemes()
  .then(refreshStats)
  .catch((err) => toast(`No se pudieron cargar los memes: ${err.message}`, "error"));

if (CLOUD) setInterval(refreshStats, STATS_REFRESH_MS);
