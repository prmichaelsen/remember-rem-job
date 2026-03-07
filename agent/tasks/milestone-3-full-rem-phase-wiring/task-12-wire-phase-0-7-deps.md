# Task 12: Wire Phase 0-7 Dependencies

**Milestone**: [M3 - Full REM Phase Wiring](../../milestones/milestone-3-full-rem-phase-wiring.md)
**Estimated Time**: 2-3 hours
**Dependencies**: remember-core publish with new exports
**Status**: Not Started
**Design Reference**: [Ghost-Scoped REM Cycles](../../design/local.ghost-scoped-rem-cycles.md), [REM Background Relationships](../../design/local.rem-background-relationships.md)

---

## Objective

Wire the optional RemService dependencies that enable Phases 0, 4, 5, 6, and 7: `subLlm`, `emotionalScoringService`, `scoringContextService`, and `classificationService`. After this task, REM cycles will perform emotional scoring, abstraction, reconciliation, pruning, and classification in addition to the existing clustering/relationship CRUD.

---

## Context

The REM Cycle Handoff Report specifies 11 phases. Currently only Phases 1-3 are active because only required deps are wired. The new deps are all optional in RemServiceDeps — phases skip gracefully if deps aren't provided. All needed exports exist in remember-core source but require a published version.

---

## Steps

### 1. Update remember-core dependency

```bash
npm i @prmichaelsen/remember-core@latest
```

Verify the new exports are available:
- `createAnthropicSubLlm` from `@prmichaelsen/remember-core/services`
- `EmotionalScoringService` from `@prmichaelsen/remember-core/services`
- `ScoringContextService` from `@prmichaelsen/remember-core/services`
- `ClassificationService` from `@prmichaelsen/remember-core/services`

### 2. Update src/index.ts imports

Add imports for the 4 new services from `@prmichaelsen/remember-core/services`.

### 3. Create service instances in main()

```typescript
// Sub-LLM for phases 4, 5, 6, 7, 9, 10
const subLlm = createAnthropicSubLlm({ apiKey: config.anthropicConfig.apiKey });

// Phase 0: Emotional scoring
const emotionalScoringService = new EmotionalScoringService({ subLlm, logger });
const scoringContextService = new ScoringContextService({ logger });

// Phase 7: Classification
const classificationService = new ClassificationService();
```

### 4. Pass new deps to RemService constructor

```typescript
const remService = new RemService({
  weaviateClient,
  relationshipServiceFactory,
  stateStore,
  haikuClient,
  logger,
  config: { max_candidates_per_run: 5000 },
  // New deps
  subLlm,
  emotionalScoringService,
  scoringContextService,
  classificationService,
});
```

### 5. Verify build compiles

```bash
npm run typecheck
npm run build
```

### 6. Run existing tests

```bash
npm test
```

---

## Verification

- [ ] `npm i @prmichaelsen/remember-core@latest` installs version with new exports
- [ ] All 4 new imports resolve without errors
- [ ] `npm run typecheck` passes
- [ ] `npm run build` succeeds
- [ ] All existing tests pass
- [ ] RemService constructor accepts new deps without type errors

---

## Notes

- ANTHROPIC_API_KEY is already in GCP Secret Manager (`remember-anthropic-api-key`, `remember-e1-anthropic-api-key`)
- subLlm defaults to `claude-haiku-4-5-20251001` — no model ID config needed
- MoodService and ghostCompositeId are NOT wired in this task (see T15)
