import * as vscode from 'vscode';

import * as express from 'express';

import * as delay from 'delay';

const VSC_VERSION = [0, 1, 0];
const RBX_VERSION = [0, 1, 0];

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

export function activate(context: vscode.ExtensionContext) {

	let userText = '';

	let terminals = new Map<string, any>();

	function makeTerminal(name: string) {
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
		let data = {
			write: (text: string) => {
				if (open) {
					writeEmitter.fire(text);
				}
				else {
					logs.push(text);
				}
			}
		};
		terminals.set(name, data);
		terminal.show(false);
		return data;
	}

	function getOrMakeTerminal(name: string) {
		if (terminals.has(name)) {
			return terminals.get(name);
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

	let disposable1 = vscode.commands.registerCommand('extension.start', () => {
		if (server) {
			vscode.window.showInformationMessage('Roblox Output Server is already running');
			return;
		}

		try {
			server = app.listen(32337, () => {
				vscode.window.showInformationMessage(`Started Roblox Output Server on port 32337`);
			});
		}
		catch (e) {
			vscode.window.showErrorMessage(`Failed to launch Roblox Output Server: ${e}`);
		}
	});

	let disposable2 = vscode.commands.registerCommand('extension.stop', () => {
		if (server) {
			server.close();
			server = undefined;
			vscode.window.showInformationMessage('Stopped Roblox Output Server');
		}
		else {
			vscode.window.showInformationMessage('Roblox Output Server was not running');
		}
	});

	context.subscriptions.push(disposable1);
	context.subscriptions.push(disposable2);
}

// this method is called when your extension is deactivated
export function deactivate() {
	if (server) {
		server.close();
		server = undefined;
	}
}
