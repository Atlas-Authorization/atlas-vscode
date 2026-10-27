import { describe, expect, it } from 'vitest';
import {
  cliCommandLine,
  installMcp,
  listKeys,
  runCli,
  scaffoldApp,
  shellQuote,
  splitArgs,
  statusBarText,
  validAppName,
  type Host,
  type RunResult,
} from './core';

function fakeHost(over: Partial<Host> & { picks?: string[]; inputs?: string[]; result?: RunResult } = {}) {
  const log = { terminals: [] as string[], outputs: [] as string[], errors: [] as string[], infos: [] as string[], runs: [] as string[][] };
  const picks = [...(over.picks ?? [])];
  const inputs = [...(over.inputs ?? [])];
  const host: Host = {
    pick: async () => picks.shift(),
    input: async () => inputs.shift(),
    info: (m) => void log.infos.push(m),
    error: (m) => void log.errors.push(m),
    output: (t) => void log.outputs.push(t),
    terminal: (_n, c) => void log.terminals.push(c),
    run: async (file, args) => {
      log.runs.push([file, ...args]);
      return over.result ?? { code: 0, stdout: 'ok\n', stderr: '' };
    },
    setting: () => '',
    workspaceDir: () => '/work',
    ...over,
  };
  return { host, log };
}

describe('quoting and parsing', () => {
  it('quotes only when needed and neutralises quotes', () => {
    expect(shellQuote('my-app')).toBe('my-app');
    expect(shellQuote('a b')).toBe(`'a b'`);
    expect(shellQuote(`it's; rm -rf /`)).toBe(`'it'\\''s; rm -rf /'`);
  });
  it('builds the CLI line from npx or a configured path', () => {
    expect(cliCommandLine('', ['keys', 'list'])).toBe('npx --yes @atlasauth/cli keys list');
    expect(cliCommandLine('/usr/local/bin/atlas', ['whoami'])).toBe('/usr/local/bin/atlas whoami');
  });
  it('splits quoted arguments and detects unbalanced quotes', () => {
    expect(splitArgs(`users create --email "a b@x.io" ''`)).toEqual(['users', 'create', '--email', 'a b@x.io', '']);
    expect(splitArgs('users "oops')).toBeNull();
  });
  it('validates app names', () => {
    expect(validAppName('my-app.1')).toBe(true);
    for (const bad of ['', 'My', '-x', 'a b', '../x', 'a;b']) expect(validAppName(bad)).toBe(false);
  });
});

describe('commands', () => {
  it('scaffolds an app in a terminal', async () => {
    const { host, log } = fakeHost({ picks: ['react-vite'], inputs: ['demo'] });
    await scaffoldApp(host);
    expect(log.terminals).toEqual(['npx --yes create-atlas-app demo --template react-vite']);
  });
  it('refuses a bad app name and stops on cancel', async () => {
    const bad = fakeHost({ picks: ['next'], inputs: ['../evil'] });
    await scaffoldApp(bad.host);
    expect(bad.log.terminals).toEqual([]);
    expect(bad.log.errors).toHaveLength(1);
    const cancelled = fakeHost({ picks: [] });
    await scaffoldApp(cancelled.host);
    expect(cancelled.log.terminals).toEqual([]);
  });
  it('lists keys via the CLI without a shell and shows the output', async () => {
    const { host, log } = fakeHost();
    await listKeys(host);
    expect(log.runs).toEqual([['npx', '--yes', '@atlasauth/cli', 'keys', 'list']]);
    expect(log.outputs[0]).toContain('ok');
  });
  it('reports a failed CLI run', async () => {
    const { host, log } = fakeHost({ result: { code: 2, stdout: '', stderr: 'nope' } });
    await listKeys(host);
    expect(log.errors[0]).toContain('exit 2');
  });
  it('installs the MCP server only inside a folder', async () => {
    const none = fakeHost({ workspaceDir: () => undefined });
    await installMcp(none.host);
    expect(none.log.runs).toEqual([]);
    const ok = fakeHost();
    await installMcp(ok.host);
    expect(ok.log.runs[0]).toEqual(['npx', '--yes', '@atlasauth/cli', 'mcp', 'install', '--vscode']);
    expect(ok.log.infos).toHaveLength(1);
  });
  it('runs a free-form command, dropping a leading "atlas"', async () => {
    const { host, log } = fakeHost({ inputs: ['atlas users list --limit 5'] });
    await runCli(host);
    expect(log.terminals).toEqual(['npx --yes @atlasauth/cli users list --limit 5']);
  });
});

describe('status bar', () => {
  it('shows the first line or a not-signed-in hint', () => {
    expect(statusBarText({ code: 0, stdout: '\nprofile default · ins_123\nmore', stderr: '' })).toBe('Atlas: profile default · ins_123');
    expect(statusBarText({ code: 1, stdout: '', stderr: 'x' })).toBe('Atlas: not signed in');
  });
});
