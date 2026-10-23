<div align="center">

# ajteaches · tutorials 🥭

**Ingeniería, bien enseñada.**

[![Blog](https://img.shields.io/badge/blog-ajteaches.dev-4F46E5?style=flat-square&logo=hashnode&logoColor=white)](https://www.ajteaches.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-4F46E5?style=flat-square)](./LICENSE)
[![Talleres](https://img.shields.io/badge/talleres_disponibles-2-4F46E5?style=flat-square)](#talleres-disponibles)

</div>

---

Repositorio de talleres y tutoriales prácticos de ingeniería: computación distribuida, procesamiento a escala, arquitecturas serverless y herramientas cloud, escritos para acompañar el contenido publicado en [ajteaches.dev](https://www.ajteaches.dev).

Cada carpeta es un taller independiente — incluye código, datos o recursos de referencia, definiciones de infraestructura y evidencia de ejecución. La idea es que puedas clonar una carpeta puntual y seguir el taller de principio a fin sin depender del resto del repositorio.

---

## Talleres disponibles

| # | Taller | Stack | Nivel |
|---|--------|-------|-------|
| 01 | [Spark / AWS Glue Workshop](./spark-glue-workshop) | Apache Spark · PySpark · AWS Glue · Step Functions · Athena · S3 | Intermedio |
| 02 | [MemeCam · Hands-on Serverless](./memecam-workshop) | AWS Lambda · API Gateway · DynamoDB · S3 · Amplify · MediaPipe | Principiante |

> Nuevos talleres se agregan a esta tabla a medida que se publican en el blog. Las carpetas que no aparecen listadas aquí están en construcción.

### 02 · MemeCam · Hands-on Serverless

Una app que reconoce gestos de la cara y las manos con MediaPipe y responde con un meme distinto por cada uno. Con un guiño toma una foto con tu cara y el meme lado a lado. El backend corre en AWS con una arquitectura de lambdas: cinco funciones, una de ellas disparada por S3, sin un solo servidor que administrar.

Nació como minicurso del **XVIII Congreso Internacional de Electrónica y Tecnologías de Avanzada – CIETA 2026** (Pamplona, Colombia) y está pensado para quien nunca ha tocado la nube: el paso a paso arranca desde crear la cuenta de AWS.

---

## Estructura de un taller

Cada taller organiza sus carpetas según lo que construye. Un taller de datos trae `data/`, `scripts/` y `sql/`; uno de aplicaciones trae `frontend/`, `lambdas/` e `iam/`. Lo que comparten todos:

```
nombre-del-taller/
├── README.md        ← qué se construye, requisitos y cómo se ve funcionando
├── ...              ← código del taller (scripts, lambdas, frontend, sql, etc.)
└── evidence/        ← capturas de cada paso completado
```

Las capturas de `evidence/` muestran el taller montado de punta a punta. Si en algún paso algo no se ve igual, sirven de referencia.

---

## Cómo empezar

```bash
git clone https://github.com/alejojaimes/ajteaches-tutorials.git
cd ajteaches-tutorials/<nombre-del-taller>
```

Cada taller documenta sus propios requisitos previos (cuentas de servicios cloud, versiones de Python, dependencias) en su README local. El paso a paso detallado, las capturas comentadas y el contexto teórico están en [ajteaches.dev](https://www.ajteaches.dev).

---

## Sobre ajteaches

Soy un ingeniero que enseña. Publico el contenido explicativo: el contexto, la teoría y el paso a paso comentado de cada taller. Pero te lo cuento mejor en [ajteaches.dev](https://www.ajteaches.dev/u/ajteaches).

---

## Licencia

Distribuido bajo la [licencia MIT](./LICENSE). El código de cada taller puede reutilizarse libremente dando el crédito correspondiente.
