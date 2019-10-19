# Roblox Output Sync

## Features

This extension will log output from Roblox in VS Code for easier access.

## Requirements

You must install [this plugin](https://www.roblox.com/catalog/04158442719/redirect) ([Github](https://github.com/Corecii/Roblox-VS-Code-Output-Sync)) in Roblox Studio to use this extension. Once installed, click the "Toggle" button at the beginning of each session to start logging the output to VS Code.

## How-to

1. Install the plugin above
2. Run the "Start Server" command under "Roblox Output". You can access commands with `Ctrl + Shift + P`.
3. In Roblox Studio, press the "Toggle" button under "VSCode Output" in the Plugins bar.
4. Roblox output should now show up in VS Code! Be sure to toggle the plugin off on the Roblox-side when you close VS Code as it won't turn itself off.

## Known Issues

* This extension will only work with one VS Code window at a time.
* There is no way to differentiate between Edit, Server, and Client output. Roblox does not provide any API to differentiate these in Studio.
* The Roblox-side plugin does not quit if the VS Code-side server goes down. It will warn you about logging failures until you toggle it off manually.

## Release Notes

## 0.0.1

Initial release