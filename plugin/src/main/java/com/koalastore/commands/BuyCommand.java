package com.koalastore.commands;

import com.koalastore.KoalaStorePlugin;
import org.bukkit.ChatColor;
import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;

import java.util.List;

public final class BuyCommand implements CommandExecutor {

    private final KoalaStorePlugin plugin;

    public BuyCommand(KoalaStorePlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        String url = plugin.getStoreUrl();
        List<String> lines = plugin.getBuyMessage();
        if (lines == null || lines.isEmpty()) {
            sender.sendMessage(ChatColor.AQUA + "Visit our store: " + ChatColor.WHITE + url);
            return true;
        }
        for (String line : lines) {
            sender.sendMessage(ChatColor.translateAlternateColorCodes('&', line.replace("{url}", url)));
        }
        return true;
    }
}
