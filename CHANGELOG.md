# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-03-08

### Added
- Snapshot script (`scripts/snapshot.ts`) for before/after REM cycle benchmarking
- Configurable `scoring_batch_size` and `classification_batch_size` in test-fanout script
- `--collection` flag for test-local legacy mode to target specific collections

### Changed
- Upgrade @prmichaelsen/remember-core from 0.43.1 to 0.48.4 (Haiku model fix, code fence stripping, Firestore config, batch scoring, auto-approve removal)
- Worker now passes `collectionId` to ghost REM cycle `runCycle()` call
- Add `before.json` and `after.json` to `.gitignore`

## [0.3.0] - 2026-03-03

### Changed
- **Batch size**: Increase to 5000 candidates per cycle (from 30) in both prod and local testing — larger batches increase odds of finding related memories within a single clustering pass
- **Production**: Run 30 cycles per Cloud Run execution (processes up to ~150k memories per hourly trigger)
- Add aggregate statistics logging across all cycles in production

### Added
- Local test script (scripts/test-local.ts) with dotenv support for testing REM locally without deployment
- Support for custom environment files via `--env-file` flag
- Support for loading Firebase credentials from `./remember-prod-service.json` file
- Diagnostic script (scripts/diagnose-cursor.ts) for inspecting REM state

### Fixed
- Update to @prmichaelsen/remember-core@0.19.7 (fixes Weaviate sort parameter format)

## [0.2.0] - 2026-03-03

### Changed
- Replace RemService stub with real implementation from @prmichaelsen/remember-core@0.19.3
- Update imports to use @prmichaelsen/remember-core/rem subpath
- Simplify tests to contract-only tests (integration testing via E2E scripts)

### Removed
- Remove stub implementation (src/stubs/rem.ts) - no longer needed
- Remove blocker from progress tracking - RemService fully available

### Fixed
- Update remember-core dependency from 0.19.2 to 0.19.3

## [0.1.0] - 2026-03-02

### Added
- Initial project scaffold with TypeScript, ESM modules, and build configuration
- ConfigService with environment validation and typed accessors
- Entry point (src/index.ts) that orchestrates RemService execution
- Docker multi-stage build (191MB image size)
- Cloud Build configs for e1 and production environments
- Deploy script (scripts/deploy.ts) for automated GCP deployment
- Verify script (scripts/verify.ts) for E2E validation
- Unit tests for ConfigService and entry point contracts
- Complete M1 milestone: Cloud Run Job wrapper ready for deployment

### Documentation
- Design documents for REM background relationships and GCP execution environment
- Task breakdown for all 6 tasks in M1 milestone
- Progress tracking in agent/progress.yaml
