package com.koalastore;

import com.google.gson.Gson;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;

/**
 * Tiny HTTP client for the KoalaStore backend.
 * All requests are authenticated with the per-server secret.
 */
public final class ApiClient {

    private final Gson gson = new Gson();
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    private volatile String baseUrl;
    private volatile String secret;

    public ApiClient(String baseUrl, String secret) {
        update(baseUrl, secret);
    }

    public void update(String baseUrl, String secret) {
        String url = baseUrl == null ? "" : baseUrl.trim();
        while (url.endsWith("/")) {
            url = url.substring(0, url.length() - 1);
        }
        this.baseUrl = url;
        this.secret = secret == null ? "" : secret.trim();
    }

    private HttpRequest.Builder request(String path) {
        return HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "application/json")
                .header("User-Agent", "KoalaStore-Plugin/1.0")
                .header("X-KoalaStore-Secret", secret);
    }

    private <T> T send(HttpRequest req, Class<T> type) throws IOException {
        try {
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            int code = res.statusCode();
            if (code == 401 || code == 403) {
                throw new IOException("Backend rejected the secret (HTTP " + code + "). "
                        + "Check 'api.secret' / run /koalastore secret <key>.");
            }
            if (code < 200 || code >= 300) {
                throw new IOException("Backend returned HTTP " + code + ": " + truncate(res.body()));
            }
            if (type == Void.class || res.body() == null || res.body().isEmpty()) {
                return null;
            }
            return gson.fromJson(res.body(), type);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Request interrupted", e);
        }
    }

    private static String truncate(String s) {
        if (s == null) {
            return "";
        }
        return s.length() > 200 ? s.substring(0, 200) + "..." : s;
    }

    public ApiModels.Information getInformation() throws IOException {
        return send(request("/api/information").GET().build(), ApiModels.Information.class);
    }

    public ApiModels.QueueResponse getQueue() throws IOException {
        return send(request("/api/queue").GET().build(), ApiModels.QueueResponse.class);
    }

    public ApiModels.CommandList getOfflineCommands() throws IOException {
        return send(request("/api/queue/offline-commands").GET().build(), ApiModels.CommandList.class);
    }

    public ApiModels.CommandList getPlayerQueue(long playerId) throws IOException {
        return send(request("/api/player/" + playerId + "/queue").GET().build(), ApiModels.CommandList.class);
    }

    public void deleteCommands(List<Long> ids) throws IOException {
        if (ids == null || ids.isEmpty()) {
            return;
        }
        String body = gson.toJson(new ApiModels.DeleteRequest(ids));
        HttpRequest req = request("/api/queue")
                .header("Content-Type", "application/json")
                .method("DELETE", HttpRequest.BodyPublishers.ofString(body))
                .build();
        send(req, Void.class);
    }
}
