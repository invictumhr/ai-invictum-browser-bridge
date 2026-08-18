# WordPress wp-admin tools

Invictum exposes typed helpers for the WordPress administration screens that
cause the most automation friction:

- bounded wp-admin screen, notice, and list-table inspection;
- exact row and bulk actions for posts, pages, media, comments, users, plugins,
  themes, and other standard or plugin-provided list tables;
- authoritative Gutenberg and Classic post-editor reads and writes;
- classic Appearance > Menus tree editing, documented separately in
  [WORDPRESS_MENUS.md](WORDPRESS_MENUS.md).

These helpers work in a background tab. Do not activate a WordPress tab merely
to inspect it, edit a draft, save, take a screenshot, or verify a notice.

## Tools

| Control action                        | MCP tool                               | Risk | Purpose                                                        |
| ------------------------------------- | -------------------------------------- | ---- | -------------------------------------------------------------- |
| `browser.get_wordpress_admin`         | `invictum_get_wordpress_admin`         | R0   | screen, notices, current list table and advertised action keys |
| `browser.wordpress_list_table_action` | `invictum_wordpress_list_table_action` | R2   | one exact row action or one exact bulk action                  |
| `browser.get_wordpress_editor`        | `invictum_get_wordpress_editor`        | R0   | authoritative Gutenberg/Classic editor model                   |
| `browser.edit_wordpress_editor`       | `invictum_edit_wordpress_editor`       | R2   | typed editor update and optional save                          |

All mutations require:

```json
{
  "source": "explicit_user_instruction",
  "instructionId": "stable-id-for-this-user-request"
}
```

Never recycle an authorization assertion for a different user request.

## First inspect the wp-admin screen

Call `get_wordpress_admin` after navigation and page stability:

```json
{
  "tabId": 123,
  "maxRows": 50,
  "maxCellText": 500
}
```

The result includes:

- page URL/origin plus the current `documentId` and `domRevision`;
- screen heading, query-derived page slug/post type/taxonomy, and detected
  editor kind;
- the admin-bar site name, when present;
- bounded success/info/warning/error notices;
- one current `.wp-list-table`, or `null`.

The list table contains bounded column metadata, stable row IDs, primary text,
status, selected state, bounded cell text, advertised row actions, and
advertised bulk actions. It deliberately omits action URLs and WordPress
nonces. A row ID is taken from the WordPress row ID, plugin identifier, checkbox
value, or a revision-bound fallback.

This one read is the preferred orientation step on:

- Posts, Pages, custom post types, and Media;
- Comments;
- Users;
- Plugins and network plugins;
- themes or plugin screens that use the standard WordPress list-table markup;
- taxonomy terms and other compatible admin tables.

If `truncated` is true, increase `maxRows` before planning a multi-row action.
Never infer missing rows.

## Row action

Use only a `rowId` and `actionKey` returned by the same fresh admin read:

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 17,
  "operation": "open_row_action",
  "rowId": "post-201",
  "actionKey": "edit",
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-edit-post-201"
  }
}
```

The extension re-resolves the exact row and action. It accepts only an HTTP(S)
row-action URL on the current wp-admin origin. It does not return or log the
URL/nonce. Missing rows/actions, stale revisions, JavaScript URLs, and
cross-origin actions fail closed.

All row actions are R2 because even an apparently harmless `edit`, `view`,
`activate`, or plugin-defined action can navigate or mutate server state.
Common destructive keys such as delete/trash/spam/remove are additionally
marked `destructive: true` in read and result metadata.

After the action, wait for URL/title/selector/text or DOM stability, then read
the new screen. `triggered: true` proves only that the correct WordPress path
was triggered; it never proves that WordPress accepted the operation.

## Bulk action

Select exact row IDs and an advertised bulk action:

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 21,
  "operation": "apply_bulk",
  "rowIds": ["post-201", "post-202"],
  "actionKey": "edit",
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-bulk-edit-posts"
  }
}
```

The adapter:

1. re-resolves every requested row;
2. clears unrelated row checkboxes and selects only the requested set;
3. resolves the exact option from WordPress's bulk-action selector;
4. dispatches normal input/change events;
5. submits through the real form `requestSubmit` path.

It never posts a reconstructed request or exposes a nonce. A missing row,
option, form, or safe submit path fails before submission. Verify the notice and
read the resulting table. Do not blindly retry a destructive bulk action after
a transport ambiguity.

## Read the authoritative post editor

Use `get_wordpress_editor` on a loaded post/page/custom-post editor:

```json
{
  "tabId": 123,
  "maxContentChars": 100000
}
```

For Gutenberg, the adapter reads `core/editor` in the page's MAIN world. For
the Classic editor, it reads the actual post form and TinyMCE-backed content.
The result can include:

- post ID/type, title, content, excerpt, slug, and status;
- category/tag IDs;
- featured-media, author, parent, and menu-order IDs;
- comment/ping status and a sanitized permalink;
- dirty/saving/last-save state;
- `contentTruncated`, `documentId`, and `domRevision`.

This is the correct fix for editor surfaces whose visible DOM is only a
projection. Do not replace Gutenberg block DOM, CodeMirror text, TinyMCE iframe
HTML, or a plugin preview and then assume WordPress will save it.

If content is truncated, repeat the read with a larger bound before replacing
the full body.

## Edit, review, and save

Typed fields are:

`title`, `content`, `excerpt`, `slug`, `status`, `categoryIds`, `tagIds`,
`featuredMediaId`, `authorId`, `parentId`, `menuOrder`, `commentStatus`, and
`pingStatus`.

Review-first example:

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 24,
  "fields": {
    "title": "Updated title",
    "content": "<!-- wp:paragraph --><p>Updated body.</p><!-- /wp:paragraph -->",
    "excerpt": "Updated summary.",
    "slug": "updated-title",
    "categoryIds": [4, 5],
    "tagIds": [8, 9],
    "status": "draft"
  },
  "save": false,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-update-post-301"
  }
}
```

Then call `get_wordpress_editor` again and verify the authoritative model. To
save the reviewed model without another content rewrite:

```json
{
  "tabId": 123,
  "documentId": "document-from-review-read",
  "domRevision": 25,
  "fields": {},
  "save": true,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-update-post-301"
  }
}
```

For Gutenberg, updates use `core/editor.editPost` and save uses
`core/editor.savePost`. For Classic, the adapter updates the actual form,
synchronizes TinyMCE when present, dispatches normal events, and uses the real
submit path.

Publishing is deliberately stricter: `status: "publish"` is rejected unless
the same explicitly authorized call has `save: true`. A response with
`saved: true` always has `verificationRequired: true`. Verify the WordPress
notice, URL, and a fresh editor read. Never treat dispatch success as persisted
success.

No-op editor fields are compared with the authoritative current value before
dispatch. Supplying the same title, content, status, or taxonomy selection
returns `changed: false` and must not create a dirty form or an unnecessary
`beforeunload` warning.

Classic editor tag IDs are intentionally rejected because the standard Classic
UI is name-based and cannot safely map arbitrary IDs without server context.
Use the normal semantic tag-name control when needed. Plugin-specific custom
fields remain normal snapshot/find/type/select/check/submit work unless a typed
adapter exists.

## CLI fallback

The dedicated MCP tools are preferred. Agents without MCP can use shorthands:

```powershell
pnpm browser wp-admin 123
pnpm browser wp-row 123 post-201 edit --instruction user-edit-post
pnpm browser wp-bulk 123 edit post-201 post-202 --instruction user-bulk-edit
pnpm browser wp-editor 123

@{
  title = "Updated title"
  content = "<!-- wp:paragraph --><p>Updated body.</p><!-- /wp:paragraph -->"
  status = "draft"
} | ConvertTo-Json -Compress | pnpm browser wp-edit 123 --stdin --instruction user-edit-post

pnpm browser wp-save 123 --instruction user-edit-post
```

Add `--save` to `wp-edit` only when the user asked to persist immediately. The
CLI automatically performs the fresh admin/editor read needed to bind the
mutation to the current revision. It does not auto-retry mutations.

## When to use generic tools

Typed WordPress tools do not replace the rest of the bridge:

- media upload: `browser.set_file_input_files`, then an explicitly authorized
  WordPress submit/select action and verification;
- settings/plugin forms: snapshot, find, type/select/check, then
  `browser.submit_form`;
- CodeMirror/WPCode/ACF/plugin editors: `browser.type_text` on the recognized
  model-backed editor, then submit and re-read;
- custom dropdowns: inspect listeners and use semantic click/type first;
- block Site Editor navigation: use normal semantic tools; the classic menu
  tree adapter does not claim support;
- custom DOM/CSS or raw JavaScript: only the documented typed R2/R3 fallback
  after the WordPress helpers and normal semantic actions cannot do the job.

Never use raw JavaScript to extract a WordPress nonce, construct a REST request,
or bypass WordPress capability checks.

## Unsaved changes blocking redirect or refresh

WordPress admin pages commonly install a dirty-form `beforeunload` guard. If
Chrome shows the localized equivalent of “Leave site?”, and the native
modal blocks subsequent snapshot, click, navigation, and refresh work.

Use `invictum_handle_beforeunload` against the already reserved tab:

```json
{
  "tabId": 123,
  "decision": "stay",
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-message-id"
  }
}
```

Use `stay` when saving has not been verified: it cancels navigation and keeps
the current edits. Then use the appropriate typed WordPress save action and
verify with a fresh read. Use `leave` only when the user instruction authorizes
continuing navigation even if edits are discarded. The CLI fallback is
`pnpm browser beforeunload <tabId> <leave|stay> --instruction <id>`.

## Audit and safety

- Admin/editor reads are R0; all list/editor mutations are R2.
- Audit records tab, document revision, operation/action key, row IDs/count,
  field names/count, save intent, publish intent, and authorization source.
- Audit omits notices, post titles/content/excerpts/slugs, cell values, action
  URLs/nonces, and returned editor model values.
- Every mutation is revision-bound and returns `requiresNewSnapshot: true`.
- Keep the tab in the background unless the user genuinely needs to see it.
- Always unlock in `finally`.

## Tests

The deterministic kitchen-sink real-Chrome gate covers:

- wp-admin heading, admin bar, notice, list-table columns/rows/actions;
- exact non-destructive row action and exact two-row bulk action;
- Gutenberg model read, multi-field draft update, review read, save-only call,
  and post-save verification;
- audit redaction and stale-revision failure paths in unit/integration tests;
- classic menu tree operations from [WORDPRESS_MENUS.md](WORDPRESS_MENUS.md).

After rebuilding, Reload the unpacked extension once and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```
