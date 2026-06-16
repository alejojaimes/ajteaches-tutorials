<div align="center">

# ajteaches · tutorials 🥭

**Ingeniería, bien enseñada.**

[![Blog](https://img.shields.io/badge/blog-ajteaches.dev-4F46E5?style=flat-square&logo=hashnode&logoColor=white)](https://www.ajteaches.dev)
[![License: MIT](https://img.shields.io/badge/license-MIT-4F46E5?style=flat-square)](./LICENSE)
[![Talleres](https://img.shields.io/badge/talleres_disponibles-1-4F46E5?style=flat-square)](#talleres-disponibles)

</div>

---

Repositorio de talleres y tutoriales prácticos de ingeniería de datos: computación distribuida, procesamiento a escala y herramientas cloud, escritos para acompañar el contenido publicado en [ajteaches.dev](https://www.ajteaches.dev).

Cada carpeta es un taller independiente — incluye código, datasets de referencia, scripts SQL, definiciones de infraestructura y evidencia de ejecución. La idea es que puedas clonar una carpeta puntual y seguir el taller de principio a fin sin depender del resto del repositorio.

---

## Talleres disponibles

| # | Taller | Stack | Nivel |
|---|--------|-------|-------|
| 01 | [Spark / AWS Glue Workshop](./spark-glue-workshop) | Apache Spark · PySpark · AWS Glue · Step Functions · Athena · S3 | Intermedio |

> Nuevos talleres se agregan a esta tabla a medida que se publican en el blog. Las carpetas que no aparecen listadas aquí están en construcción.

---

## Estructura de un taller

Todos los talleres comparten una convención común para facilitar la navegación entre uno y otro:

```
nombre-del-taller/
├── README.md        ← bitácora del taller, con evidencia de cada paso
├── data/            ← datasets de entrada (no versionados en git)
├── scripts/         ← código fuente del taller
├── sql/             ← consultas y definiciones SQL, si aplica
└── evidence/        ← capturas de pantalla de cada paso completado
```

El `README.md` de cada taller no se escribe todo al final: se construye paso a paso junto con las capturas de evidencia, de modo que funciona como bitácora de avance y como documentación final al mismo tiempo.

---

## Cómo empezar

```bash
git clone https://github.com/alejojaimes/ajteaches-tutorials.git
cd ajteaches-tutorials/<nombre-del-taller>
```

Cada taller documenta sus propios requisitos previos (cuentas de servicios cloud, versiones de Python, dependencias) en su README local. El paso a paso detallado, las capturas comentadas y el contexto teórico están en [ajteaches.dev](https://www.ajteaches.dev).

---

## Sobre ajteaches

Soy un ingeniero que enseña. Publico el contenido explicativo: el contexto, la teoría y el paso a paso comentado de cada taller. Pero te lo cuento mejor en [ajteaches.dev](https://www.ajteaches.dev/u/ajteaches)
---

## Licencia

Distribuido bajo la [licencia MIT](./LICENSE). El código de cada taller puede reutilizarse libremente dando el crédito correspondiente.
