# Entwicklerdokumentation – WebRTC YOLO App

## 1. Überblick

Die WebRTC YOLO App ist ein Zwei-Client-Prototyp für WebRTC-basierte Videokommunikation mit angebundener YOLO-Objekterkennung.

Die Anwendung trennt die direkte Videoübertragung zwischen den Browsern von der serverseitigen Verarbeitung einzelner Videoframes. 
WebRTC wird für die Peer-to-Peer-Verbindung genutzt, während das Signaling über WebSockets läuft. Parallel werden einzelne Frames 
an eine separate Verarbeitungskette übergeben. Erkannte Objekte werden anschließend als Bounding Boxes über dem Remote-Video dargestellt.

Die Anwendung besteht aus drei zentralen Services:

| Service | Technologie | Verantwortung |
| --- | --- | --- |
| `backend` | Java 21, Spring Boot | Frontend-Auslieferung, WebSocket-Signaling, REST-Endpunkte |
| `frame-processor` | Python, FastAPI | Annahme und Weiterleitung von Frames an den YOLO-Service |
| `yolo` | Python, FastAPI, YOLOv8 | Objekterkennung auf hochgeladenen Bildern |

Der aktuelle Stand ist bewusst als technischer Prototyp für zwei feste Clients ausgelegt: `peer1` und `peer2`.

---

## 2. Architektur

Die Anwendung besteht aus einem Spring-Boot-Backend, einem FastAPI-Frame-Processor, einem separaten YOLO-Service und zwei statischen Browser-Clients.

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
       │ HTTP Multipart Upload
       ▼
Frame-Processor-Service
       │
       │ HTTP Multipart Upload
       ▼
YOLO-Service
```

Die eigentliche Videoverbindung läuft direkt zwischen den beiden Browsern.

Das Backend übernimmt:

- WebSocket-Signaling für den WebRTC-Verbindungsaufbau
- Annahme einzelner JPEG-Frames
- asynchrone Weiterleitung an den Frame-Processor
- Zwischenspeicherung der jeweils letzten YOLO-Ergebnisse pro Client
- Bereitstellung der Detection-Ergebnisse für den jeweils anderen Client

Der Frame-Processor bildet eine eigene Verarbeitungsschicht zwischen Backend und YOLO-Service. Dadurch bleibt die Objekterkennung vom Java-Backend entkoppelt.

---

## 3. Projektstruktur

```
.
├── docker-compose.yml
├── README.md
├── docs/
│   └── entwicklerdokumentation.md
├── webrtcyolo/
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/main/
│       ├── java/org/conference/webrtc/
│       │   ├── WebRtcYoloApplication.java
│       │   ├── config/WebSocketConfig.java
│       │   ├── controller/SignalingController.java
│       │   ├── handler/SignalingHandler.java
│       │   └── service/FrameProcessingService.java
│       └── resources/
│           ├── application.properties
│           └── static/
│               ├── client1.html
│               ├── client2.html
│               └── webrtc-utils.js
├── frame-processor-service/
│   ├── frame_processor_service.py
│   ├── requirements.txt
│   └── Dockerfile
└── yolo-service/
    ├── app.py
    ├── requirements.txt
    ├── Dockerfile
    ├── templates/
    │   └── index.html
    ├── THIRD_PARTY_NOTICE.md
    └── LICENSE.upstream
```

Lokale Laufzeitdaten wie `runs/`, `uploads/`, IDE-Dateien, Keystores und YOLO-Modell-Dateien werden nicht in das Git-Repository aufgenommen.

---

## 4. Docker-Compose-Setup

Docker Compose startet die drei Services im gemeinsamen Netzwerk `video-network`.

| Service | Container | Port | Verantwortung |
| --- | --- | ---: | --- |
| `backend` | `webrtc-backend2` | `8443` | Frontend, WebSocket-Signaling, REST |
| `frame-processor` | `frame-processor` | `5000` | Frame-Annahme und YOLO-Weiterleitung |
| `yolo` | `yolo-detector` | `8000` | Objekterkennung |

Interne Kommunikation:

```
Backend → Frame Processor
http://frame-processor:5000

Frame Processor → YOLO-Service
http://yolo:8000
```

Die Service-Adressen werden über Docker-Compose-Umgebungsvariablen übergeben:

```
FRAME_PROCESSOR_URL=http://frame-processor:5000
YOLO_API_URL=http://yolo:8000
```

---

## 5. Lokaler Betrieb

### Voraussetzungen

- Docker / Docker Compose
- WebRTC-fähiger Browser
- Kamera-Zugriff
- lokales PKCS12-Entwicklungszertifikat
- lokale YOLO-Modell-Dateien

Start aus dem Projektwurzelverzeichnis:

```
docker compose up --build
```

Anschließend können die beiden Clients geöffnet werden:

```
https://localhost:8443/client1.html
https://localhost:8443/client2.html
```

Für die lokale Entwicklung wird ein selbstsigniertes Zertifikat verwendet. Der Browser kann deshalb eine Sicherheitswarnung anzeigen.

Für einen Funktionstest können beide Clients auch in getrennten Browser-Tabs oder Browser-Fenstern auf demselben Rechner geöffnet werden.

### Lokale Endpunkte

| Dienst | URL |
| --- | --- |
| Backend | `https://localhost:8443` |
| Client 1 | `https://localhost:8443/client1.html` |
| Client 2 | `https://localhost:8443/client2.html` |
| Frame Processor | `http://localhost:5000/health` |
| YOLO-Service | `http://localhost:8000` |

---

## 6. Backend-Konfiguration

Die zentrale Spring-Boot-Konfiguration befindet sich in:

```
webrtcyolo/src/main/resources/application.properties
```

Beispiel:

```
server.port=8443
server.ssl.enabled=true
server.ssl.key-store-type=PKCS12
server.ssl.key-store=classpath:keystore-local.p12
server.ssl.key-store-password=${KEYSTORE_PASSWORD:keytool}
server.ssl.key-alias=tomcat
server.address=0.0.0.0

frame.processor.url=http://frame-processor:5000
```

Der Keystore dient ausschließlich der lokalen Entwicklung und wird nicht in das Git-Repository aufgenommen.

Das Passwort kann über die Umgebungsvariable `KEYSTORE_PASSWORD` gesetzt werden.

Spring Boot bildet die Docker-Compose-Umgebungsvariable `FRAME_PROCESSOR_URL` auf die Property `frame.processor.url` ab.

---

## 7. Frontend-Konfiguration

Die zentrale Frontend-Konfiguration befindet sich in:

```
webrtcyolo/src/main/resources/static/webrtc-utils.js
```

Relevante Werte:

```
const CONFIG = {
    BACKEND_URL: `https://${window.location.hostname}:8443`,
    WS_URL: `wss://${window.location.hostname}:8443/signaling-ws`,
    FRAME_UPLOAD_INTERVAL: 1000,
    YOLO_POLL_INTERVAL: 1000,
    VIDEO_WIDTH: 640,
    VIDEO_HEIGHT: 480,
    ICE_SERVERS: [
        { urls: 'stun:stun.l.google.com:19302' }
    ],
};
```

Die URLs werden dynamisch aus `window.location.hostname` gebildet. Dadurch kann derselbe Frontend-Code sowohl über `localhost` als auch über eine lokale Netzwerkadresse genutzt werden.

Aktuell ist ein öffentlicher STUN-Server konfiguriert. Ein TURN-Server ist nicht Bestandteil des Prototyps.

Die Browser-Clients verwenden Video ohne Audio.

---

## 8. WebRTC-Signaling

Beide Clients bauen eine WebSocket-Verbindung zu folgendem Endpunkt auf:

```
/signaling-ws
```

Danach registrieren sie sich mit einer festen Rolle:

```
peer1 → Backend: register-peer1
peer2 → Backend: register-peer2
```

`peer1` übernimmt die Rolle des Initiators.

Sobald beide Clients verfügbar sind, läuft der Signaling-Ablauf vereinfacht so:

```
peer1 → Backend → peer2: offer
peer2 → Backend → peer1: answer
peer1 ↔ Backend ↔ peer2: ice-candidate
```

Nach erfolgreichem Signaling läuft die Videoverbindung direkt zwischen den Browsern.

Das Backend selbst überträgt nicht den eigentlichen WebRTC-Videostream.

---

## 9. Frame-Verarbeitung

Beide Clients extrahieren periodisch einzelne Frames aus ihrem lokalen Videostream und senden diese als JPEG an das Backend.

Endpunkt:

```
POST /signaling/upload-frame?clientId={clientId}
```

Um die Verarbeitungslast zu reduzieren, verarbeitet das Backend nur jeden dritten eingehenden Frame.

Die Weiterleitung erfolgt asynchron:

```
Backend
   ↓
POST /detect-json
   ↓
Frame Processor
   ↓
POST /detect/
   ↓
YOLO-Service
```

Der Frame-Processor reduziert die YOLO-Antwort auf die für das Frontend benötigten Objektdaten.

Beispiel:

```
{
  "label": "person",
  "confidence": 0.87,
  "x": 320,
  "y": 240,
  "width": 100,
  "height": 180
}
```

`x` und `y` beschreiben den Mittelpunkt der Bounding Box. `width` und `height` beschreiben deren Größe.

---

## 10. Ergebnisverarbeitung im Frontend

Das Backend speichert die jeweils letzten Detection-Ergebnisse pro Client im Arbeitsspeicher.

Der jeweils andere Client fragt diese über folgenden Endpunkt ab:

```
GET /signaling/yolo-boxes?clientId={clientId}
```

Vor dem Speichern ergänzt das Backend einen Timestamp.

Das Frontend verwirft Ergebnisse, die älter als 30 Sekunden sind. Dadurch bleiben veraltete Bounding Boxes bei Verzögerungen oder Verbindungsproblemen nicht dauerhaft sichtbar.

Die Bounding Boxes werden anschließend über ein Canvas gezeichnet, das über dem Remote-Video liegt.

---

## 11. Schnittstellen

### Backend

| Typ | Pfad | Zweck |
| --- | --- | --- |
| WebSocket | `/signaling-ws` | Signaling zwischen `peer1` und `peer2` |
| POST | `/signaling/upload-frame?clientId={clientId}` | Upload eines JPEG-Frames |
| GET | `/signaling/yolo-boxes?clientId={clientId}` | Abruf der letzten YOLO-Ergebnisse |

### WebSocket-Nachrichten

| Typ | Zweck |
| --- | --- |
| `register-peer1` | Registrierung von Client 1 |
| `register-peer2` | Registrierung von Client 2 |
| `registered` | Bestätigung der Rolle |
| `peer2-ready` | Signal an `peer1`, dass beide Clients bereit sind |
| `offer` | WebRTC Offer |
| `answer` | WebRTC Answer |
| `ice-candidate` | Austausch von ICE Candidates |

### Frame Processor

| Methode | Pfad | Zweck |
| --- | --- | --- |
| POST | `/detect-json` | Frame-Annahme und Weiterleitung an YOLO |
| GET | `/health` | Healthcheck |

### YOLO-Service

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/` | einfache Testoberfläche |
| POST | `/detect/` | Objekterkennung für ein hochgeladenes Bild |
| POST | `/detect/{label}` | Objekterkennung mit optionaler Filterung |

---

## 12. Komponenten

### Backend

#### `WebRtcYoloApplication.java`

Einstiegspunkt der Spring-Boot-Anwendung.

#### `WebSocketConfig.java`

Registriert den WebSocket-Endpunkt `/signaling-ws`.

Für den lokalen Prototyp sind aktuell alle Origins zugelassen:

```
setAllowedOrigins("*")
```

Für einen produktiven Betrieb müsste diese Konfiguration eingeschränkt werden.

#### `SignalingHandler.java`

Verwaltet die beiden WebSocket-Sessions und leitet Signaling-Nachrichten zwischen `peer1` und `peer2` weiter.

#### `SignalingController.java`

Stellt die REST-Endpunkte für Frame-Upload und Detection-Ergebnisse bereit.

Wesentliche Aufgaben:

- getrennte Frame-Counter pro Client
- Verarbeitung nur jedes dritten Frames
- asynchrone Weiterleitung
- Zwischenspeicherung der letzten Ergebnisse
- Ergänzung eines Timestamps

#### `FrameProcessingService.java`

Überträgt Frames per Multipart-Request an den Python-Frame-Processor.

Bei einem Fehler wird ein valides leeres Ergebnis zurückgegeben:

```
{"objects":[]}
```

Dadurch bleibt die Antwortstruktur für das Frontend stabil.

---

## 13. Frame-Processor-Service

Datei:

```
frame-processor-service/frame_processor_service.py
```

Der Service:

- nimmt JPEG-Frames als Multipart-Datei entgegen
- dekodiert und normalisiert das Bild
- ruft den YOLO-Service asynchron auf
- reduziert die Antwort auf die benötigten Objektdaten
- liefert bei Fehlern oder Timeouts ein leeres `objects`-Array zurück

Die URL des YOLO-Services wird über eine Umgebungsvariable konfiguriert:

```
YOLO_API_URL = os.getenv("YOLO_API_URL", "http://yolo:8000")
```

Der Request-Timeout beträgt fünf Sekunden.

---

## 14. YOLO-Service

Der YOLO-Service basiert teilweise auf dem Open-Source-Projekt:

```
Object_detection_fastAPI_docker
von Enes Agu
```

Der ursprüngliche Service wurde in die Gesamtarchitektur integriert und für den konkreten Einsatz angepasst.

Die Herkunft und Lizenz sind separat dokumentiert:

```
yolo-service/THIRD_PARTY_NOTICE.md
yolo-service/LICENSE.upstream
```

Die eigentlichen YOLO-Modell-Dateien werden lokal verwendet, aber nicht in das Git-Repository aufgenommen.

Der Service arbeitet primär mit einer ONNX-Version des YOLOv8n-Modells. Falls keine ONNX-Datei vorhanden ist, kann diese aus einer lokalen `.pt`-Datei erzeugt werden.

---

## 15. Docker-Image-Optimierung

Ein wesentlicher Optimierungsschritt betraf den YOLO-Service.

Die ursprüngliche Dependency-Konfiguration führte zu einem Docker-Image von ungefähr 27 GB.

Die `requirements.txt` wurde schrittweise auf tatsächlich benötigte Laufzeitabhängigkeiten reduziert. Zusätzlich werden CPU-spezifische PyTorch-Pakete verwendet.

Dadurch konnte die Image-Größe auf ungefähr 3 GB reduziert werden, ohne die Objekterkennung zu beeinträchtigen.

Diese Optimierung war iterativ: Abhängigkeiten wurden entfernt, das Image neu gebaut und die Funktion anschließend erneut getestet.

---

## 16. Fehlerbehandlung

Mehrere Stellen der Anwendung sind so ausgelegt, dass einzelne Fehler nicht sofort die gesamte Verarbeitungskette unterbrechen.

Beispiele:

- Frame-Processor-Timeouts liefern `{"objects":[]}`
- fehlende Detection-Ergebnisse liefern weiterhin valides JSON
- parallele Frame-Uploads werden im Frontend verhindert
- ein Upload-Lock wird nach fünf Sekunden automatisch wieder freigegeben
- alte Detection-Ergebnisse werden anhand ihres Timestamps verworfen

Das Ziel ist ein stabiler Prototyp, bei dem vorübergehende Fehler möglichst nicht zu einem vollständigen Abbruch der Browser-Anwendung führen.

---

## 17. Technische Einschränkungen

Die aktuelle Version ist bewusst ein Prototyp.

| Bereich | Aktueller Stand | Mögliche Weiterentwicklung |
| --- | --- | --- |
| Teilnehmermodell | feste Rollen `peer1` und `peer2` | dynamische Räume und mehrere Teilnehmer |
| WebRTC-Netzwerk | STUN, kein TURN | TURN-Server für restriktive Netzwerke |
| Sicherheit | selbstsigniertes Zertifikat | produktive Zertifikate |
| WebSocket-Origin | offen für lokalen Test | Origins einschränken |
| Authentifizierung | nicht vorhanden | Benutzer-/Session-Konzept |
| Frame-Verarbeitung | nur jeder dritte Frame | Queue, Backpressure, Latest-Frame-Strategie |
| YOLO-Modell | Laden im Detection-Endpunkt | Modell einmal beim Service-Start laden |
| Persistenz | Ergebnisse nur im Speicher | optionale persistente Speicherung |
| Frontend | technische Zwei-Client-Oberfläche | Statusanzeigen und bessere Bedienoberfläche |
| Monitoring | einfache Konsolen-/Fehlerausgaben | strukturiertes Logging und Metriken |

Diese Punkte stellen keine Fehlerliste dar, sondern markieren bewusst vereinfachte Bereiche des Prototyps und mögliche Ansatzpunkte für eine Weiterentwicklung.
