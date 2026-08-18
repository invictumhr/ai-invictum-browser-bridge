# WordPress classic menu editing

Invictum has a typed editor for the classic WordPress **Appearance > Menus**
screen (`wp-admin/nav-menus.php`). It reads and edits the actual form model, so
an agent does not need coordinate dragging, generic DOM mutation, or raw
JavaScript.

For posts/pages, Gutenberg/Classic editing, and generic wp-admin list tables
(plugins, comments, users, media, and custom post types), also read
[WORDPRESS_ADMIN.md](WORDPRESS_ADMIN.md).

This contract covers the classic menu editor with `form#update-nav-menu` and
`#menu-to-edit`. It does not pretend to support the block-based Site Editor
Navigation block; use the normal semantic workflow there until a dedicated
typed adapter exists.

## Tools

- `browser.get_wordpress_menu` / `invictum_get_wordpress_menu` — R0 bounded read.
- `browser.edit_wordpress_menu` / `invictum_edit_wordpress_menu` — R2 typed
  mutation and optional save.

Both work in a background tab. Do not set `active: true` merely to operate the
menu.

The edit action:

- updates navigation labels, custom URLs, title attributes, CSS classes,
  descriptions, and “open in new tab”;
- adds custom links;
- removes one item while promoting its direct children, or removes a complete
  subtree;
- moves an item together with its entire subtree;
- rewrites WordPress parent and position inputs; public results use zero-based
  positions, while submitted `menu-item-position` values are deliberately
  one-based because WordPress interprets zero as unspecified/append;
- uses the form's real `requestSubmit` path when `save: true`;
- never uses drag coordinates or agent-supplied JavaScript.

## Required workflow

1. Open or select the exact WordPress menu URL and wait for
   `form#update-nav-menu`.
2. Call `get_wordpress_menu`. Confirm `menuId` and `menuName`; do not assume
   that the URL's `menu` query parameter is the selected form.
3. Build operations using the returned numeric string `itemId` values.
4. For a review-first workflow, call `edit_wordpress_menu` with `save: false`,
   inspect the returned tree or take a screenshot, then call it again with
   `operations: []` and `save: true`.
5. If the user already explicitly asked to make and save the change, one batch
   with `save: true` is preferred.
6. After `submitted: true`, wait for navigation or WordPress's success notice,
   call `get_wordpress_menu` again, and verify the persisted tree.
7. Unlock the tab in `finally`.

Every edit/save call needs the current `documentId`, `domRevision`, and:

```json
{
  "source": "explicit_user_instruction",
  "instructionId": "stable-id-for-the-current-user-request"
}
```

Do not reuse an old authorization assertion for a new user request.

## Read example

```json
{
  "tabId": 123,
  "maxItems": 250
}
```

The result contains a flat preorder tree:

```json
{
  "menuId": "151",
  "menuName": "Primary",
  "documentId": "document-...",
  "domRevision": 8,
  "items": [
    {
      "itemId": "101",
      "parentItemId": null,
      "depth": 0,
      "position": 0,
      "label": "Home",
      "type": "custom",
      "object": "custom",
      "url": "https://example.test/",
      "openInNewTab": false,
      "childCount": 1
    }
  ],
  "itemCount": 1,
  "truncated": false,
  "dirty": false
}
```

If `truncated` is true, increase `maxItems` before planning a structural edit.
Never reorganize a tree that was only partially read.

## Operation examples

Update:

```json
{
  "type": "update",
  "itemId": "101",
  "label": "Naslovnica",
  "url": "/",
  "titleAttribute": "",
  "cssClasses": "menu-home",
  "description": "",
  "openInNewTab": false
}
```

Only supplied fields change. At least one update field is required.
WordPress exposes URL editing only for custom-link items; attempting to replace
the URL of a page, post, taxonomy, or other object-backed item fails closed.

Add a custom link after an existing item:

```json
{
  "type": "add_custom",
  "label": "Kontakt",
  "url": "/kontakt/",
  "destination": {
    "placement": "after",
    "targetItemId": "101"
  }
}
```

Move an item and all descendants under another item:

```json
{
  "type": "move",
  "itemId": "205",
  "destination": {
    "placement": "inside_end",
    "targetItemId": "101"
  }
}
```

Remove only the item and promote its direct children into its former position:

```json
{
  "type": "remove",
  "itemId": "205",
  "includeChildren": false
}
```

Remove the complete subtree:

```json
{
  "type": "remove",
  "itemId": "205",
  "includeChildren": true
}
```

## Destinations

| Placement      | Meaning                                   |
| -------------- | ----------------------------------------- |
| `root_start`   | first top-level item                      |
| `root_end`     | last top-level item                       |
| `before`       | sibling immediately before `targetItemId` |
| `after`        | sibling immediately after `targetItemId`  |
| `inside_start` | first child of `targetItemId`             |
| `inside_end`   | last child of `targetItemId`              |

`before` and `after` inherit the target's parent. `inside_*` creates a child.
Moving a parent always preserves and moves its complete subtree. Moving into
itself or one of its descendants is rejected.

## Batched edit and save

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 8,
  "operations": [
    {
      "type": "update",
      "itemId": "101",
      "label": "Naslovnica"
    },
    {
      "type": "add_custom",
      "label": "Kontakt",
      "url": "/kontakt/",
      "destination": {
        "placement": "after",
        "targetItemId": "101"
      }
    },
    {
      "type": "move",
      "itemId": "205",
      "destination": {
        "placement": "inside_end",
        "targetItemId": "101"
      }
    }
  ],
  "save": true,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-menu-change-2026-07-23"
  }
}
```

The entire batch is validated against an in-memory tree before the DOM form is
changed. A missing item, invalid destination, cycle, or unsafe URL fails the
batch. Credential-bearing URLs and non-HTTP(S) schemes are rejected; relative
URLs and fragments are allowed.

The response includes `operationTypes`, `affectedItemIds`, the resulting tree,
`changed`, and `submitted`. `submitted: true` always means
`verificationRequired: true`; it does not prove that WordPress accepted the
save.

## Review first, save second

First call with the desired operations and `save: false`. The returned
`domRevisionAfter` is the revision for the save-only call:

```json
{
  "tabId": 123,
  "documentId": "document-...",
  "domRevision": 9,
  "operations": [],
  "save": true,
  "authorization": {
    "source": "explicit_user_instruction",
    "instructionId": "user-menu-change-2026-07-23"
  }
}
```

An empty operation list is valid only when `save` is true.

## Safety and verification

- `get_wordpress_menu` is R0. `edit_wordpress_menu` is always R2, including a
  non-saving preview, because it changes the live page form.
- Labels and URLs are omitted from audit parameters. Audit records operation
  types/count, referenced item IDs, save intent, tab, revision, and
  authorization source.
- Never save when `menuId` or `menuName` differs from the intended menu.
- Never remove an item until `includeChildren` semantics are deliberate.
- Do not repeat a save automatically after transport ambiguity. Inspect the
  WordPress notice and reload/read the tree first.
- `STALE_ELEMENT_REFERENCE` means fetch the menu again and rebuild the plan
  from current IDs. Do not patch an outdated tree with coordinates.
- `ELEMENT_NOT_INTERACTABLE` usually means the page is not the classic editor,
  the form has not finished loading, or a plugin/theme changed its required
  structure.

## Tests

The deterministic kitchen-sink fixture contains a WordPress-compatible menu
form. Its real-Chrome gate proves:

- bounded read and parent/depth reconstruction;
- update, add, remove-with-promotion, and complete-subtree move in one batch;
- synchronized `menu-item-parent-id` and position fields;
- real `requestSubmit`;
- one-based submitted positions that preserve an unrelated first item after
  WordPress reload;
- post-submit tree verification.

The 2026-07-24 real-Chrome regression run specifically verified the production
bug shape: after moving a complete subtree below **Info**, submitted
`menu-item-position` values were `1` through `5`, the unrelated first item
remained first, the moved parent retained its child, and the fixture accepted
the synchronized tree.

After rebuilding the extension, Reload it once and run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify-after-reload.ps1
```
