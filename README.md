# Atlas for VS Code

Work with your Atlas instance without leaving the editor.

- **Atlas: Create an app** scaffolds a starter app (`create-atlas-app`) in a terminal.
- **Atlas: Show instance and platform status** and **List instance keys** run the Atlas CLI and show the result in the Atlas output. Key lists never contain secrets.
- **Atlas: Run a CLI command** runs any `atlas` command in a terminal.
- **Atlas: Check this app's setup** runs `atlas preflight`.
- **Atlas: Add the Atlas MCP server to this workspace** runs `atlas mcp install --vscode`.
- The status bar shows the signed-in profile.

Sign in once with `atlas login` in a terminal. The extension never stores or prints a secret key.

Settings: `atlas.cliPath` (empty runs `npx @atlasauth/cli`), `atlas.statusBar`.

Build the `.vsix` with `npx @vscode/vsce package` from this folder.
