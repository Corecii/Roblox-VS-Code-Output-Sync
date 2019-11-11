import * as vscode from 'vscode';
import * as express from 'express';
import * as ansiRegexGetter from 'ansi-regex';
import * as path from 'path';
import * as rojoWatcher from './rojoWatcher';
import * as fileWatcher from './fileWatcher';

const VSC_VERSION = [0, 2, 0];
const RBX_VERSION = [0, 1, 0];

const ansiRegex = ansiRegexGetter();
const robloxPathRegex = /Script '([^\r\n]+)', Line (\d+)/g;
const robloxPathMiniRegex = new RegExp( // All visible services incl. b/c who knows what non-standard workflows some devs have :shrug:
	'((?:Workspace|Players|CoreGui|Lighting|PluginGuiService|ReplicatedFirst|ReplicatedStorage|RobloxPluginGuiService|ServerScriptService|ServerStorage'
	+ '|StarterGui|StarterPack|StarterPlayer|SoundService|Chat|LocalizationService)'
	+ '\\..*?):(\\d+)',
	'g'
);
const errorRegex = new RegExp('\x1b\\[91m([^\x1b]*)\x1b\\[0m', 'sg');
const warnRegex = new RegExp('\x1b\\[93m([^\x1b]*)\x1b\\[0m', 'sg');
const infoRegex = new RegExp('\x1b\\[96m([^\x1b]*)\x1b\\[0m', 'sg');
const lineRegex = /(^|\n)([^\r]+)($|\r)/g;


let rbxPluginUpdateWarningShownThisSession = false;

let server: any;

let app: express.Application;

function isVersionOld(base: number[], check: number[]) {
	if (base[0] > check[0]) {
		return true;
	}
	else if (base[0] < check[0]) {
		return false;
	}
	if (base[1] > check[1]) {
		return true;
	}
	else if (base[1] < check[1]) {
		return false;
	}
	if (base[2] > check[2]) {
		return true;
	}
	else if (base[2] < check[2]) {
		return false;
	}
	return false;
}

function formatVersion(version: number[]) {
	return `${version[0]}.${version[1]}.${version[2]}`;
}

function getSetting(name: string) {
	return vscode.workspace.getConfiguration('robloxOutputSync').get(name);
}

function updateWatchers() {
	if (server === undefined || getSetting('scriptPathMode') === 'Roblox') {
		fileWatcher.disable();
		rojoWatcher.disable();
	} else {
		if (getSetting('watchFiles')) {
			fileWatcher.enable();
		}
		else {
			fileWatcher.disable();
		}
		if ((getSetting('scriptPathResolver') as string).startsWith('Rojo')) {
			rojoWatcher.enable();
		}
		else {
			rojoWatcher.disable();
		}
	}
}

function replaceTerminalColors(text: string) {
	return text
		.replace(errorRegex, (fullMatch: string, inner: string) => {
			return inner.replace(lineRegex, '$1error: $2$3');
		})
		.replace(warnRegex, (fullMatch: string, inner: string) => {
			return inner.replace(lineRegex, '$1warn: $2$3');
		})
		.replace(infoRegex, (fullMatch: string, inner: string) => {
			return inner.replace(lineRegex, '$1info: $2$3');
		});
}

function replaceScriptPaths(text: string) {
	let displayMode = getSetting('scriptPathMode');
	if (displayMode === 'Roblox') {
		return text;
	}
	let resolverMode = getSetting('scriptPathResolver');
	text = text.replace(robloxPathRegex, (fullMatch: string, robloxPathStr: string, lineNumberStr: string) => {
		let filePath = undefined;
		if (resolverMode === 'Rojo' || resolverMode === 'RojoName') {
			filePath = rojoWatcher.getFilePath(robloxPathStr);
		}
		if (filePath === undefined && (resolverMode === 'Name' || resolverMode === 'RojoName')) {
			filePath = fileWatcher.getFilePath(robloxPathStr);
		}
		if (filePath !== undefined) {
			if (getSetting('scriptPathRelative')) {
				filePath = vscode.workspace.asRelativePath(filePath);
			}
			let link = `${filePath}:${lineNumberStr}`;
			if (getSetting('scriptPathAlwaysQuoted') || filePath.includes(' ')) {
				link = `"${link}"`;
			}
			if (displayMode === 'File') {
				return `File ${link}`;
			}
			else {
				return `File ${link} (Script '${robloxPathStr}', Line ${lineNumberStr})`;
			}
		}

		return fullMatch;
	});
	if (getSetting('scriptPathMini')) {
		text = text.replace(robloxPathMiniRegex, (fullMatch: string, robloxPathStr: string, lineNumberStr: string) => {
			let filePath = undefined;
			if (resolverMode === 'Rojo' || resolverMode === 'RojoName') {
				filePath = rojoWatcher.getFilePath(robloxPathStr);
			}
			if (filePath === undefined && (resolverMode === 'Name' || resolverMode === 'RojoName')) {
				filePath = fileWatcher.getFilePath(robloxPathStr);
			}
			if (filePath !== undefined) {
				if (getSetting('scriptPathRelative')) {
					filePath = vscode.workspace.asRelativePath(filePath);
				}
				let link = `${filePath}:${lineNumberStr}`;
				if (getSetting('scriptPathAlwaysQuoted') || filePath.includes(' ')) {
					link = `"${link}"`;
				}
				if (displayMode === 'File') {
					return `${link}`;
				}
				else {
					return `${link}(${robloxPathStr}:${lineNumberStr})`;
				}
			}
	
			return fullMatch;
		});
	}
	return text;
}

export function activate(context: vscode.ExtensionContext) {

	let terminals = new Map<string, any>();
	let channels = new Map<string, any>();

	function makeTerminal(name: string) {
		let data: any;
		if (getSetting('useOutputChannels')) {
			let channel = vscode.window.createOutputChannel(`Roblox: ${name}`);
			data = {
				write: (text: string) => {
					if (getSetting('useColorizerLabels')) {
						text = replaceTerminalColors(text);
					}
					text = text.replace(ansiRegex, '');
					text = replaceScriptPaths(text);
					channel.append(text);
				}
			};
			channel.show(false);
			channels.set(name, data);
		}
		else {
			let open = false;
			let logs: any = [];
			let writeEmitter = new vscode.EventEmitter<string>();
			let pty: vscode.Pseudoterminal = {
				onDidWrite: writeEmitter.event,
				open: (initialDimensions: vscode.TerminalDimensions | undefined) => {
					open = true;
					for (let log of logs) {
						writeEmitter.fire(log);
					}
					logs = undefined;
				},
				close: () => {
					terminals.delete(name);
				},
				handleInput: data => {
					//not supported for now
				}
			};
			let terminal = vscode.window.createTerminal({
				name: `Roblox: ${name}`,
				pty: pty,
			});
			data = {
				write: (text: string) => {
					text = replaceScriptPaths(text);
					if (open) {
						writeEmitter.fire(text);
					}
					else {
						logs.push(text);
					}
				}
			};
			terminal.show(false);
			terminals.set(name, data);
		}
		return data;
	}

	function getOrMakeTerminal(name: string) {
		let dict = getSetting('useOutputChannels') ? channels : terminals;
		if (dict.has(name)) {
			return dict.get(name);
		}
		else {
			return makeTerminal(name);
		}
	}

	app = express();
	app.use('/log', express.json({
		limit: '1mb',
	}));
	app.use('/version', express.json());
	app.use('/log2', express.text({
		limit: '1mb',
	}));
	app.get('/', (req, res) => {
		res.send(`Roblox Output Sync VS Code Extension Version: ${formatVersion(VSC_VERSION)}`);
	});
	app.get('/version', (req, res) => {
		res.json({
			success: true,
			version: RBX_VERSION,
		});
	});
	app.post('/version', (req, res) => {
		if (!req.body) {
			res.status(400);
			res.json({
				success: false,
				reason: 'Missing json',
			});
			return;
		}
		if (!req.body.version) {
			res.status(400);
			res.json({
				success: false,
				reason: 'Missing json.version',
			});
			return;
		}
		if (!Array.isArray(req.body.version)) {
			res.status(400);
			res.json({
				success: false,
				reason: 'json.version should be an array',
			});
			return;
		}
		if (req.body.version.length !== 3) {
			res.status(400);
			res.json({
				success: false,
				reason: 'json.version should be an array with 3 items',
			});
			return;
		}
		if (!rbxPluginUpdateWarningShownThisSession && isVersionOld(RBX_VERSION, req.body.version)) {
			rbxPluginUpdateWarningShownThisSession = true;
			vscode.window.showInformationMessage(`(${formatVersion(req.body.version)} -> ${formatVersion(RBX_VERSION)}) An update is available for the Roblox Output Sync Roblox plugin`);
			if (req.body.requiredVersion && isVersionOld(req.body.requiredVersion, VSC_VERSION)) {
				vscode.window.showErrorMessage(`The Roblox plugin is requiring at least version ${req.body.requiredVersion}. Your Roblox Output Sync VS Code extension is out of date! `);
			}
		}
		res.json({
			success: true,
			version: RBX_VERSION,
		});
	});
	app.post('/log2/:context', async (req, res) => {
		let terminal = getOrMakeTerminal(req.params.context);
		terminal.write(req.body);
		res.status(200);
		res.json({success: true});
	});
	app.post('/log', async (req, res) => {
		if (!req.body) {
			res.status(400);
			res.json({
				success: false,
				reason: 'Missing JSON',
			});
			return;
		}
		if (!req.body.Logs) {
			res.status(400);
			res.json({
				success: false,
				reason: 'Missing body.Logs',
			});
			return;
		}
		if (!req.body.Context) {
			res.status(400);
			res.json({
				success: false,
				reason: 'Missing body.Context',
			});
			return;
		}
		if (!rbxPluginUpdateWarningShownThisSession) {
			rbxPluginUpdateWarningShownThisSession = true;
			vscode.window.showInformationMessage(`(0.0.3 -> ${formatVersion(RBX_VERSION)}) An update is available for the Roblox Output Sync Roblox plugin`);
		}
		let terminal = getOrMakeTerminal(req.body.Context);
		for (let log of req.body.Logs) {
			terminal.write(`${log}\r\n`);
		}
		res.sendStatus(200); // Oops! This is suppose to be `res.status(200);`. Leaving it for api1 consistency between versions.
		res.json({success: true});
	});

	function startServer() {
		if (server) {
			vscode.window.showInformationMessage('Roblox Output Server is already running');
			return;
		}

		try {
			let port = Math.floor(getSetting('startServerPort') as number);
			server = app.listen(port, () => {
				vscode.window.showInformationMessage(`Started Roblox Output Server on port ${port}`);
			});
			updateWatchers();
		}
		catch (e) {
			vscode.window.showErrorMessage(`Failed to launch Roblox Output Server: ${e}`);
		}
	}

	function stopServer() {
		if (server) {
			server.close();
			server = undefined;
			updateWatchers();
			vscode.window.showInformationMessage('Stopped Roblox Output Server');
		}
		else {
			vscode.window.showInformationMessage('Roblox Output Server was not running');
		}
	}

	let disposable1 = vscode.commands.registerCommand('extension.start', () => startServer());

	let disposable2 = vscode.commands.registerCommand('extension.stop', () => stopServer());

	let disposable3 = vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('robloxOutputSync')) {
			updateWatchers();
		}
		if (getSetting('startAutomatically') && !server) {
			startServer();
		}
	});

	context.subscriptions.push(disposable1);
	context.subscriptions.push(disposable2);
	context.subscriptions.push(disposable3);

	if (getSetting('startAutomatically')) {
		startServer();
	}
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (server) {
		server.close();
		server = undefined;
		updateWatchers();
	}
}
