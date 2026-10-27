/**
 * The extension's logic with no dependency on the `vscode` module: every editor
 * interaction goes through {@link Host}, so it is unit-tested without an editor.
 */

export const TEMPLATES = ['next', 'react-vite'] as const;

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Host {
  pick(items: readonly string[], placeHolder: string): Promise<string | undefined>;
  input(prompt: string, value?: string): Promise<string | undefined>;
  info(message: string): void;
  error(message: string): void;
  /** Show text in the Atlas output channel. */
  output(text: string): void;
  /** Run a command line in a visible terminal (the user sees it and can answer prompts). */
  terminal(name: string, commandLine: string): void;
  /** Run a program without a shell and capture its output. */
  run(file: string, args: readonly string[]): Promise<RunResult>;
  setting(key: 'cliPath'): string;
  workspaceDir(): string | undefined;
}

/** POSIX/PowerShell-safe single-quote of one argument for a terminal command line. */
export function shellQuote(arg: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/** The program and leading arguments that launch the Atlas CLI. */
export function cliInvocation(cliPath: string): { file: string; prefix: string[] } {
  const path = cliPath.trim();
  return path ? { file: path, prefix: [] } : { file: 'npx', prefix: ['--yes', '@atlasauth/cli'] };
}

export function cliCommandLine(cliPath: string, args: readonly string[]): string {
  const { file, prefix } = cliInvocation(cliPath);
  return [file, ...prefix, ...args].map(shellQuote).join(' ');
}

/** An app folder name `create-atlas-app` accepts: lowercase, digits, `.`, `_`, `-`. */
export function validAppName(name: string): boolean {
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(name);
}

async function cli(host: Host, args: readonly string[]): Promise<RunResult> {
  const { file, prefix } = cliInvocation(host.setting('cliPath'));
  try {
    return await host.run(file, [...prefix, ...args]);
  } catch (err) {
    return { code: 127, stdout: '', stderr: err instanceof Error ? err.message : String(err) };
  }
}

async function show(host: Host, title: string, args: readonly string[]): Promise<void> {
  const r = await cli(host, args);
  host.output(`$ atlas ${args.join(' ')}\n${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}`.trimEnd());
  if (r.code !== 0) host.error(`${title} failed (exit ${r.code}). See the Atlas output.`);
}

export async function scaffoldApp(host: Host): Promise<void> {
  const template = await host.pick(TEMPLATES, 'Starter template');
  if (!template) return;
  const name = await host.input('App folder name', 'my-atlas-app');
  if (!name) return;
  if (!validAppName(name)) {
    host.error('Use lowercase letters, digits, ".", "_" or "-" (start with a letter or digit).');
    return;
  }
  host.terminal('Atlas', cliCommandLine('npx', ['--yes', 'create-atlas-app', name, '--template', template]));
}

/** `atlas status` (platform + upstream) and `atlas whoami` (profile, instance). */
export async function showStatus(host: Host): Promise<void> {
  await show(host, 'whoami', ['whoami']);
  await show(host, 'status', ['status']);
}

/** Keys come from `atlas keys list`, which never prints a secret. */
export async function listKeys(host: Host): Promise<void> {
  await show(host, 'keys list', ['keys', 'list']);
}

export async function preflight(host: Host): Promise<void> {
  host.terminal('Atlas', cliCommandLine(host.setting('cliPath'), ['preflight']));
}

export async function installMcp(host: Host): Promise<void> {
  const dir = host.workspaceDir();
  if (!dir) {
    host.error('Open a folder first: the MCP server is added to its .vscode/mcp.json.');
    return;
  }
  const r = await cli(host, ['mcp', 'install', '--vscode']);
  host.output(`$ atlas mcp install --vscode\n${r.stdout}${r.stderr ? `\n${r.stderr}` : ''}`.trimEnd());
  if (r.code === 0) host.info('Atlas MCP server added to .vscode/mcp.json.');
  else host.error(`Could not add the MCP server (exit ${r.code}). See the Atlas output.`);
}

/** Free-form CLI command, run in a terminal so prompts and long-running commands (`listen`, `dev`) work. */
export async function runCli(host: Host): Promise<void> {
  const text = await host.input('atlas command', 'users list');
  if (!text?.trim()) return;
  const args = splitArgs(text);
  if (!args) {
    host.error('Unbalanced quotes in the command.');
    return;
  }
  if (args[0] === 'atlas') args.shift();
  host.terminal('Atlas', cliCommandLine(host.setting('cliPath'), args));
}

/** Split a command line on spaces, honouring single and double quotes; null when quotes are unbalanced. */
export function splitArgs(text: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  let has = false;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (quote) return null;
  if (cur || has) out.push(cur);
  return out;
}

/** The status-bar text from `atlas whoami` output: the first non-empty line, or a not-signed-in hint. */
export function statusBarText(r: RunResult): string {
  if (r.code !== 0) return 'Atlas: not signed in';
  const line = r.stdout.split('\n').map((l) => l.trim()).find(Boolean);
  return line ? `Atlas: ${line.slice(0, 48)}` : 'Atlas';
}

export async function statusBar(host: Host): Promise<string> {
  return statusBarText(await cli(host, ['whoami']));
}
