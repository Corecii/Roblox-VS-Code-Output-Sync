import * as vscode from 'vscode';

import * as express from 'express';

import * as delay from 'delay';

let server: any;

let app: express.Application;

export function activate(context: vscode.ExtensionContext) {

	let userText = '';

	let terminals = new Map<string, any>();

	function makeTerminal(name: string) {
		let writeEmitter = new vscode.EventEmitter<string>();
		let pty: vscode.Pseudoterminal = {
			onDidWrite: writeEmitter.event,
			open: (initialDimensions: vscode.TerminalDimensions | undefined) => {
				
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
			writeEmitter: writeEmitter,
			pty: pty,
			terminal: terminal,
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
	app.use(express.json());
	app.get('/', (req, res) => {
		res.send('Running!');
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
		let willWait = !terminals.has(req.body.Context);
		let terminal = getOrMakeTerminal(req.body.Context);
		if (willWait) {
			await delay(500);
		}
		if (req.body.Clear) {
			terminal.writeEmitter.fire('\x1b[2J');
		}
		for (let log of req.body.Logs) {
			terminal.writeEmitter.fire(`${log}\r\n`);
		}
		res.sendStatus(200);
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
