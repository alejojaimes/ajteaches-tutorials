// frontend/gestures.js
// Lógica pura de detección de gestos. No depende de la cámara ni de MediaPipe,
// así que se puede leer, ajustar y probar por separado.

export const GESTURES = [
  { id: "open_mouth", label: "Abrir la boca", hint: "Abre la boca bien grande" },
  { id: "smile", label: "Sonreír", hint: "Sonríe mostrando los dientes" },
  { id: "fist", label: "Mostrar el puño", hint: "Muestra un puño a la cámara" },
  { id: "head_tilt", label: "Inclinar la cabeza", hint: "Ladea la cabeza, boca cerrada y sin sonreír" },
  { id: "touch_head", label: "Tocarse la cabeza", hint: "Lleva los dedos a la frente o la sien" },
  { id: "head_back", label: "Cabeza hacia atrás", hint: "Echa la cabeza atrás mirando a la cámara" },
  { id: "two_fists", label: "Mostrar los dos puños", hint: "Levanta los dos puños" },
  { id: "thumbs_up", label: "Pulgar arriba", hint: "Muestra el pulgar arriba" },
];

// Umbrales. Si un gesto se dispara de más o de menos, se ajusta aquí
// mirando los valores del modo debug.
export const CONFIG = {
  handScore: 0.6,        // confianza mínima del Gesture Recognizer
  twoFistScore: 0.35,    // con dos manos a la vez, MediaPipe suele dudar de una: se exige menos
  winkClosed: 0.5,       // guiño: un ojo cerrado por encima de este valor...
  winkOpen: 0.3,         // ...y el otro abierto, por debajo de este
  jawOpen: 0.45,         // boca abierta
  smile: 0.55,           // sonrisa (promedio de ambas comisuras)
  tiltDegrees: 18,       // inclinación lateral de la cabeza
  tiltMaxJaw: 0.25,      // para "inclinar la cabeza" la boca debe estar casi cerrada
  tiltMaxSmile: 0.4,     // ...y sin sonreír
  headBackDrop: 0.18,    // cuánto baja la relación nariz/mentón frente a la pose neutral (18 %)
  stableFrames: 5,       // frames seguidos para confirmar un gesto
  releaseFrames: 8,      // frames sin gesto para volver al estado neutral
};

// Índices de puntos de la malla facial de MediaPipe (468 puntos)
const FACE = {
  forehead: 10,
  chin: 152,
  noseTip: 1,
  rightEyeOuter: 33,
  leftEyeOuter: 263,
  rightBrow: 105,
  leftBrow: 334,
};

// Puntas de los dedos en la malla de la mano (21 puntos)
const FINGERTIPS = [4, 8, 12, 16, 20];

function blendshape(categories, name) {
  const found = categories.find((c) => c.categoryName === name);
  return found ? found.score : 0;
}

/**
 * Calcula las medidas de la cara que usan los gestos.
 * @param landmarks puntos normalizados (0..1) de una cara
 * @param categories blendshapes de esa cara
 * @param aspect ancho / alto del video (para medir ángulos sin deformación)
 */
export function computeFaceMetrics(landmarks, categories, aspect = 4 / 3) {
  const p = (i) => landmarks[i];
  const re = p(FACE.rightEyeOuter);
  const le = p(FACE.leftEyeOuter);

  const roll = (Math.atan2(le.y - re.y, (le.x - re.x) * aspect) * 180) / Math.PI;

  const eyeMidY = (re.y + le.y) / 2;
  const chinDist = p(FACE.chin).y - eyeMidY;
  const pitchRatio = chinDist > 0 ? (p(FACE.noseTip).y - eyeMidY) / chinDist : 0.5;

  let minX = 1, maxX = 0;
  for (const point of landmarks) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
  }

  return {
    blinkLeft: blendshape(categories, "eyeBlinkLeft"),
    blinkRight: blendshape(categories, "eyeBlinkRight"),
    jawOpen: blendshape(categories, "jawOpen"),
    smile: (blendshape(categories, "mouthSmileLeft") + blendshape(categories, "mouthSmileRight")) / 2,
    roll,
    pitchRatio,
    box: {
      minX,
      maxX,
      top: p(FACE.forehead).y,
      bottom: p(FACE.chin).y,
      browY: (p(FACE.rightBrow).y + p(FACE.leftBrow).y) / 2,
    },
  };
}

/**
 * ¿Alguna punta de dedo está en la zona de la frente o la sien?
 */
export function isTouchingHead(handLandmarks, box) {
  const height = box.bottom - box.top;
  const width = box.maxX - box.minX;
  const zone = {
    left: box.minX - width * 0.25,
    right: box.maxX + width * 0.25,
    top: box.top - height * 0.3,
    bottom: box.browY + height * 0.05,
  };
  return FINGERTIPS.some((i) => {
    const tip = handLandmarks[i];
    return tip && tip.x >= zone.left && tip.x <= zone.right && tip.y >= zone.top && tip.y <= zone.bottom;
  });
}

/**
 * Guiño: un ojo cerrado y el otro abierto. Un parpadeo normal cierra los dos, así que no cuenta.
 */
export function isWinking(face, config = CONFIG) {
  if (!face) return false;
  const closed = Math.max(face.blinkLeft, face.blinkRight);
  const open = Math.min(face.blinkLeft, face.blinkRight);
  return closed >= config.winkClosed && open <= config.winkOpen;
}

/**
 * Decide qué gesto se está haciendo en un frame.
 * @param face resultado de computeFaceMetrics, o null si no hay cara
 * @param hands [{ name, score, landmarks }] de cada mano detectada
 * @param neutralPitch relación nariz/mentón en pose neutral (calibrada)
 * @returns id del gesto o null
 */
export function classify(face, hands, neutralPitch, config = CONFIG) {
  const confident = hands.filter((h) => h.score >= config.handScore);
  const fists = confident.filter((h) => h.name === "Closed_Fist");
  const anyFists = hands.filter((h) => h.name === "Closed_Fist");

  // Los gestos con las manos van primero: son más claros y deliberados.
  if (anyFists.filter((h) => h.score >= config.twoFistScore).length >= 2) return "two_fists";

  // Tocarse la cabeza es con los dedos: un puño o un pulgar arriba no cuentan,
  // y si hay dos manos con algún puño, la persona está intentando "dos puños".
  const tryingTwoFists = hands.length >= 2 && anyFists.length >= 1;
  const touching = hands.filter(
    (h) => h.name !== "Closed_Fist" && h.name !== "Thumb_Up" && face && isTouchingHead(h.landmarks, face.box)
  );
  if (!tryingTwoFists && touching.length > 0) return "touch_head";

  if (confident.some((h) => h.name === "Thumb_Up")) return "thumbs_up";
  if (fists.length >= 1) return "fist";

  if (!face) return null;

  if (face.jawOpen >= config.jawOpen) return "open_mouth";
  if (face.smile >= config.smile) return "smile";

  if (neutralPitch && (neutralPitch - face.pitchRatio) / neutralPitch >= config.headBackDrop) {
    return "head_back";
  }

  if (
    Math.abs(face.roll) >= config.tiltDegrees &&
    face.jawOpen < config.tiltMaxJaw &&
    face.smile < config.tiltMaxSmile
  ) {
    return "head_tilt";
  }

  return null;
}

/**
 * Evita que el meme parpadee: un gesto solo se activa si se mantiene
 * varios frames seguidos, y solo se suelta tras varios frames sin él.
 */
export class GestureStabilizer {
  constructor(config = CONFIG) {
    this.config = config;
    this.active = null;
    this.candidate = null;
    this.candidateFrames = 0;
    this.missingFrames = 0;
  }

  /** @returns {{ active: string|null, changed: boolean }} */
  update(detected) {
    const previous = this.active;

    if (detected && detected === this.active) {
      this.missingFrames = 0;
      this.candidate = null;
      this.candidateFrames = 0;
    } else if (detected) {
      if (detected === this.candidate) {
        this.candidateFrames += 1;
      } else {
        this.candidate = detected;
        this.candidateFrames = 1;
      }
      if (this.candidateFrames >= this.config.stableFrames) {
        this.active = detected;
        this.candidate = null;
        this.candidateFrames = 0;
        this.missingFrames = 0;
      }
    } else {
      this.candidate = null;
      this.candidateFrames = 0;
      if (this.active) {
        this.missingFrames += 1;
        if (this.missingFrames >= this.config.releaseFrames) {
          this.active = null;
          this.missingFrames = 0;
        }
      }
    }

    return { active: this.active, changed: this.active !== previous };
  }
}

/**
 * Promedio móvil de la pose neutral. Se actualiza solo cuando no hay gesto activo
 * y la cabeza está derecha, para que "cabeza hacia atrás" se mida contra tu postura normal.
 */
export class NeutralPoseTracker {
  constructor(alpha = 0.03) {
    this.alpha = alpha;
    this.pitch = null;
  }

  reset() {
    this.pitch = null;
  }

  update(face, activeGesture) {
    if (!face || activeGesture) return this.pitch;
    if (Math.abs(face.roll) > 8 || face.jawOpen > 0.2 || face.smile > 0.3) return this.pitch;
    this.pitch = this.pitch === null ? face.pitchRatio : this.pitch + this.alpha * (face.pitchRatio - this.pitch);
    return this.pitch;
  }
}
