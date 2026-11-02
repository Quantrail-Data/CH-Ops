# Building a Standalone Binary

> **You may not need to build one.** We publish prebuilt binaries for Linux, macOS, and Windows on the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases). Download the asset for your platform (`chops-linux-x64`, `chops-darwin-arm64`, or `chops-windows-x64.exe`) and run it with the required environment variables. Build your own only when you need a custom build, which the rest of this page covers.

You can compile CHOps into a single self-contained executable with Bun's `--compile` flag. The binary bundles the Bun runtime, all JavaScript code, `node_modules`, the pre-built frontend, and the documentation into one file. The target machine does not need Bun, Node.js, or any other runtime installed.

## Why build a binary?

- **Simple deployment**: copy one file to your server, set environment variables, run it.
- **No dependency installation**: no `bun install` or `npm install` on the target.
- **Reproducible**: the binary is a snapshot of your exact code and dependencies.
- **Cross-compilation**: build on your development machine for any supported target.

## Build commands

Run `bun install` before you build. It installs the dependencies that the build bundles into the binary.

```bash
bun install

# Build for whatever platform you are on right now
bun run build:binary

# Cross-compile for specific platforms
bun run build:binary:linux      # Produces: chops-linux-x64
bun run build:binary:mac        # Produces: chops-darwin-arm64
bun run build:binary:windows    # Produces: chops-windows-x64.exe
```

The `build:standalone:linux`, `build:standalone:mac`, and `build:standalone:windows` scripts make the same files with `--env=inline`, an option that copies the environment variables of the build shell into the binary. The release pipeline uses these scripts. Do not run them in a shell that has secrets, such as `ENCRYPTION_SECRET` or admin passwords.

## What happens during the build

Each `build:binary` command runs three steps in order:

1. **`bun run build`** writes the version file and the icon sprite. Then it runs `vite build`, which compiles the React frontend (JSX, CSS) into optimized static files under `dist/`.
2. **`bun run embed`** runs `scripts/embed-static.js`. This walks both `dist/` and `docs/`, base64-encodes every file, and generates `src/backend/embeddedAssets.js`, a module that exports a Map of asset path to its bytes and MIME type. It prints how many dist and docs files it embedded and the size of the generated module.
3. **`bun build src/backend/server.js --compile --outfile chops`** takes `server.js` as the entry point, traces all its imports (Express, Drizzle, the controllers and services, and the generated `embeddedAssets.js`), and bundles them together with the Bun runtime into one executable.

### How the frontend and docs get into the binary

The frontend is not embedded because `bun --compile` finds `dist/` on disk. It is embedded because the `embed` step turns `dist/` and `docs/` into the `embeddedAssets.js` module, which the compiler then bundles like any other imported code. At runtime, `server.js` imports `./embeddedAssets.js`. In the compiled binary that module is present, so the server serves the frontend and the documentation straight from memory, with no files needed on disk. When you run from source instead (dev or `bun src/backend/server.js`), the generated module is absent, and `server.js` falls back to serving `dist/` and `docs/` from the filesystem.

This is why the `embed` step matters. Skipping it produces a binary with no embedded frontend, which then reports "Frontend not built" when run from a directory that has no `dist/`.

## Running the binary

```bash
# Linux / macOS
chmod +x chops-linux-x64
./chops-linux-x64

# Windows
chops-windows-x64.exe
```

## Configuration

The binary still needs environment variables, just like the dev server. The required set is `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `ENCRYPTION_SECRET`. The server exits on startup if any of these is missing. See [Configuration](../getting-started/configuration.md) for the full list. Provide them in one of three ways.

**Option 1: A `.env` file** in the working directory, which CHOps reads automatically:

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_password
SUPER_ADMIN_1_EMAIL=you@example.com
ENCRYPTION_SECRET=paste_output_of_openssl_rand_hex_32_here
PORT=3000
```

**Option 2: Exported environment variables:**

```bash
export SUPER_ADMIN_1=admin
export SUPER_ADMIN_1_PASSWORD=your_password
export SUPER_ADMIN_1_EMAIL=you@example.com
export ENCRYPTION_SECRET=paste_output_of_openssl_rand_hex_32_here
./chops-linux-x64
```

**Option 3: Inline** (useful for quick testing):

```bash
SUPER_ADMIN_1=admin SUPER_ADMIN_1_PASSWORD=secret SUPER_ADMIN_1_EMAIL=you@example.com ENCRYPTION_SECRET=$(openssl rand -hex 32) ./chops-linux-x64
```

## Database

The binary creates the SQLite database (`data/chops.db`) at runtime in the current working directory, along with its write-ahead-log files and the per-install `data/crypto.salt`. None of this is embedded in the binary. If you move the binary to a new directory, it creates a fresh database. To keep settings, alerts, dashboards, and stored credentials, keep the `data/` directory with the binary. Stored credentials need `data/crypto.salt` and the same `ENCRYPTION_SECRET`.

## Binary size

The binary is typically 60 to 90 MB, depending on the platform. This includes the Bun runtime, all application code, all npm dependencies, and the embedded frontend and docs.

## Troubleshooting

**Binary fails to start.** Make sure all required environment variables are set: `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SUPER_ADMIN_1_EMAIL`, and `ENCRYPTION_SECRET`. The server validates these on startup and exits if any is missing. `ENCRYPTION_SECRET` must have 32 characters or more.

**"Frontend not built" error from the binary.** This should not happen if you used one of the `build:binary` commands, because each runs `build` and `embed` before it compiles. If you invoked `bun build --compile` by hand, make sure you ran `bun run build` and then `bun run embed` first, so that `src/backend/embeddedAssets.js` exists and gets bundled.

**Cross-compiled binary does not run.** Make sure you used the correct target for the destination platform. A `bun-linux-x64` binary will not run on ARM Linux, macOS, or Windows.
