# WebRTC YOLO App

Prototype for a WebRTC-based video conference with integrated YOLO object detection.

Two browser clients establish a direct WebRTC connection. In parallel, individual video frames are processed 
server-side and detected objects are rendered as bounding boxes on top of the remote video.

## Technologies

- Java 21 / Spring Boot
- WebRTC and WebSocket signaling
- Python / FastAPI
- YOLOv8 / ONNX Runtime
- HTML, JavaScript and Canvas API
- Docker / Docker Compose

## Architecture

```
Browser Client 1  ─┐
                   ├── direct WebRTC connection
Browser Client 2  ─┘

Browser Clients
       │
       │ WebSocket / HTTPS
       ▼
Spring Boot Backend
       │
       ▼
Frame Processor
       │
       ▼
YOLO Service
```

The Spring Boot backend handles signaling and forwards individual frames. The frame processor sends 
them to the YOLO service. Detection results are then requested by the opposite client and rendered in the browser.

## Highlights

- Two-client WebRTC connection with WebSocket signaling
- Separate Java and Python services
- Asynchronous frame processing
- Only every third frame is processed to reduce load
- Timestamp-based handling of stale detection results
- Docker Compose setup for all services
- YOLO Docker image reduced from approximately 27 GB to 3 GB by auditing runtime dependencies

## Project Structure

```
.
├── docker-compose.yml
├── docs/
├── webrtcyolo/
├── frame-processor-service/
└── yolo-service/
```

## Running Locally

Requirements:

- Docker / Docker Compose
- WebRTC-capable browser
- Camera access
- local PKCS12 development certificate
- YOLO model files

Start:

```
docker compose up --build
```

Clients:

```
https://localhost:8443/client1.html
https://localhost:8443/client2.html
```

A self-signed certificate is used for local development, so the browser may display a security warning.

## Notes

The current version is a technical prototype with two fixed peers. STUN is configured, while TURN, authentication and production-ready certificates are outside the scope of this version.

The YOLO service is partly based on the open-source project `Object_detection_fastAPI_docker` by Enes Agu and was adapted and optimized for this architecture.

See:

- `yolo-service/THIRD_PARTY_NOTICE.md`
- `yolo-service/LICENSE.upstream`

## Documentation

Detailed technical documentation is available in:

```
docs/entwicklerdokumentation.md
```
