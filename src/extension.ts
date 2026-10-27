import { execFile } from 'node:child_process';
import {
  installMcp,
  listKeys,
  preflight,
  runCli,
  scaffoldApp,
  showStatus,
  statusBar,
  type Host,
} from './core';

/** The few parts of the `vscode` module used here (the real module is provided by the editor at runtime). */
interface Disposable {
  dispose(): void;
}
interface VsCode {
  commands: { registerCommand(id: string, fn: () => unknown): Disposable };
  window: {
    showQuickPick(items: readonly string[], o: { placeHolder: string }): PromiseLike<string | undefined>;
    showInputBox(o: { prompt: string; value?: string }): PromiseLike<string | undefined>;
    showInformationMessage(m: string): void;
    showErrorMessage(m: string): void;
    createOutputChannel(name: string): { appendLine(l: string): void; show(preserveFocus?: boolean): void } & Disposable;
    createTerminal(name: string): { show(): void; sendText(t: string): void };
    createStatusBarItem(align: number): { text: string; command: string; show(): void; hide(): void } & Disposable;
  };
  workspace: {
    getConfiguration(section: string): { get<T>(key: string): T | undefined };
    workspaceFolders?: readonly { uri: { fsPath: string } }[];
  };
}

export function activate(context: { subscriptions: Disposable[] }): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vscode = require('vscode') as VsCode;
  const channel = vscode.window.createOutputChannel('Atlas');
  const config = () => vscode.workspace.getConfiguration('atlas');

  const host: Host = {
    pick: (items, placeHolder) => Promise.resolve(vscode.window.showQuickPick(items, { placeHolder })),
    input: (prompt, value) => Promise.resolve(vscode.window.showInputBox({ prompt, value })),
    info: (m) => vscode.window.showInformationMessage(m),
    error: (m) => vscode.window.showErrorMessage(m),
    output: (text) => {
      for (const line of text.split('\n')) channel.appendLine(line);
      channel.show(true);
    },
    terminal: (name, commandLine) => {
      const t = vscode.window.createTerminal(name);
      t.show();
      t.sendText(commandLine);
    },
    run: (file, args) =>
      new Promise((resolve, reject) => {
        // execFile, never a shell: arguments are not re-parsed.
        execFile(file, [...args], { cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath, timeout: 30_000 }, (err, stdout, stderr) => {
          if (err && (err as NodeJS.ErrnoException).code === 'ENOENT') return reject(err);
          resolve({ code: err ? (typeof (err as { code?: unknown }).code === 'number' ? ((err as unknown as { code: number }).code) : 1) : 0, stdout, stderr });
        });
      }),
    setting: (key) => config().get<string>(key) ?? '',
    workspaceDir: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };

  const bar = vscode.window.createStatusBarItem(1);
  bar.command = 'atlas.showStatus';
  const refresh = async () => {
    if (config().get<boolean>('statusBar') === false) return bar.hide();
    bar.text = await statusBar(host);
    bar.show();
  };

  const commands: Record<string, () => unknown> = {
    'atlas.scaffoldApp': () => scaffoldApp(host),
    'atlas.showStatus': () => showStatus(host),
    'atlas.listKeys': () => listKeys(host),
    'atlas.runCli': () => runCli(host),
    'atlas.preflight': () => preflight(host),
    'atlas.installMcp': () => installMcp(host),
    'atlas.refreshStatusBar': refresh,
  };
  for (const [id, fn] of Object.entries(commands)) context.subscriptions.push(vscode.commands.registerCommand(id, fn));
  context.subscriptions.push(channel, bar);
  void refresh();
}

export function deactivate(): void {}
