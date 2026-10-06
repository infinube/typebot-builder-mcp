# Results and conversation inspection

Typebot Builder MCP can inspect persisted Typebot results through the official Typebot
Builder API. These tools are read-only but can return customer identifiers, answers,
uploaded-file URLs, transcripts and diagnostic logs. Treat the output as potentially
sensitive or personally identifiable information (PII).

## Tools

- `get_results` — paginated result listing with Typebot's supported `timeFilter` and
  optional `timeZone`.
- `find_results` — bounded client-side search across paginated Typebot results by
  captured variable name/value and/or answer text.
- `get_result` — one structured result by `resultId`.
- `get_result_transcript` — ordered bot/user transcript for one result.
- `get_result_logs` — execution/integration logs for one result.

`get_stats` remains the analytics aggregate tool and requires a published Typebot.

## Identifying a person

Typebot does not provide one universal end-user identity field. Reliable person lookup
requires the bot to capture a stable identifier in a variable, for example:

- email;
- phone;
- customer_id;
- CRM/contact ID;
- Chatwoot contact ID.

Use `find_results` to locate candidate `resultId` values, then retrieve only the
specific result or transcript needed for the task.

Example search:

```json
{
  "typebotId": "bot-id",
  "variableName": "email",
  "variableValue": "alice@example.com",
  "timeFilter": "last30Days",
  "limit": 20
}
```

The search can also require `answerContains`. Criteria are combined: supplied variable
criteria must match a captured variable, and supplied answer text must match an answer.

## Bounded search

`find_results` intentionally does not perform an unlimited all-history crawl. Controls:

- `limit`: maximum matches returned, 1–100;
- `pageSize`: Typebot API page size, 1–500;
- `maxPages`: maximum API pages scanned, 1–20;
- `timeFilter`: today, last7Days, last30Days, monthToDate, lastMonth, yearToDate,
  or allTime;
- `timeZone`: optional timezone passed to Typebot.

The response reports `pagesScanned`, `exhausted`, and the last `nextCursor` when the
configured scan bound is reached before the Typebot result set is exhausted.

## Privacy and policy

Results and transcripts can contain PII and confidential conversation content even
though the MCP tools themselves are read-only. Deployments should apply identity/RBAC
and consider auditing access to these tools. Avoid broad `allTime` searches when a
narrower time range answers the question.

Execution logs may contain operational/integration details. Use `get_result_logs` only
for diagnostics, not as the default conversation-reading path.

The MCP never queries the Typebot database directly for these capabilities; it uses the
official Typebot API endpoints for results, individual results, transcripts and logs.
