package com.koalastore;

import org.bukkit.Bukkit;
import org.bukkit.entity.Player;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * One poll cycle of the Tebex-style command queue.
 *
 * Threading: HTTP runs async (this Runnable is scheduled async). The actual
 * command dispatch + online/slot checks hop to the main thread, then the
 * "mark as executed" DELETE hops back to async.
 */
public final class QueueRunner implements Runnable {

    private final KoalaStorePlugin plugin;
    private final ApiClient api;
    private final AtomicBoolean busy = new AtomicBoolean(false);

    public QueueRunner(KoalaStorePlugin plugin, ApiClient api) {
        this.plugin = plugin;
        this.api = api;
    }

    @Override
    public void run() {
        if (!busy.compareAndSet(false, true)) {
            return; // previous cycle still in flight
        }
        try {
            fetchAndDispatch();
        } catch (Exception e) {
            busy.set(false);
            plugin.getLogger().warning("[KoalaStore] Queue check failed: " + e.getMessage());
        }
    }

    private void fetchAndDispatch() throws Exception {
        ApiModels.QueueResponse queue = api.getQueue();
        if (queue == null) {
            busy.set(false);
            return;
        }
        final ApiModels.Meta meta = queue.meta != null ? queue.meta : new ApiModels.Meta();

        final List<ApiModels.QueuedCommand> offline = new ArrayList<>();
        if (meta.executeOffline) {
            ApiModels.CommandList o = api.getOfflineCommands();
            if (o != null && o.commands != null) {
                offline.addAll(o.commands);
            }
        }

        // Pre-fetch each due player's online queue (HTTP must stay off main thread).
        final Map<ApiModels.PlayerRef, List<ApiModels.QueuedCommand>> playerCmds = new LinkedHashMap<>();
        if (queue.players != null) {
            for (ApiModels.PlayerRef p : queue.players) {
                ApiModels.CommandList list = api.getPlayerQueue(p.id);
                if (list != null && list.commands != null && !list.commands.isEmpty()) {
                    playerCmds.put(p, list.commands);
                }
            }
        }

        Bukkit.getScheduler().runTask(plugin, () -> {
            List<Long> done = new ArrayList<>();

            for (ApiModels.QueuedCommand c : offline) {
                String name = c.player != null ? c.player.name : null;
                String uuid = c.player != null ? c.player.uuid : null;
                dispatch(c, name, uuid);
                done.add(c.id);
            }
            if (!offline.isEmpty() && plugin.isDebug()) {
                plugin.getLogger().info("[KoalaStore] Ran " + offline.size() + " offline command(s).");
            }

            for (Map.Entry<ApiModels.PlayerRef, List<ApiModels.QueuedCommand>> e : playerCmds.entrySet()) {
                ApiModels.PlayerRef p = e.getKey();
                Player online = p.name != null ? Bukkit.getPlayerExact(p.name) : null;
                if (online == null) {
                    continue; // not connected yet -> leave queued, retry next cycle
                }
                int ran = 0;
                for (ApiModels.QueuedCommand c : e.getValue()) {
                    int slots = c.conditions != null ? c.conditions.slots : 0;
                    if (slots > 0 && freeSlots(online) < slots) {
                        continue; // inventory too full -> retry later, do not delete
                    }
                    dispatch(c, p.name, p.uuid);
                    done.add(c.id);
                    ran++;
                }
                if (ran > 0 && plugin.isDebug()) {
                    plugin.getLogger().info("[KoalaStore] Ran " + ran + " command(s) for " + p.name);
                }
            }

            Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
                try {
                    api.deleteCommands(done);
                    plugin.applyNextCheck(meta.nextCheck);
                } catch (Exception ex) {
                    plugin.getLogger().warning("[KoalaStore] Failed to ack commands: " + ex.getMessage());
                } finally {
                    busy.set(false);
                    if (meta.more) {
                        Bukkit.getScheduler().runTaskLaterAsynchronously(plugin, this, 60L);
                    }
                }
            });
        });
    }

    private int freeSlots(Player p) {
        int free = 0;
        var inv = p.getInventory();
        for (int i = 0; i < 36; i++) {
            if (inv.getItem(i) == null) {
                free++;
            }
        }
        return free;
    }

    private void dispatch(ApiModels.QueuedCommand c, String name, String uuid) {
        if (c.command == null || c.command.isBlank()) {
            return;
        }
        String safeName = name == null ? "" : name;
        String safeUuid = (uuid == null || uuid.isBlank()) ? safeName : uuid;
        String cmd = c.command
                .replace("{name}", safeName)
                .replace("{username}", safeName)
                .replace("{uuid}", safeUuid)
                .trim();
        if (cmd.startsWith("/")) {
            cmd = cmd.substring(1);
        }
        final String finalCmd = cmd;
        int delay = c.conditions != null ? Math.max(0, c.conditions.delay) : 0;
        Runnable exec = () -> {
            if (plugin.isDebug()) {
                plugin.getLogger().info("[KoalaStore] > " + finalCmd);
            }
            Bukkit.dispatchCommand(Bukkit.getConsoleSender(), finalCmd);
        };
        if (delay > 0) {
            Bukkit.getScheduler().runTaskLater(plugin, exec, delay * 20L);
        } else {
            exec.run(); // already on the main thread here
        }
    }
}
