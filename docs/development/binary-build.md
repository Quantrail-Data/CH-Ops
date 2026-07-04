# Building a Standalone Binary

CHOps can be compiled into a single self-contained executable using Bun's `--compile` flag. The binary bundles the Bun runtime, all JavaScript code, node_modules, and the pre-built frontend into one file. The target machine does not need Bun, Node.js, or any other runtime installed.

## Why Build a Binary?

- **Simple deployment**: copy one file to your server, set environment variables, run it.
- **No dependency installation**: no `bun install` or `npm install` on the target.
- **Reproducible**: the binary is a snapshot of your exact code and dependencies.
- **Cross-compilation**: build on your development machine for any supported target.

## Build Commands

```bash
# Build for whatever platform you're on right now
bun run build:binary

# Cross-compile for specific platforms
bun run build:binary:linux      # Produces: chops-linux-x64
bun run build:binary:mac        # Produces: chops-darwin-arm64
bun run build:binary:windows    # Produces: chops-windows-x64.exe
```

## What Happens During the Build

1. **`vite build`** runs first - this compiles the React frontend (JSX, CSS) into optimized static files in the `dist/` directory.
2. **`bun build --compile`** runs second - this takes `src/backend/server.js` as the entry point, traces all its imports (Express, Drizzle, all controllers, services, etc.), bundles them together with the Bun runtime, and produces a single executable.

The `dist/` directory is embedded in the binary because `server.js` serves it as static files. When the binary runs, it can find `dist/index.html` and serve the frontend.

## Running the Binary

```bash
# Linux / macOS
chmod +x chops-linux-x64
./chops-linux-x64

# Windows
chops-windows-x64.exe
```

## Configuration

The binary still needs environment variables, just like the dev server. You can provide them via:

**Option 1: A `.env` file** in the working directory (CHOps reads it automatically):

```env
SUPER_ADMIN_1=admin
SUPER_ADMIN_1_PASSWORD=your_password
SESSION_SECRET=your_random_string
PORT=3000
```

**Option 2: Exported environment variables**:

```bash
export SUPER_ADMIN_1=admin
export SUPER_ADMIN_1_PASSWORD=your_password
export SESSION_SECRET=your_random_string
./chops-linux-x64
```

**Option 3: Inline** (useful for quick testing):

```bash
SUPER_ADMIN_1=admin SUPER_ADMIN_1_PASSWORD=secret SESSION_SECRET=abc ./chops-linux-x64
```

## Database

The SQLite database (`data/chops.db`) is created at runtime in the current working directory. It is not embedded in the binary. If you move the binary to a new directory, it creates a fresh database. To preserve settings, alerts, and dashboards, keep the `data/` directory alongside the binary.

## Binary Size

The binary is typically 60-90 MB depending on the platform. This includes the Bun runtime (~50 MB), all application code, and all npm dependencies.

## Troubleshooting

**Binary fails to start**: Make sure environment variables are set (at minimum: `SUPER_ADMIN_1`, `SUPER_ADMIN_1_PASSWORD`, `SESSION_SECRET`).

**"Frontend not built" error from binary**: This should not happen if you used `bun run build:binary` (which runs `vite build` first). If you ran `bun build --compile` manually, make sure `dist/` exists first.

**Cross-compiled binary does not run**: Ensure you used the correct target for the destination platform. A `bun-linux-x64` binary will not run on ARM Linux or macOS.
