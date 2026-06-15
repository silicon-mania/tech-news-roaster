# Browser-Only Image Persistence With Retention

> **Status: superseded by [ADR-0019](0019-server-side-persistence-and-single-operator-auth.md).** Generated images now persist in server object storage, and the ten-latest retention cap is dropped — automated runs accumulate continuously, so a fixed count no longer makes sense and the runs list is paginated instead. The original reasoning is kept below for history.

In v2, saved runs continue to live only in browser storage even though they may include news-linked images, generated image variations, and image model provenance. We chose this to preserve the product's no-account, current-device simplicity, while adding automatic saved run retention so only the ten latest successful runs are kept and image-heavy history cannot grow without bound.
