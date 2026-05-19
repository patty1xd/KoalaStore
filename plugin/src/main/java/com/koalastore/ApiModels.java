package com.koalastore;

import com.google.gson.annotations.SerializedName;

import java.util.List;

/**
 * JSON shapes exchanged with the KoalaStore backend.
 * Mirrors the Tebex-style command-queue protocol.
 */
public final class ApiModels {

    private ApiModels() {
    }

    public static final class Information {
        public Store store;
        public Server server;
    }

    public static final class Store {
        public String name;
    }

    public static final class Server {
        public String name;
    }

    public static final class QueueResponse {
        public Meta meta;
        public List<PlayerRef> players;
    }

    public static final class Meta {
        @SerializedName("next_check")
        public int nextCheck = 60;
        public boolean more;
        @SerializedName("execute_offline")
        public boolean executeOffline;
    }

    public static final class PlayerRef {
        public long id;
        public String name;
        public String uuid;
    }

    public static final class CommandList {
        public PlayerRef player;
        public List<QueuedCommand> commands;
    }

    public static final class QueuedCommand {
        public long id;
        public String command;
        public Conditions conditions;
        /** Present on offline-command entries so we know who bought it. */
        public PlayerRef player;
    }

    public static final class Conditions {
        public int delay;
        public int slots;
    }

    public static final class DeleteRequest {
        public List<Long> ids;

        public DeleteRequest(List<Long> ids) {
            this.ids = ids;
        }
    }
}
