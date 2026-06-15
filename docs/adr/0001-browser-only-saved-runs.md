# Browser-Only Saved Runs

> **Status: superseded by [ADR-0019](0019-server-side-persistence-and-single-operator-auth.md).** Automating discovery and generation needs a server process that creates and stores runs while the operator is away and no browser is open, which browser-only storage cannot support. All runs, manual and automated, now persist server-side under a single operator account. The original reasoning is kept below for history.

In v1, saved runs live only in browser storage on the current device, with no account system, no server persistence, and no cross-device continuity. We chose this because the product is a fast internal tool, and browser-only persistence keeps the implementation simple while still preserving useful run history for reopening, editing, and deletion.
