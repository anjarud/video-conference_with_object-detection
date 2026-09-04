package org.conference.webrtc.controller;

import org.conference.webrtc.service.FrameProcessingService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@RestController
@RequestMapping("/signaling")
public class SignalingController {

    // Stores the latest YOLO result separately for each client.
    private final Map<String, String> yoloDataMap = new ConcurrentHashMap<>();

    // Separate frame counters allow each client to be throttled independently.
    private final Map<String, AtomicInteger> frameCounters = new ConcurrentHashMap<>();

    @Autowired
    private FrameProcessingService frameProcessingService;

    @PostMapping("/upload-frame")
    public ResponseEntity<String> uploadFrame(
            @RequestParam("image") MultipartFile image,
            @RequestParam(defaultValue = "unknown") String clientId) {

        try {
            int frameCount = frameCounters
                    .computeIfAbsent(clientId, k -> new AtomicInteger())
                    .incrementAndGet();

            // Process only every third frame to reduce load.
            if (frameCount % 3 == 0) {
                // Run YOLO processing asynchronously so frame uploads do not block the request.
                CompletableFuture.runAsync(() -> {
                    String json;
                    try {
                        json = frameProcessingService.sendToFrameProcessorJSON(image.getBytes());
                    } catch (IOException e) {
                        throw new RuntimeException(e);
                    }

                    // Add a timestamp so the frontend can discard outdated detections.
                    long timestamp = System.currentTimeMillis();
                    String jsonWithTimestamp = json.replace(
                            "{\"objects\":",
                            "{\"timestamp\":" + timestamp + ",\"objects\":"
                    );

                    yoloDataMap.put(clientId, jsonWithTimestamp);
                });
            }

            return ResponseEntity.ok("OK");

        } catch (Exception e) {
            return ResponseEntity.status(500).body("Error");
        }
    }

    @GetMapping("/yolo-boxes")
    public ResponseEntity<String> getYOLOBoxes(
            @RequestParam(defaultValue = "unknown") String clientId) {

        // Always return valid JSON, even when no detection result exists yet.
        return ResponseEntity.ok(
                yoloDataMap.getOrDefault(clientId, "{\"objects\":[]}")
        );
    }
}