import * as vscode from 'vscode';
import * as path from 'path';

const robloxScriptSuffixesRegex = /(?:\.server|\.client)?\.lua$/i;

let enabled = false;
let disposables: vscode.Disposable[] = [];
let initialFinderCancellationToken: vscode.CancellationTokenSource | undefined = undefined;

let scriptNamePaths: Map<string, string[]> = new Map<string, string[]>();

function getScriptNameFromPath(pathStr: string): string | undefined {
	let pathObj = path.parse(pathStr);
	if (pathObj.ext.toLowerCase() !== '.lua') {
		return undefined;
	}
	let scriptName = pathObj.base.replace(robloxScriptSuffixesRegex, '');
	if (scriptName === 'init') {
		scriptName = path.basename(pathObj.dir);
		if (scriptName === null || scriptName === undefined || scriptName.length < 1) {
			return undefined;
		}
	}
	return scriptName;
}

export function getFilePath(robloxPathStr: string) {
	let robloxPathSplit = robloxPathStr.split('.');
	let fileName = robloxPathSplit.pop() as string;
	let nameBasedPaths = scriptNamePaths.get(fileName);
	if (nameBasedPaths !== undefined) {
		let closestMatch = nameBasedPaths[0];
		let closestMatchScore = 0;
		for (let pathStr of nameBasedPaths) {
			let upperFilePath = path.dirname(pathStr);
			if (path.basename(pathStr).startsWith('init.')) {
				upperFilePath = path.dirname(upperFilePath);
			}
			let count = 0;
			while (count < robloxPathSplit.length && path.basename(upperFilePath) === robloxPathSplit[robloxPathSplit.length - 1 - count]) {
				count++;
				upperFilePath = path.dirname(upperFilePath);
			}
			if (count > closestMatchScore) {
				closestMatchScore = count;
				closestMatch = pathStr;
			}
		}
		return closestMatch;
	}
	return undefined;
}

export function getCorrectedPath(filePath: string, fileName: string): string | undefined {
	if (!enabled) {
		return filePath + '.lua';
	}
	let nameBasedPaths = scriptNamePaths.get(fileName);
	if (nameBasedPaths !== undefined) {
		for (let pathStr of nameBasedPaths) {
			if (path.basename(pathStr).startsWith('init.') && path.resolve(path.dirname(pathStr)) === filePath) {
				return pathStr;
			} else if (pathStr.replace(robloxScriptSuffixesRegex, '') === filePath) {
				return pathStr;
			} else if (pathStr === filePath + '.lua') {
				return pathStr;
			}
		}
	}
	return undefined;
}

export function enable() {
	if (enabled) {
		return;
	}
	enabled = true;
	let watcher = vscode.workspace.createFileSystemWatcher('**/*.lua', false, true, false);
	function uriCreated(uri: vscode.Uri) {
		let scriptName = getScriptNameFromPath(uri.fsPath);
		if (scriptName === undefined) {
			return;
		}
		let arr = scriptNamePaths.get(scriptName);
		if (arr === undefined) {
			arr = [];
			scriptNamePaths.set(scriptName, arr);
		}
		arr.push(path.resolve(uri.fsPath));
	}
	watcher.onDidCreate(uri => uriCreated(uri));
	watcher.onDidDelete(uri => {
		let scriptName = getScriptNameFromPath(uri.fsPath);
		if (scriptName === undefined) {
			return;
		}
		let arr = scriptNamePaths.get(scriptName);
		if (arr === undefined) {
			return;
		}
		if (arr.length === 1) {
			scriptNamePaths.delete(scriptName);
			return;
		}
		let fsPath = path.resolve(uri.fsPath);
		for (let index = 0; index < arr.length; index++) {
			let pathStrAtIndex = arr[index];
			if (pathStrAtIndex === fsPath) {
				arr.splice(index, 1);
				break;
			}
		}
	});
	disposables.push(watcher);
	initialFinderCancellationToken = new vscode.CancellationTokenSource();
	let myToken = initialFinderCancellationToken.token;
	vscode.workspace.findFiles('**/*.lua', undefined, undefined, myToken).then(files => {
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
	scriptNamePaths = new Map<string, string[]>();
	if (initialFinderCancellationToken !== undefined) {
		initialFinderCancellationToken.cancel();
		initialFinderCancellationToken = undefined;
	}
}