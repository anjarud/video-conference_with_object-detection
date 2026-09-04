const CONFIG = {
    // Use the current hostname so the same frontend works on localhost
    // and on other devices in the local network.
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

let ws = null;
let pc = null;
let localStream = null;

// Prevent overlapping frame uploads.
const uploadState = { isProcessing: false };


async function setupWebRTC(clientId, remoteClientId, localVideo, remoteVideo, boxCanvas) {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: CONFIG.VIDEO_WIDTH,
            height: CONFIG.VIDEO_HEIGHT
        },
        audio: false
    });

    localVideo.srcObject = localStream;

    connectWebSocket(clientId);

    // Periodically send local frames for object detection.
    setInterval(() => {
        sendFrameToYOLO(localVideo, clientId, uploadState);
    }, CONFIG.FRAME_UPLOAD_INTERVAL);

    // Poll the detection results of the remote peer.
    setInterval(() => {
        fetchAndDrawYOLOBoxes(remoteClientId, boxCanvas);
    }, CONFIG.YOLO_POLL_INTERVAL);
}


// WEBSOCKET / SIGNALING

function connectWebSocket(clientId) {
    ws = new WebSocket(CONFIG.WS_URL);

    ws.onopen = () => {
        sendWSMessage(ws, { type: `register-${clientId}` });
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        handleSignalingMessage(message, clientId);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}


function handleSignalingMessage(message, clientId) {
    switch (message.type) {
        case 'registered':
            // Validate the role confirmed by the backend before continuing.
            if (clientId === 'peer1' && message.role === 'peer1') {
                // Peer1 waits until peer2 is ready before creating the offer.
            } else if (clientId === 'peer2' && message.role === 'peer2') {
                createPeerConnection(clientId);
            }
            break;

        case 'peer2-ready':
            // Peer1 is always the initiator of the WebRTC offer.
            createPeerConnection(clientId);
            break;

        case 'offer':
            handleOffer(message);
            break;

        case 'answer':
            pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: message.sdp
            }));
            break;

        case 'ice-candidate':
            if (pc) {
                pc.addIceCandidate(new RTCIceCandidate({
                    candidate: message.candidate,
                    sdpMid: message.sdpMid,
                    sdpMLineIndex: message.sdpMLineIndex
                }));
            }
            break;
    }
}


async function createPeerConnection(clientId) {
    pc = new RTCPeerConnection({
        iceServers: CONFIG.ICE_SERVERS
    });

    // Display the incoming video stream from the other peer.
    pc.ontrack = (event) => {
        const remoteVideo = document.getElementById('remoteVideo');
        remoteVideo.srcObject = event.streams[0];
    };

    // Relay ICE candidates through the signaling backend.
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendWSMessage(ws, {
                type: 'ice-candidate',
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex
            });
        }
    };

    // Add all tracks from the local camera stream.
    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    if (clientId === 'peer1') {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        sendWSMessage(ws, {
            type: 'offer',
            sdp: offer.sdp
        });
    }
}


async function handleOffer(message) {
    await pc.setRemoteDescription(new RTCSessionDescription({
        type: 'offer',
        sdp: message.sdp
    }));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    sendWSMessage(ws, {
        type: 'answer',
        sdp: answer.sdp
    });
}


// FRAME PROCESSING

async function sendFrameToYOLO(videoElement, clientId, state) {
    if (state.isProcessing || !videoElement.videoWidth) {
        return;
    }

    state.isProcessing = true;

    // Release the upload lock after five seconds if a request gets stuck.
    const timeout = setTimeout(() => {
        console.warn('Frame upload timeout');
        state.isProcessing = false;
    }, 5000);

    try {
        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0);

        // JPEG keeps transferred frame sizes smaller than an uncompressed image.
        canvas.toBlob(async (blob) => {
            const formData = new FormData();
            formData.append('image', blob, 'frame.jpg');

            try {
                await fetch(
                    `${CONFIG.BACKEND_URL}/signaling/upload-frame?clientId=${clientId}`,
                    {
                        method: 'POST',
                        body: formData
                    }
                );
            } catch (error) {
                console.error(`YOLO upload error (${clientId}):`, error);
            }

            clearTimeout(timeout);
            state.isProcessing = false;
        }, 'image/jpeg', 0.8);

    } catch (error) {
        clearTimeout(timeout);
        console.error(`Frame extraction error (${clientId}):`, error);
        state.isProcessing = false;
    }
}


async function fetchAndDrawYOLOBoxes(clientId, canvas) {
    try {
        const response = await fetch(
            `${CONFIG.BACKEND_URL}/signaling/yolo-boxes?clientId=${clientId}`
        );

        if (response.ok) {
            const data = await response.json();
            drawBoundingBoxes(data, canvas);
        }
    } catch (error) {
        console.error('Detection result fetch error:', error);
    }
}


function drawBoundingBoxes(data, canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ignore stale detection results.
    const now = Date.now();
    const timestamp = data.timestamp || 0;
    const age = (now - timestamp) / 1000;

    if (age > 30) {
        return;
    }

    const objects = data.objects || [];

    if (objects.length === 0) {
        return;
    }

    objects.forEach(obj => {
        const x1 = obj.x - obj.width / 2;
        const y1 = obj.y - obj.height / 2;
        const x2 = obj.x + obj.width / 2;
        const y2 = obj.y + obj.height / 2;

        let color = 'red';

        if (obj.label === 'cup' || obj.label === 'person') {
            if (obj.confidence >= 0.45) {
                color = 'lime';
            } else if (obj.confidence >= 0.25) {
                color = 'yellow';
            } else {
                color = 'orange';
            }
        }

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        ctx.fillStyle = color;
        ctx.font = '16px Arial';

        const label =
            `${obj.label} (${(obj.confidence * 100).toFixed(1)}%)`;

        ctx.fillText(label, x1, y1 - 5);
    });
}


function sendWSMessage(ws, message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    }
}