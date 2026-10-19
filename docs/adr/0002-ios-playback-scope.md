# 0002 — iPhone playback scope

Status: Accepted (19/10/2026, phases 1–2 of plan 0004)

## Context

The prototype can stream a single track in Safari and an iPhone Home Screen web app. Replacing one audio element's source on `ended` caused silent or delayed transitions. A two-element diagnostic with a fully preloaded next file under 25 MiB passed two background transitions in both tested launch modes.

## Alternatives

- Replace the current element's source at the end: simpler, but failed the device trial.
- Preload a bounded next file and switch between two elements: passed the limited diagnostic.
- Native wrapper or HLS: larger architecture changes without a requirement or trial yet.

## Decision

Phase 2 implements authenticated byte-range playback of one file. The queue and bounded preload transition belong to phase 4. The device trial does not establish reliability for large files, long queues or weak networks.

## Consequences

MP3 and M4A/AAC over 25 MiB remain eligible for manual playback and later import. The later queue UI must warn that seamless background transition for those files is unproven. No offline audio caching is part of the MVP.
