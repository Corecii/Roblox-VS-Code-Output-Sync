# Roblox Output Sync

This extension can be found [on Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=corecii.roblox-output-sync) and [on Github](https://github.com/Corecii/Roblox-VS-Code-Output-Sync).

## Features

This extension will log output from Roblox in VS Code for easier access.

This extension optionally converts Roblox paths to file paths so that you can click-to-go-to-source on errors.

## Requirements

You must install [this plugin](https://www.roblox.com/catalog/04158442719/redirect) ([Github](https://github.com/Corecii/Roblox-VS-Code-Output-Sync/releases)) in Roblox Studio to use this extension. Once installed, click the "Toggle" button at the beginning of each session to start logging the output to VS Code.

## How-to

1. Install the Roblox plugin
2. In VS Code, run the "Roblox Output: Start Server" command. You can access commands with `Ctrl + Shift + P`.
3. In Roblox Studio, press the "Toggle" button in "VSCode Output".
4. Roblox output should now show up in VS Code! Be sure to toggle the plugin off on the Roblox-side when you close VS Code as it won't turn itself off.

## Known Issues

* This extension will only work with one VS Code window at a time.
* There is no way to differentiate between Edit, Server, and Client output. Roblox does not provide any API to differentiate these.
* The Roblox-side plugin does not quit if the VS Code-side server goes down. It will warn you about logging failures until you toggle it off manually.

## Release Notes

## 0.2.0

Output is now shown using OutputChannels (optional).

The plugin now converts Roblox script paths to file paths. When set to use OutputChannels, you can click on the path to go to the file.

Many settings added in relation with the new output conversion feature.

## 0.1.0

Output is now uploaded as chunks of characters instead of individual lines.
Output that would be too large to upload in one request is now split into multiple requests.

If the Roblox plugin or VS Code extension detects that its counterpart is outdated, then it will inform you that there is an update.

Added icons.

## 0.0.3

Update roblox plugin to fix issues with stand-alone \r and \n characters.

## 0.0.2

Updated readme

## 0.0.1

Initial release