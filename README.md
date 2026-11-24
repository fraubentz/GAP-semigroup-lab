# GAP Semigroup Workbench

An in-browser **GAP 4 WebAssembly** terminal and interactive semigroup theory workbench featuring Green's relations inspection, an interactive Egg-Box diagram explorer, a `.g` script editor, virtual filesystem management, and a built-in POSIX-style workspace shell.

## Features

- **In-Browser GAP 4 (`gap.wasm`)**: Full GAP 4 WebAssembly runtime with lazy virtual filesystem loading, IndexedDB caching, and `SharedArrayBuffer` / HTTP PTY bridge support.
- **Semigroups Package & Toolkit**: Includes the `semigroups` GAP package (`libsemigroups`) alongside `semigroups_toolkit.g` and `semigroup_lab.g` for transformation monoids, diagram monoids, partition-stabilizing semigroups, conjugacy profiles, and transversal regularity tests.
- **Interactive Egg-Box Explorer**: Visualizes $\mathcal{D}$-, $\mathcal{R}$-, $\mathcal{L}$-, and $\mathcal{H}$-classes, idempotents, and group $\mathcal{H}$-classes from `InspectSemigroup(...)`.
- **Script Editor & Virtual Files**: Edit, save, upload, and run `.g` scripts directly in `/home/web_user`.

## License

This project is licensed under the **GNU General Public License v3.0 or later (`GPL-3.0-or-later`)** — see [`LICENSE`](./LICENSE) for the full text.

`GPL-3.0-or-later` is required because this workbench compiles and links **GAP 4** (`GPL-2.0-or-later`) and **`gap-system/gap-in-the-browser`** (`GPL-2.0-or-later`) together with the **`semigroups/Semigroups`** package and **`libsemigroups`** (`GPL-3.0-or-later`). Vendored frontend utilities (`xterm.js`, `xterm-pty`, `coi-serviceworker`) remain under their respective permissive **MIT** licenses.

## Credits & Upstream GitHub Repositories

This project builds directly on the following open-source GitHub repositories:

| Repository | Role in This Project | License |
| --- | --- | --- |
| [`gap-system/gap`](https://github.com/gap-system/gap) | GAP 4 Computer Algebra System core, library, and small/primitive/transitive group libraries | `GPL-2.0-or-later` |
| [`gap-system/gap-in-the-browser`](https://github.com/gap-system/gap-in-the-browser) | Original GAP 4 Emscripten/WebAssembly port, lazy virtual filesystem (`gap-fs.js`), and browser worker architecture | `GPL-2.0-or-later` |
| [`semigroups/Semigroups`](https://github.com/semigroups/Semigroups) | GAP `Semigroups` package for finite semigroups, monoids, congruences, and Green's relations | `GPL-3.0-or-later` |
| [`libsemigroups/libsemigroups`](https://github.com/libsemigroups/libsemigroups) | C++17 engine statically compiled into `gap.wasm` powering `Semigroups` algorithms | `GPL-3.0-or-later` |
| [`gap-packages/smallsemi`](https://github.com/gap-packages/smallsemi) | Library of all small semigroups up to order 8 | `GPL-2.0-or-later` |
| [`gap-packages/numericalsgps`](https://github.com/gap-packages/numericalsgps) | GAP package for numerical semigroups | `GPL-2.0-or-later` |
| [`xtermjs/xterm.js`](https://github.com/xtermjs/xterm.js) | Interactive browser terminal emulator (`xterm.min.js`, `xterm-addon-fit`) | `MIT` |
| [`mame/xterm-pty`](https://github.com/mame/xterm-pty) | Emscripten PTY / `termios` bridge connecting `gap.wasm` stdin/stdout/ioctl to `xterm.js` | `MIT` |
| [`gzuidhof/coi-serviceworker`](https://github.com/gzuidhof/coi-serviceworker) | Service worker enabling COOP/COEP headers for `SharedArrayBuffer` on static hosts | `MIT` |
