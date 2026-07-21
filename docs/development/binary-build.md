# Building a Standalone Binary

> **You may not need to build one.** Prebuilt binaries and builds for Linux, macOS, and Windows are published on the [Releases page](https://github.com/Quantrail-Data/CH-Ops/releases). Download the asset for your platform (`chops-linux-x64`, `chops-darwin-arm64`, or `chops-windows-x64.exe`) and run it with the required environment variables. Build your own only when you need a custom build; the rest of this page covers that.

CHOps can be compiled into a single self-contained executable using Bun's `--compile` flag. The binary bundles the Bun runtime, all JavaScript code, `node_modules`, the pre-built frontend, and the documentation into one file. The target machine does not need Bun, Node.js, or any other runtime installed.

## Why build a binary?

- **Simple deployment**: copy one file to your server, set environment variables, run it.
- **No dependency installation**: no `bun install` or `npm install` on the target.
- **Reproducible**: the binary is a snapshot of your exact code and dependencies.
- **Cross-compilation**: build on your development machine for any supported target.

## Build commands

Run `bun install` before building. It installs dependencies and, importantly, applies the `@xenova/transformers` patch that makes the compiled binary self-contained. Building without a completed `bun install` produces a binary that crashes at startup on native modules (see [Native dependencies and the AI runtime](#native-dependencies-and-the-ai-runtime)).

```bash
bun install

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

## Native dependencies and the AI runtime

CHOps's AI features (Qurioz) use `@xenova/transformers` for text embeddings. In its unpatched form that library pulls in two native modules, `onnxruntime-node` and `sharp`, and both break `bun build --compile`. Their native addons depend on artifacts the compiler cannot embed: `onnxruntime-node` links against a sibling shared library (`libonnxruntime.so` on Linux, `.dylib` on macOS, `.dll` on Windows), and `sharp` loads a prebuilt `.node` binary through a path that only resolves inside a real `node_modules`. Because both are imported at startup, an unpatched binary crashes on boot with errors like `ERR_DLOPEN_FAILED: libonnxruntime.so...` or `Cannot find module '.../build/Release/sharp-linux-x64.node'`, even though the exact same code runs fine under a normal `bun` or `node` process (where the sibling files sit next to the addon in `node_modules`).

CHOps fixes this at the dependency level with a Bun patch, applied automatically during `bun install` and wired through `package.json`:

```json
"patchedDependencies": {
  "@xenova/transformers@2.17.2": "patches/@xenova%2Ftransformers@2.17.2.patch"
}
```

The patch, in `patches/`, makes two changes to `@xenova/transformers`:

- It forces the ONNX runtime to the WebAssembly backend (`onnxruntime-web`, a direct dependency) instead of the native `onnxruntime-node`. WebAssembly has no native addon and no sibling shared library, so it behaves identically whether run from source or compiled.
- It defers loading `sharp` until an image is actually processed, rather than importing it at module load. CHOps only runs text feature-extraction, so that path never executes, and the compiled binary no longer needs sharp's native binary at boot.

With the patch in place, a normal build produces a genuinely self-contained binary that needs no external native libraries on the host:

```bash
bun install          # applies the patch
bun run build:binary
```

There is nothing to copy alongside the binary, no `LD_LIBRARY_PATH` to set, and no `node_modules` to ship. After the WebAssembly runtime loads, `@xenova/transformers` still fetches the embedding model on first use of Qurioz, so a host that will run Qurioz needs network access or a pre-populated model cache.

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

**`ERR_DLOPEN_FAILED: libonnxruntime.so...` or `Cannot find module '.../sharp-*.node'` at startup.** The `@xenova/transformers` patch was not applied, so the binary is trying to load a native module. Confirm that `patches/@xenova%2Ftransformers@2.17.2.patch` exists and that `patchedDependencies` is present in `package.json`, run `bun install` (which applies patches), then rebuild. See [Native dependencies and the AI runtime](#native-dependencies-and-the-ai-runtime).

**Cross-compiled binary does not run.** Ensure you used the correct target for the destination platform. A `bun-linux-x64` binary will not run on ARM Linux, macOS, or Windows.
