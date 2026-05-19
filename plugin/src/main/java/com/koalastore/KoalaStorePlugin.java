package com.koalastore;

import com.koalastore.commands.BuyCommand;
import com.koalastore.commands.KoalaStoreCommand;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.util.List;

public final class KoalaStorePlugin extends JavaPlugin {

    private ApiClient api;
    private QueueRunner runner;
    private BukkitTask pollTask;

    private int intervalSeconds = 60;
    private boolean debug;
    private String storeUrl = "";
    private List<String> buyMessage = List.of();

    @Override
    public void onEnable() {
        saveDefaultConfig();
        loadConfigValues();
        this.api = new ApiClient(getConfig().getString("api.url", ""), getConfig().getString("api.secret", ""));
        this.runner = new QueueRunner(this, api);

        getCommand("koalastore").setExecutor(new KoalaStoreCommand(this));
        getCommand("buy").setExecutor(new BuyCommand(this));

        validateSecretAsync();
        schedulePoll();
        getLogger().info("KoalaStore enabled. Polling " + getConfig().getString("api.url")
                + " every " + intervalSeconds + "s.");
    }

    @Override
    public void onDisable() {
        if (pollTask != null) {
            pollTask.cancel();
        }
        Bukkit.getScheduler().cancelTasks(this);
    }

    private void loadConfigValues() {
        this.intervalSeconds = Math.max(15, getConfig().getInt("check-interval-seconds", 60));
        this.debug = getConfig().getBoolean("debug", false);
        this.storeUrl = getConfig().getString("store-url", getConfig().getString("api.url", ""));
        this.buyMessage = getConfig().getStringList("buy.message");
    }

    private void schedulePoll() {
        if (pollTask != null) {
            pollTask.cancel();
        }
        long period = intervalSeconds * 20L;
        // First check after 5s so the server finishes booting other plugins.
        pollTask = Bukkit.getScheduler().runTaskTimerAsynchronously(this, runner, 100L, period);
    }

    /** Adaptive interval: backend can ask us to slow down / speed up. */
    public void applyNextCheck(int seconds) {
        int wanted = Math.max(15, seconds);
        if (wanted != intervalSeconds) {
            this.intervalSeconds = wanted;
            Bukkit.getScheduler().runTask(this, this::schedulePoll);
        }
    }

    public void forceCheck() {
        Bukkit.getScheduler().runTaskAsynchronously(this, runner);
    }

    private void validateSecretAsync() {
        Bukkit.getScheduler().runTaskAsynchronously(this, () -> {
            try {
                ApiModels.Information info = api.getInformation();
                String store = info != null && info.store != null ? info.store.name : "?";
                getLogger().info("KoalaStore linked to store: " + store);
            } catch (Exception e) {
                getLogger().warning("KoalaStore could not reach the backend: " + e.getMessage());
                getLogger().warning("Set it with: /koalastore url <url>  and  /koalastore secret <key>");
            }
        });
    }

    public void reloadFromDisk() {
        reloadConfig();
        loadConfigValues();
        api.update(getConfig().getString("api.url", ""), getConfig().getString("api.secret", ""));
        Bukkit.getScheduler().runTask(this, this::schedulePoll);
    }

    public void setSecret(String secret) {
        getConfig().set("api.secret", secret);
        saveConfig();
        api.update(getConfig().getString("api.url", ""), secret);
    }

    public void setUrl(String url) {
        getConfig().set("api.url", url);
        if (getConfig().getString("store-url", "").isBlank()
                || getConfig().getString("store-url", "").equals(storeUrl)) {
            getConfig().set("store-url", url);
        }
        saveConfig();
        loadConfigValues();
        api.update(url, getConfig().getString("api.secret", ""));
    }

    public ApiClient api() {
        return api;
    }

    public boolean isDebug() {
        return debug;
    }

    public String getStoreUrl() {
        return storeUrl;
    }

    public List<String> getBuyMessage() {
        return buyMessage;
    }
}
