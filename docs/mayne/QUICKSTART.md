# Mayne Quick Start

Mayne is the shared foundation. Apps stay original.

## Run the checks

```bash
pnpm install
pnpm check
```

## Add an app

1. Create `apps/<app-name>`.
2. Keep the app's own workflow, language, design, and data model.
3. Add `module.manifest.json`.
4. Import only the Mayne packages the app needs.
5. Run `pnpm check`.
6. Open a pull request.

## Module manifest

```json
{
  "id": "example-app",
  "name": "Example App",
  "version": "1.0.0",
  "status": "demo",
  "foundation": ["config", "logging", "health", "testing"],
  "owns": ["ExampleRecord"]
}
```

## Rule

Mayne owns reusable infrastructure. The app owns its business domain.

Do not import one app from another app. Use a versioned event or contract instead.

Do not mark an app production-ready while unresolved `PLACEHOLDER` values remain.
