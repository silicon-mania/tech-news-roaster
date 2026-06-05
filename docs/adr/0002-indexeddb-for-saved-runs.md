# IndexedDB For Saved Runs

Saved runs are persisted in IndexedDB by default rather than localStorage. We chose IndexedDB because saved runs are structured browser-only records that can accumulate over time, and IndexedDB gives us better capacity and shape for reopening, editing, and deleting run history without adding a backend.
