import json
import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from vision_engine import SafeSiteEngine

app = FastAPI(title="SafeSite AI Inference Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("[INFO] Initializing SafeSite YOLOv8 Engine...")
engine = SafeSiteEngine(model_path="models/best.pt")
print("[INFO] Engine loaded successfully!")

@app.get("/health")
def health_check():
    return {"status": "active", "model": "SafeSite YOLOv8s"}

@app.websocket("/ws/inference")
async def inference_stream(websocket: WebSocket):
    await websocket.accept()
    print("[WS] Client connected successfully!")
    geofence_polygons = []

    try:
        while True:
            message = await websocket.receive()
            
            if "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    if payload.get("action") == "UPDATE_ZONES":
                        geofence_polygons = payload.get("zones", [])
                        print(f"[WS] Updated geofence zones: {len(geofence_polygons)} zones active.")
                except Exception as e:
                    print(f"[WS] Error parsing JSON text: {e}")

            elif "bytes" in message and message["bytes"]:
                frame_bytes = message["bytes"]
                np_arr = np.frombuffer(frame_bytes, np.uint8)
                frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

                if frame is None:
                    continue

                # Run inference + ByteTrack + Geofence geometry
                telemetry = engine.process_frame(frame, geofence_polygons)
                await websocket.send_json(telemetry)

    except WebSocketDisconnect:
        print("[WS] Client disconnected.")
    except Exception as e:
        print(f"[WS] Unexpected error in WebSocket loop: {e}")