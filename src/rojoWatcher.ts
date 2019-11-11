import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';

import * as fileWatcher from './fileWatcher';
import { TextDecoder } from 'util';

let enabled = false;
let disposables: vscode.Disposable[] = [];
let initialFinderCancellationToken: vscode.CancellationTokenSource | undefined = undefined;

let rojoPaths: Map<string, Map<string, string>> = new Map<string, Map<string, string>>();

export function getFilePath(robloxPathStr: string): string | undefined {
	for (let map of rojoPaths.values()) {
		for (let robloxPath of map.keys()) {
			if (robloxPathStr.startsWith(robloxPath)) {
				let filePathStart = map.get(robloxPath) as string;
				let robloxPathEnd = robloxPathStr.substring(robloxPath.length + 1);
				let robloxPathEndSplit = robloxPathEnd.split('.');
				let filePathEnd = robloxPathEndSplit.join('/');
				let filePath = filePathStart + '/' + filePathEnd;
				filePath = path.resolve(filePath);
				let fileName = robloxPathEndSplit[robloxPathEndSplit.length - 1];
				let correctedPath = fileWatcher.getCorrectedPath(filePath, fileName);
				if (correctedPath) {
					return path.resolve(correctedPath);
				}
				else {
					return undefined;
				}
			}
		}
	}
}

export function enable() {
	if (enabled) {
		return;
	}
	enabled = true;
	let watcher = vscode.workspace.createFileSystemWatcher('**/*.project.json', false, false, false);
	async function update(uri: vscode.Uri) {
		let project: any = undefined;
		try {
			let projectStr = await vscode.workspace.fs.readFile(uri);
			project = JSON.parse(new TextDecoder("utf-8").decode(projectStr));
		}
		catch (err) {
			console.log(`Failed to read rojo project ${uri} because ${err}`);
			return;
		}
		if (!project) {
			return;
		}

		let paths = new Map<string, string>();
		let robloxPath: string[] = [];
		function process(name: string, location: any) {
			if (location !== project.tree) {
				robloxPath.push(name);
			}
			if (location.$path) {
				let pathArray = robloxPath.slice();
				let robloxPathStr = pathArray.join('.');
				let fullPath = path.dirname(uri.fsPath) + '/' + location.$path;
				fullPath = path.resolve(fullPath);
				paths.set(robloxPathStr, fullPath);
			}
			for (let key in location) {
				if ((key as string).startsWith('$') || typeof(location[key]) !== 'object') {
					continue;
				}
				process(key, location[key]);
			}
			if (location !== project.tree) {
				robloxPath.pop();
			}
		}
		process('game', project.tree);
		rojoPaths.set(uri.toString(), paths);
	}
	async function uriCreated(uri: vscode.Uri) {
		rojoPaths.set(uri.toString(), new Map<string, string>());
		await update(uri);
	}
	watcher.onDidCreate(uri => uriCreated(uri));
	watcher.onDidChange(uri => {
		update(uri);
	});
	watcher.onDidDelete(uri => {
		rojoPaths.delete(uri.toString());
	});
	disposables.push(watcher);
	initialFinderCancellationToken = new vscode.CancellationTokenSource();
	let myToken = initialFinderCancellationToken.token;
	vscode.workspace.findFiles('**/*.project.json', undefined, undefined, myToken).then(files => {
		if (myToken.isCancellationRequested) {
			return;
		}
		initialFinderCancellationToken = undefined;
		for (let file of files) {
			uriCreated(file);
		}
	}, error => {
		console.error(error);
	});
}

export function disable() {
	if (!enabled) {
		return;
	}
	enabled = false;
	disposables.forEach(d => d.dispose());
	disposables = [];
	rojoPaths = new Map<string, Map<string, string>>();
	if (initialFinderCancellationToken !== undefined) {
		initialFinderCancellationToken.cancel();
		initialFinderCancellationToken = undefined;
	}
}