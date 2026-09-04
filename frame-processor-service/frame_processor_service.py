from fastapi import FastAPI, UploadFile, File
from fastapi.responses import Response
import cv2
import numpy as np
import aiohttp
from aiohttp import FormData
import asyncio
import os

YOLO_API_URL = os.getenv("YOLO_API_URL", "http://yolo:8000")
YOLO_TIMEOUT = 5

app = FastAPI()

class YOLODetector:
    def __init__(self, api_url: str, timeout: int = 5):
        self.api_url = api_url
        self.timeout = aiohttp.ClientTimeout(total=timeout)
        self.session = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession(timeout=self.timeout)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def detect(self, frame_bytes: bytes) -> dict:
        if not self.session:
            raise RuntimeError("Session nicht initialisiert!")

        data = FormData()
        data.add_field('image', frame_bytes, filename='frame.jpg', content_type='image/jpeg')

        try:
            async with self.session.post(f"{self.api_url}/detect/", data=data) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    print(f"HTTP Error: {response.status}")
                    return {"objects": []}
        except asyncio.TimeoutError:
            print("[Timeout beim Request")
            return {"objects": []}
        except Exception as e:
            print(f"Exception: {e}")
            return {"objects": []}

@app.on_event("startup")            # ist ein Lifecycle Event,Fastapi ruft es selbst auf
async def startup():
    global detector         # global = Variable von oben, keine neue
    detector = YOLODetector(YOLO_API_URL, YOLO_TIMEOUT)
    await detector.__aenter__()

@app.on_event("shutdown")
async def shutdown():
    global detector
    if detector:
        await detector.__aexit__(None, None, None)      # None None None = Standard f. Exit-Fehler in Python Kontext-Managern
    print("Frame Processor Service gestoppt")

@app.post("/detect-json")
async def detect_json(image: UploadFile = File(...)):
    """
    Gibt nur die Bounding-Box-Koordinaten zurück (kein Bild).
    """
    try:
        contents = await image.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"objects": []}

        _, img_encoded = cv2.imencode('.jpg', frame)
        img_bytes = img_encoded.tobytes()

        # YOLO-Detektion
        detections = await detector.detect(img_bytes)

        if detections and 'objects' in detections:
            # num_objects = len(detections['objects'])
            # print(f"{num_objects} Objekt(e) erkannt (JSON)")

            # Nur die Koordinaten zurückgeben
            boxes = []
            for obj in detections['objects']:
                boxes.append({
                    "label": obj['label'],
                    "confidence": obj['confidence'],
                    "x": obj['x'],
                    "y": obj['y'],
                    "width": obj['width'],
                    "height": obj['height']
                })

            return {"objects": boxes}
        else:
            print("Keine Objekte erkannt")
            return {"objects": []}

    except Exception as e:
        print(f"Fehler: {e}")
        import traceback
        traceback.print_exc()
        return {"objects": []}

@app.get("/health")
async def health():
    return {"status": "ok", "yolo_api": YOLO_API_URL}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
