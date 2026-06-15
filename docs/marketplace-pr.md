# Marketplace PR for telegram-voice-transcribe

This file holds the exact diff to add the new plugin to
`github.com/vellum-ai/vellum-assistant/blob/main/plugins/marketplace.json`.

## How to open the PR

```bash
# From your local clone of vellum-assistant (the OSS repo)
cd ~/vellum/vellum-assistant

# Create a branch
git checkout -b add-telegram-voice-transcribe

# Apply the diff under "Diff to apply" below
$EDITOR plugins/marketplace.json

# Commit + push + PR
git add plugins/marketplace.json
git commit -m "Add telegram-voice-transcribe plugin to the curated marketplace

Voice transcription for Telegram inbound messages at the user-prompt-submit
seam. Depends on bundled telegram-setup + transcribe. Same plugin author
(marinatrajk) as the existing skills they've shipped."
git push -u origin add-telegram-voice-transcribe

# Open the PR via gh CLI or the GitHub web UI
gh pr create --title "Add telegram-voice-transcribe plugin to marketplace" \
  --body "$(cat ../telegram-voice-transcribe/.github/MARKETPLACE_PR_BODY.md 2>/dev/null || true)" \
  --base main
```

## Diff to apply

Append this entry to the `plugins` array in
`plugins/marketplace.json` (right after the `level-up` entry):

```json
,
{
  "name": "telegram-voice-transcribe",
  "source": {
    "source": "github",
    "repo": "marinatrajk/telegram-voice-transcribe",
    "ref": "65504e13900117e070014b2917c7ae09dff80c61"
  },
  "description": "Transcribes Telegram voice notes and audio attachments into the conversation at the user-prompt-submit seam, so the model sees text instead of opaque audio.",
  "category": "channels",
  "homepage": "https://github.com/marinatrajk/telegram-voice-transcribe",
  "license": "MIT"
}
```

⚠️ **Update the `ref` SHA before opening the PR.** The SHA above
pinpoints commit `65504e1` (Restructure into plugin layout), which
matches the docs' requirement that `source.ref` be a full 40-character
commit SHA. If you land new commits before opening the PR, replace
the SHA with `git rev-parse HEAD` from your `main`.

## Validate locally before opening

The catalog loader validates entries at boot. After editing the JSON
file, run:

```bash
bun run marketplace:validate   # if a script exists in vellum-assistant
# or just:
node -e "console.log(JSON.parse(require('fs').readFileSync('plugins/marketplace.json','utf-8')).plugins.length, 'plugins')"
```

The latter should print `5 plugins` after the diff is applied.

## Maintainer checklist (Vellum team side)

Per `/docs/extensibility/distribution`:

- [ ] `source.ref` is a full commit SHA (40 or 64 hex chars), not a tag or branch
- [ ] `source.repo` is `owner/repo` of an external repo (`marinatrajk/telegram-voice-transcribe`)
- [ ] One kebab-case `name`, matching the directory slug in the repo
- [ ] `description` is short and surfaces what the plugin does
- [ ] `category` matches an existing grouping (`channels` is the natural home for this one)
- [ ] `license` is informational only

## Then back on Marina's side

After the PR merges and the catalog rebuilds, the plugin becomes
installable for any Vellum user via:

```bash
assistant plugins install telegram-voice-transcribe
```

Until then, Marina can drop the plugin at
`<workspace>/plugins/telegram-voice-transcribe/` (clone or symbolic
link) and restart the assistant daemon to test locally.
