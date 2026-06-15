# marinatrajk/telegram-voice-transcribe

Vellum community plugins by Marina. One repo, one skill per subdirectory.

## Layout

```
skills/
└── telegram-voice-transcribe/
    ├── SKILL.md              the manifest
    ├── README.md             the user-facing install note
    ├── install-meta.json     written by the installer on add
    └── references/           supporting docs (error states, tone rules)
```

## Skills in this repo

| Skill | Status | Install |
|-------|--------|---------|
| [telegram-voice-transcribe](./skills/telegram-voice-transcribe) | v1 (skill-mode MVP) | `assistant skills add marinatrajk/telegram-voice-transcribe/skills/telegram-voice-transcribe` |

## Conventions

- One skill per subfolder, named the same as the skill id in `SKILL.md`.
- `.gitignore` excludes `attachments/` — audio blobs are workspace-only, never committed.
- Skills depend on bundled Vellum skills (telegram-setup, transcribe) — list them in each SKILL.md.

## License

MIT.
