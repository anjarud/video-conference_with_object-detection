package org.conference.webrtc.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.*;
import org.springframework.web.client.RestTemplate;

@Service
public class FrameProcessingService {

    @Value("${frame.processor.url}")
    private String frameProcessorUrl;

    public String sendToFrameProcessorJSON(byte[] frameData) {
        try {
            RestTemplate restTemplate = new RestTemplate();

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.MULTIPART_FORM_DATA);

            MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();

            // Wrap the JPEG bytes as a multipart file for the Python service.
            body.add("image", new org.springframework.core.io.ByteArrayResource(frameData) {
                @Override
                public String getFilename() {
                    return "frame.jpg";
                }
            });

            HttpEntity<MultiValueMap<String, Object>> request =
                    new HttpEntity<>(body, headers);

            ResponseEntity<String> response = restTemplate.postForEntity(
                    frameProcessorUrl + "/detect-json",
                    request,
                    String.class
            );

            return response.getBody();

        } catch (Exception e) {
            System.err.println("Frame Processor error: " + e.getMessage());

            // Return valid JSON so the frontend can safely handle service failures.
            return "{\"objects\":[]}";
        }
    }
}