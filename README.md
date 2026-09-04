# WebRTC YOLO App

Prototyp für eine WebRTC-basierte Videokonferenz mit angebundener YOLO-Objekterkennung.

Zwei Browser-Clients bauen eine direkte WebRTC-Verbindung auf. Parallel werden einzelne Videoframes serverseitig verarbeitet und erkannte Objekte als Bounding Boxes über dem Remote-Video dargestellt.

## Technologien

- Java 21 / Spring Boot
- WebRTC und WebSocket-Signaling
- Python / FastAPI
- YOLOv8 / ONNX Runtime
- HTML, JavaScript und Canvas API
- Docker / Docker Compose

## Architektur

```
Browser Client 1  ─┐
                   ├── direkte WebRTC-Verbindung
Browser Client 2  ─┘

Browser Clients
       │
       │ WebSocket / HTTPS
       ▼
Spring-Boot-Backend
       │
       ▼
Frame-Processor
       │
       ▼
YOLO-Service
```

Das Spring-Boot-Backend übernimmt das Signaling und die Weiterleitung einzelner Frames. Der Frame-Processor 
übergibt diese an den YOLO-Service. Die erkannten Objekte werden anschließend vom jeweils anderen Client abgerufen 
und im Browser dargestellt.

## Besondere Punkte

- Zwei-Client-WebRTC-Verbindung mit WebSocket-Signaling
- getrennte Java- und Python-Services
- asynchrone Frame-Verarbeitung
- Verarbeitung nur jedes dritten Frames zur Lastreduzierung
- Verwerfen veralteter Detection-Ergebnisse über Timestamps
- Docker-Compose-Setup für alle Services
- Optimierung des YOLO-Docker-Images von ca. 27 GB auf ca. 3 GB durch Bereinigung der Runtime-Abhängigkeiten

## Projektstruktur

```
.
├── docker-compose.yml
├── docs/
├── webrtcyolo/
├── frame-processor-service/
└── yolo-service/
```

## Lokaler Start

Voraussetzungen:

- Docker / Docker Compose
- WebRTC-fähiger Browser
- Kamera-Zugriff
- lokales PKCS12-Entwicklungszertifikat
- YOLO-Modell-Dateien

Start:

```
docker compose up --build
```

Clients:

```
https://localhost:8443/client1.html
https://localhost:8443/client2.html
```

Für die lokale Entwicklung wird ein selbstsigniertes Zertifikat verwendet. 
Der Browser kann deshalb eine Sicherheitswarnung anzeigen.

## Hinweise

Der aktuelle Stand ist ein technischer Prototyp mit zwei festen Peers. STUN ist konfiguriert, ein TURN-Server sowie 
Authentifizierung und produktive Zertifikate sind nicht Bestandteil dieser Version.

Der YOLO-Service basiert teilweise auf dem Open-Source-Projekt `Object_detection_fastAPI_docker` von Enes Agu und 
wurde für diese Architektur angepasst und optimiert.

Weitere Hinweise:

- `yolo-service/THIRD_PARTY_NOTICE.md`
- `yolo-service/LICENSE.upstream`

## Dokumentation

Eine ausführliche technische Beschreibung befindet sich unter:

```
docs/entwicklerdokumentation.md
```
