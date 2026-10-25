The `opus`, `sonnet`, and `haiku` aliases resolve to the newest version on the Anthropic API and to an earlier version on some other providers:

| Provider | `opus` | `sonnet` | `haiku` |
| :- | :- | :- | :- |
| Anthropic API | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |
| [Claude Platform on AWS](https://code.claude.com/docs/en/claude-platform-on-aws.md) | Opus 5.5 | Sonnet 4.6 | Haiku 4.5 |
| Amazon Bedrock, Google Cloud's Agent Platform | Opus 5.5 | Sonnet 4.5 | Haiku 4.5 |
| Microsoft Foundry | Opus 4.6 | Sonnet 4.5 | Haiku 4.5 |


Unless you set `ANTHROPIC_DEFAULT_FABLE_MODEL`, the `fable` alias resolves to Fable 5.1, except in [Claude apps gateway](https://code.claude.com/docs/en/claude-apps-gateway) sessions, where `fable` and `best` resolve to Fable 5.

> Sonnet 5.5 requires Claude Code v2.1.284 or later, and Opus 5.5 requires v2.1.280 or later. If a request for one of them from an older version fails, see [Claude Code does not support this model](https://code.claude.com/docs/en/errors.md#claude-code-does-not-support-this-model). Use v2.1.293 or later with Haiku 5.5. Run `claude update` to upgrade.

> Fable 5.1 requires Claude Code v2.1.257 or later. If a request for it from an older version fails, see [Claude Code does not support this model](https://code.claude.com/docs/en/errors.md#claude-code-does-not-support-this-model). Run `claude update` to upgrade. For availability under zero data retention, see [Model availability under ZDR](https://code.claude.com/docs/en/zero-data-retention.md#model-availability-under-zdr).

The available effort levels depend on the model. Models not listed here do not support effort:

| Model | Levels |
| :- | :- |
| Fable 5.1 and Fable 5 | `low`, `medium`, `high`, `xhigh`, `max` |
| Opus 5.5, Sonnet 5.5, Haiku 5.5, Opus 5, Sonnet 5, Opus 4.8, and Opus 4.7 | `low`, `medium`, `high`, `xhigh`, `max` |
| Opus 4.6 and Sonnet 4.6 | `low`, `medium`, `high`, `max` |

If you set a level the active model does not support, Claude Code falls back to the highest supported level at or below the one you set. For example, `xhigh` runs as `high` on Opus 4.6. Your organization or your own settings can also cap the levels a model offers; see [Organization effort limits](#organization-effort-limits).

Claude Code resolves the session's effort level in this order, taking the first that applies:

1. An explicit choice: the [`CLAUDE_CODE_EFFORT_LEVEL`](https://code.claude.com/docs/en/env-vars#variables) environment variable, launching with `--effort`, or `/effort` in the session ([a non-interactive `/effort` has narrower effect](#non-interactive-effort))
2. Your settings: the level you saved for the model or an [`effortLevel`](https://code.claude.com/docs/en/settings-reference#effortlevel) key, with the precedence between them and across settings files stated at [`modelSettings`](https://code.claude.com/docs/en/settings-reference#modelsettings)
3. The model's default effort: `high` on every model that supports effort, except that Opus 5.5, Sonnet 5.5, and Haiku 5.5 default to `medium`, Opus 4.7 defaults to `xhigh`, and, when your organization sets a default effort level for its [organization default model](#organization-default-model), that level is the default when you run that model
