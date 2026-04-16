
## GramPro v5.0.5 [Date: 14-APR-2026]

This release finalizes the GramPro user-account trigger and aligns media handling across the node.

- New `Telegram GramPro Trigger` for Telegram user accounts using a persistent MTProto listener
- Published workflow support for `Message` and `Edited Message` trigger events
- `Listening Mode` multi-select with `Incoming Messages` and `Outgoing Messages`
- Trigger filters: `All Messages`, `Only User Messages`, `Only Channel Messages`, `Only Group Messages`, `Selected Chats Only`, `Except Selected Chats Only`
- Selected/excluded chat matching by username, title, sender name, sender ID, chat ID, and equivalent numeric aliases
- Auto binary download in trigger output for `photo`, `video`, and `document`
- Improved trigger cleanup and shared client reuse to prevent stale MTProto timeout logs
- `Media Type` support aligned to `text`, `photo`, `video`, `document`, `other`
- `Send Message` now treats `mediaType = text` as plain text without requiring binary data
- `Get Chat History` can filter by the same trigger-compatible message/media types

## Trigger Improvements

Telegram GramPro now provides one MTProto trigger node:

- `Telegram GramPro Trigger` (`telegramGramProTrigger`)

Unlike the official n8n Telegram bot trigger, Telegram user accounts cannot register Bot API webhooks. GramPro keeps a live MTProto session connected while the workflow is active.

Supported updates:

- `Message`
- `Edited Message`

Listening mode:
- `Incoming Messages`
- `Outgoing Messages`
- Selecting both listens to both directions

Trigger filters:
- `All Messages`
- `Only User Messages`
- `Only Channel Messages`
- `Only Group Messages`
- `Selected Chats Only`
- `Except Selected Chats Only`

Filter behavior:
- `All Messages` is the default catch-all mode
- `Only Channel Messages` matches broadcast channels only
- `Only Group Messages` matches classic groups plus supergroups/gigagroups
- `Selected Chats Only` matches chat or sender identifiers from a JSON array or comma-separated list
- `Except Selected Chats Only` excludes matching chats or senders after the main include filter is applied
- Numeric IDs are matched across equivalent forms such as `519...`, `-519...`, and `-100519...`
- `Selected Chats Only` and the per-type include toggles are mutually exclusive in the UI to avoid hidden-value overwrite issues

Trigger output is readable-only (`raw` removed) and includes:
- `updateType`, `message`, `date` (ISO UTC), `editDate`, `chatName`, `chatId`, `chatType`, `senderName`, `senderId`, `senderIsBot`, `messageId`
- `isPrivate`, `isGroup`, `isChannel`, `isOutgoing`, `messageType` (`text`, `photo`, `video`, `document`, `other`)

Binary output behavior:
- For `photo`, `video`, and `document`, media is attached in `binary.data`
- If media download fails, JSON is still emitted with `mediaDownloadError`

---