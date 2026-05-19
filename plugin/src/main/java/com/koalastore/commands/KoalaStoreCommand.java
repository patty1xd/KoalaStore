package com.koalastore.commands;

import com.koalastore.ApiModels;
import com.koalastore.KoalaStorePlugin;
import org.bukkit.Bukkit;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

public final class KoalaStoreCommand implements CommandExecutor {

    private static final String P = ChatColor.AQUA + "[KoalaStore] " + ChatColor.RESET;

    private final KoalaStorePlugin plugin;

    public KoalaStoreCommand(KoalaStorePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0) {
            help(sender);
            return true;
        }
        switch (args[0].toLowerCase()) {
            case "forcecheck" -> {
                sender.sendMessage(P + ChatColor.GRAY + "Checking the store for pending purchases...");
                plugin.forceCheck();
            }
            case "secret" -> {
                if (args.length < 2) {
                    sender.sendMessage(P + ChatColor.RED + "Usage: /koalastore secret <key>");
                    return true;
                }
                plugin.setSecret(args[1]);
                sender.sendMessage(P + ChatColor.GREEN + "Secret saved. Verifying...");
                verify(sender);
            }
            case "url" -> {
                if (args.length < 2) {
                    sender.sendMessage(P + ChatColor.RED + "Usage: /koalastore url <https://store.example.com>");
                    return true;
                }
                plugin.setUrl(args[1]);
                sender.sendMessage(P + ChatColor.GREEN + "Backend URL set to " + ChatColor.WHITE + args[1]);
                verify(sender);
            }
            case "reload" -> {
                plugin.reloadFromDisk();
                sender.sendMessage(P + ChatColor.GREEN + "Config reloaded.");
            }
            case "info" -> {
                sender.sendMessage(P + ChatColor.GRAY + "Store URL: " + ChatColor.WHITE + plugin.getStoreUrl());
                verify(sender);
            }
            default -> help(sender);
        }
        return true;
    }

    private void verify(CommandSender sender) {
        Bukkit.getScheduler().runTaskAsynchronously(plugin, () -> {
            try {
                ApiModels.Information info = plugin.api().getInformation();
                String store = info != null && info.store != null ? info.store.name : "?";
                sender.sendMessage(P + ChatColor.GREEN + "Connected to store: " + ChatColor.WHITE + store);
            } catch (Exception e) {
                sender.sendMessage(P + ChatColor.RED + "Connection failed: " + e.getMessage());
            }
        });
    }

    private void help(CommandSender sender) {
        sender.sendMessage(P + ChatColor.WHITE + "Commands:");
        sender.sendMessage(ChatColor.GRAY + " /koalastore forcecheck " + ChatColor.DARK_GRAY + "- poll the store now");
        sender.sendMessage(ChatColor.GRAY + " /koalastore secret <key> " + ChatColor.DARK_GRAY + "- set server secret");
        sender.sendMessage(ChatColor.GRAY + " /koalastore url <url> " + ChatColor.DARK_GRAY + "- set backend URL");
        sender.sendMessage(ChatColor.GRAY + " /koalastore info " + ChatColor.DARK_GRAY + "- show status");
        sender.sendMessage(ChatColor.GRAY + " /koalastore reload " + ChatColor.DARK_GRAY + "- reload config.yml");
    }
}
