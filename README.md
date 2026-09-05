# SafeSite AI: Real-Time Construction Site Safety Monitoring & Geofencing System

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-005571?style=flat&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB?style=flat&logo=react)](https://react.dev/)
[![YOLOv8](https://img.shields.io/badge/CV-Ultralytics%20YOLOv8-FF6F00?style=flat&logo=ultralytics)](https://ultralytics.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

SafeSite AI is an end-to-end computer vision and real-time telemetry dashboard designed to automate safety compliance on construction sites. The system detects workers, verifies PPE compliance (Hardhats and Safety Vests), enforces dynamic perimeter hazard geofences via ray-casting geometry, and logs safety infractions with instant audio-visual alerts.

---

## 🚀 Key Features

* **Real-Time Object Detection & Tracking:** Utilizes a custom-trained YOLOv8s model coupled with ByteTrack for consistent worker multi-object tracking across frames.
* **PPE Compliance Verification:** Automated IoU spatial matching to flag workers missing mandatory hardhats or safety vests.
* **Interactive Hazard Geofencing:** Draw custom polygon danger zones directly on the video interface to monitor restricted perimeter breaches.
* **Multi-Source Video Input:** Stream live feeds via browser WebRTC webcam or upload recorded MP4/WebM CCTV surveillance footage.
* **Instant Incident Logging & Auditing:** Real-time WebSocket event feed with automatic visual snapshot captures, synthesized Web Audio alerts, and 1-click CSV compliance audit report exports.

---

## 🛠️ Tech Stack

* **Backend:** Python, FastAPI, WebSockets, Ultralytics YOLOv8, OpenCV, Supervision, NumPy
* **Frontend:** React, Vite, HTML5 Canvas API, Lucide Icons, CSS3 Grid

---

## 📂 Project Structure

```text
safesite-ai/
├── backend/
│   ├── models/
│   │   └── best.pt          # Trained YOLOv8 weights
│   ├── main.py              # FastAPI application & WebSocket router
│   ├── vision_engine.py     # Inference pipeline, tracking, & geofencing geometry
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Dashboard UI & Canvas renderer
│   │   └── index.css        # Clean custom styling
│   ├── package.json
│   └── vite.config.js
└── README.md