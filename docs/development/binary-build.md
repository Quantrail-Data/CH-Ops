# Building a Standalone Binary

CHOps can be compiled into a single self-contained executable using Bun's `--compile` flag. The binary bundles the Bun runtime, all JavaScript code, `node_modules`, the pre-built frontend, and the documentation into one file. The target machine does not need Bun, Node.js, or any other runtime installed.

## Why build a binary?

- **Simple deployment**: copy one file to your server, set environment variables, run it.
- **No dependency installation**: no `bun install` or `npm install` on the target.
- **Reproducible**: the binary is a snapshot of your exact code and dependencies.
- **Cross-compilation**: build on your development machine for any supported target.

## Build commands

```bash
# Build for whatever platform you are on right now
bun run build:binary

# Cross-compile for specific platforms
bun run build:binary:linux      # Produces: chops-linux-x64
bun run build:binary:mac        # Produces: chops-darwin-arm64
bun run build:binary:windows    # Produces: chops-windows-x64.exe
```

## What happens during the build

Each `build:binary` command runs three steps in order:

1. **`bun run build`** runs `vite build`, which compiles the React frontend (JSX, CSS) into optimized static files under `dist/`.
2. **`bun run embed`** runs `scripts/embed-static.js`. This walks both `dist/` and `docs/`, base64-encodes every file, and generates `src/backend/embeddedAssets.js`, a module that exports a Map of asset path to its bytes and MIME type. It prints how many dist and docs files it embedded and the size of the generated module.
3. **`bun build src/backend/server.js --compile --outfile chops`** takes `server.js` as the entry point, traces all its imports (Express, Drizzle, the controllers and services, and the generated `embeddedAssets.js`), and bundles them together with the Bun runtime into one executable.

### How the frontend and docs get into the binary

The frontend is not embedded by `bun --compile` finding `dist/` on disk. It is embedded because the `embed` step turns `dist/` and `docs/` into the `embeddedAssets.js` module, which the compiler then bundles like any other imported code. At runtime, `server.js` imports `./embeddedAssets.js`: in the compiled binary that module is present, so the frontend and the documentation are served straight from memory, with no files needed on disk. When you run from source instead (dev or `bun src/backend/server.js`), the generated module is absent, and `server.js` falls back to serving `dist/` and `docs/` from the filesystem.

This is why the `embed` step matters: skipping it produces a binary with no embedded frontend, which then reports "Frontend not built" when run from a directory that has no `dist/`.

## Running the binary

```bash
# Linux / macOS
chmod +x chops-linux-x64
./chops-linux-x64

# Windows
chops-windows-x64.exe
```

## Configuration

The binary still needs environment variables, just like the dev server. The required set is `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `SESSION_SECRET`; the server exits on startup if any of these is missing. See [Configuration](../getting-started/configuration.md) for the full list. Provide them in one of three ways.

**Option 1: A `.env` file** in the working directory, which CHOps reads automatically:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_password
SUPER_ADMIN_1_EMAIL=you@example.com
SESSION_SECRET=your_random_string
PORT=3000
```

**Option 2: Exported environment variables:**

```bash
export SUPER_ADMIN_1=admin
export SUPER_ADMIN_1_PASSWORD=your_password
export SUPER_ADMIN_1_EMAIL=you@example.com
export SESSION_SECRET=your_random_string
./chops-linux-x64
```

**Option 3: Inline** (useful for quick testing):

```bash
SUPER_ADMIN_1=admin SUPER_ADMIN_1_PASSWORD=secret SUPER_ADMIN_1_EMAIL=you@example.com SESSION_SECRET=abc ./chops-linux-x64
```

## Database

The SQLite database (`data/chops.db`) is created at runtime in the current working directory, along with its write-ahead-log files and the per-install `data/crypto.salt`. None of this is embedded in the binary. If you move the binary to a new directory, it creates a fresh database, so to preserve settings, alerts, dashboards, and stored credentials, keep the `data/` directory alongside the binary.

## Binary size

The binary is typically 60 to 90 MB depending on the platform. This includes the Bun runtime, all application code, all npm dependencies, and the embedded frontend and docs.

## Troubleshooting

**Binary fails to start.** Make sure all required environment variables are set: `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `SESSION_SECRET`. The server validates these on startup and exits if any is missing.

**"Frontend not built" error from the binary.** This should not happen if you used one of the `build:binary` commands, since each runs `build` and `embed` before compiling. If you invoked `bun build --compile` by hand, make sure you ran `bun run build` and then `bun run embed` first so that `src/backend/embeddedAssets.js` exists and gets bundled.

**Cross-compiled binary does not run.** Ensure you used the correct target for the destination platform. A `bun-linux-x64` binary will not run on ARM Linux, macOS, or Windows.
