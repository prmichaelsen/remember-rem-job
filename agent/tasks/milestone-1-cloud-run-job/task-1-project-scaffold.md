# Task 1: Project Scaffold

**Milestone**: [M1 - Cloud Run Job](../../milestones/milestone-1-cloud-run-job.md)
**Estimated Time**: 1-2 hours
**Dependencies**: None
**Status**: Not Started

---

## Objective

Create the TypeScript project structure with build configuration, dependencies, and basic directory layout.

---

## Context

remember-rem-job is a thin Cloud Run Job wrapper around remember-core's RemService. The project needs a minimal TypeScript setup with ESM modules, similar to remember-rest-service but without NestJS (no HTTP framework needed for a job).

---

## Steps

### 1. Initialize npm Project

```bash
npm init -y
```

Update package.json with:
- name: `remember-rem-job`
- type: `module`
- main: `dist/index.js`
- scripts: build, start, dev, typecheck, test

### 2. Install Dependencies

Production:
- `@prmichaelsen/remember-core` — RemService, MemoryService, RelationshipService, Weaviate, Firestore
- `@anthropic-ai/sdk` — Haiku API for cluster validation (if not already in remember-core)

Dev:
- `typescript`
- `@types/node`
- `vitest` (testing)
- `tsx` (dev runner)

### 3. Create tsconfig.json

Target ES2022, module Node16, strict mode, ESM output. Follow remember-rest-service conventions.

### 4. Create Directory Structure

```bash
mkdir -p src/config
mkdir -p scripts
mkdir -p tests
```

### 5. Create .gitignore Updates

Ensure node_modules/, dist/, .env.*.local are ignored.

---

## Verification

- [ ] `npm install` succeeds
- [ ] `npx tsc --noEmit` succeeds (empty project, no errors)
- [ ] package.json has correct metadata and scripts
- [ ] tsconfig.json is valid
- [ ] Directory structure matches spec

---

## Expected Output

```
remember-rem-job/
├── package.json
├── tsconfig.json
├── .gitignore (updated)
├── src/
│   └── (empty, ready for task 2-3)
├── scripts/
│   └── (empty, ready for task 2)
└── tests/
    └── (empty, ready for task 6)
```

---

**Next Task**: [Task 2: ConfigService & Secrets](task-2-config-service.md)
**Related Design Docs**: [GCP Execution Environment](../../design/local.gcp-execution-environment.md)
