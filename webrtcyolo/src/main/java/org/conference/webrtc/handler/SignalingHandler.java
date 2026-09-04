package org.conference.webrtc.handler;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;

@Component
public class SignalingHandler extends TextWebSocketHandler {

    private final Gson gson = new Gson();

    // The prototype keeps one WebSocket session for each of the two peers.
    private WebSocketSession peer1Session;
    private WebSocketSession peer2Session;

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonObject jsonMessage = gson.fromJson(message.getPayload(), JsonObject.class);
        String type = jsonMessage.get("type").getAsString();

        switch (type) {
            case "register-peer1":
                registerPeer(session, "peer1", true);
                break;
            case "register-peer2":
                registerPeer(session, "peer2", false);
                break;
            case "offer":
            case "answer":
            case "ice-candidate":
                // Relay signaling messages to the other peer.
                relayToOther(session, jsonMessage);
                break;
        }
    }

    private void registerPeer(WebSocketSession session, String role, boolean isPeer1) throws IOException {

        if (isPeer1) {
            peer1Session = session;
        } else {
            peer2Session = session;
        }

        sendJson(session, "registered", "role", role);

        // Peer1 always initiates the WebRTC offer once both peers are connected.
        if (!isPeer1 && peer1Session != null && peer1Session.isOpen()) {
            sendJson(peer1Session, "peer2-ready");
        } else if (isPeer1 && peer2Session != null && peer2Session.isOpen()) {
            sendJson(session, "peer2-ready");
        }
    }

    private void relayToOther(WebSocketSession from, JsonObject message) throws IOException {
        WebSocketSession target = (from == peer1Session) ? peer2Session : peer1Session;

        if (target != null && target.isOpen()) {
            target.sendMessage(new TextMessage(gson.toJson(message)));
        }
    }

    private void sendJson(WebSocketSession session, String type, String... keyValues) throws IOException {
        JsonObject json = new JsonObject();
        json.addProperty("type", type);

        for (int i = 0; i < keyValues.length; i += 2) {
            json.addProperty(keyValues[i], keyValues[i + 1]);
        }

        session.sendMessage(new TextMessage(gson.toJson(json)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {

        if (session == peer1Session) {
            peer1Session = null;
        }

        if (session == peer2Session) {
            peer2Session = null;
        }
    }
}