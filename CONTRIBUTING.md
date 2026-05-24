# Contributing

Thanks for your interest in contributing to discord-bot-manager!

## How to contribute

1. **Fork** the repository
2. **Create a branch** for your feature or fix: `git checkout -b feat/my-feature`
3. **Make your changes**
4. **Run the build** to make sure it compiles cleanly:
   ```bash
   npm run build
   ```
5. **Commit** with a clear message describing what changed and why
6. **Open a pull request**

## Guidelines

- Keep the API surface minimal and composable
- Maintain backward compatibility whenever possible
- Add types for everything (no `any` unless absolutely necessary)
- Keep the README docs updated if you change behaviour
- Follow the existing code style (2-space indent, no semicolons, single quotes)

## Project structure

```
src/
  index.ts          — public exports
  types.ts          — TypeScript interfaces/types
  BotProcess.ts     — single bot child process wrapper
  Manager.ts        — multi-process manager
examples/
  bot-worker.js     — example bot script
  manager.js        — example manager usage
```

## Running examples

```bash
npm run build
node examples/manager.js
```

## Questions?

Open an issue at https://github.com/your-username/discord-bot-manager/issues
