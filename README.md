# remember-rem

Background Cloud Run service that automatically discovers and creates relationships between memories using embedding similarity and LLM validation.

> Built with [Agent Context Protocol](https://github.com/prmichaelsen/agent-context-protocol)

## Overview

REM (Relationship Engine for Memories) runs hourly via GCP Cloud Scheduler, processing one memory collection per invocation. It finds clusters of semantically similar memories, validates them with Haiku, and creates N-ary relationships in Weaviate via remember-core.

## How It Works

1. Cloud Scheduler triggers REM every hour
2. REM picks the next collection (startAfter cursor)
3. Selects candidate memories (1/3 newest, 1/3 unprocessed, 1/3 random)
4. Finds similar memories via Weaviate vector search (cosine >= 0.75)
5. Deduplicates against existing relationships (60% overlap = merge)
6. Validates clusters and generates names with Haiku
7. Creates/updates/splits relationships via remember-core

## Development

This project uses the Agent Context Protocol for development:

- `@acp.init` - Initialize agent context
- `@acp.plan` - Plan milestones and tasks
- `@acp.proceed` - Continue with next task
- `@acp.status` - Check project status

See [AGENT.md](./AGENT.md) for complete ACP documentation.

## Project Structure

```
remember-rem/
├── AGENT.md              # ACP methodology
├── agent/                # ACP directory
│   ├── design/          # Design documents
│   ├── milestones/      # Project milestones
│   ├── tasks/           # Task breakdown
│   ├── patterns/        # Architectural patterns
│   └── progress.yaml    # Progress tracking
└── src/                 # Source code
```

## Getting Started

1. Initialize context: `@acp.init`
2. Plan your project: `@acp.plan`
3. Start building: `@acp.proceed`

## License

MIT
