export type ActionRiskLevel = "diagnostic" | "R0" | "R1" | "R2" | "R3";

export interface ActionMetadata {
  readonly riskLevel: ActionRiskLevel;
  readonly targeted: boolean;
  readonly readOnly: boolean;
  readonly destructive: boolean;
  readonly idempotent: boolean;
  readonly requiresAuthorization: boolean;
}

const metadata = (
  riskLevel: ActionRiskLevel,
  targeted: boolean,
  options: Partial<Omit<ActionMetadata, "riskLevel" | "targeted">> = {},
): ActionMetadata => ({
  riskLevel,
  targeted,
  readOnly: options.readOnly ?? false,
  destructive: options.destructive ?? false,
  idempotent: options.idempotent ?? false,
  requiresAuthorization:
    options.requiresAuthorization ?? (riskLevel === "R2" || riskLevel === "R3"),
});

/**
 * Authoritative cross-surface behavior for every extension action.
 *
 * Runtime descriptions remain in the capabilities manifest. This registry
 * captures properties consumed by policy preflight, MCP annotations, retries,
 * and idempotency.
 */
export const ACTION_METADATA = {
  "system.ping": metadata("diagnostic", false, { readOnly: true, idempotent: true }),
  "system.capabilities": metadata("diagnostic", false, { readOnly: true, idempotent: true }),
  "browser.list_tabs": metadata("R0", false, { readOnly: true, idempotent: true }),
  "browser.open_tab": metadata("R1", false),
  "browser.close_tab": metadata("R2", true, { destructive: true }),
  "browser.navigate": metadata("R1", true),
  "browser.go_back": metadata("R1", true),
  "browser.go_forward": metadata("R1", true),
  "browser.activate_tab": metadata("R1", true),
  "browser.wait_for": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.set_control_identity": metadata("R0", true, { idempotent: true }),
  "browser.get_page_snapshot": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.get_page_text": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.find_elements": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.find_natural_language": metadata("R0", true, {
    readOnly: true,
    idempotent: true,
  }),
  "browser.click": metadata("R1", true),
  "browser.type_text": metadata("R1", true),
  "browser.set_file_input_files": metadata("R2", true),
  "browser.select_option": metadata("R1", true),
  "browser.check": metadata("R1", true, { idempotent: true }),
  "browser.uncheck": metadata("R1", true, { idempotent: true }),
  "browser.submit_form": metadata("R2", true, { destructive: true }),
  "browser.get_figma_document": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.get_figma_layers": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.get_figma_properties": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.figma_select": metadata("R1", true),
  "browser.figma_healthcheck": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.get_wordpress_menu": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.edit_wordpress_menu": metadata("R2", true, { destructive: true }),
  "browser.get_wordpress_admin": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.wordpress_list_table_action": metadata("R2", true, { destructive: true }),
  "browser.get_wordpress_editor": metadata("R0", true, {
    readOnly: true,
    idempotent: true,
  }),
  "browser.edit_wordpress_editor": metadata("R2", true, { destructive: true }),
  "browser.evaluate": metadata("R2", true),
  "browser.mutate_dom": metadata("R2", true),
  "browser.inspect_element": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.manage_css": metadata("R2", true),
  // These broad tools include start/clear/stop modes which change debugger or
  // capture state, so they are deliberately not advertised as read-only.
  "browser.observe_events": metadata("R0", true),
  "browser.execute_javascript": metadata("R3", true, { destructive: true }),
  "browser.console": metadata("R0", true),
  "browser.network": metadata("R0", true),
  "browser.emulate_device": metadata("R1", true),
  "browser.screenshot": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.click_at": metadata("R1", true),
  "browser.perform_gesture": metadata("R1", true),
  "browser.get_terminals": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.read_terminal": metadata("R2", true, {
    readOnly: true,
    idempotent: true,
  }),
  "browser.terminal_input": metadata("R3", true, { destructive: true }),
  "browser.print_to_pdf": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.page_api_request": metadata("R3", true, { destructive: true }),
  "browser.unlock_tab": metadata("R0", true, { idempotent: true }),
  "browser.get_http_auth_state": metadata("R0", true, { readOnly: true, idempotent: true }),
  "browser.authenticate_http": metadata("R2", true),
  "browser.handle_javascript_dialog": metadata("R2", true, { destructive: true }),
} as const satisfies Readonly<Record<string, ActionMetadata>>;

export type KnownBrowserAction = keyof typeof ACTION_METADATA;

export const getActionMetadata = (action: string): ActionMetadata | undefined =>
  (ACTION_METADATA as Readonly<Record<string, ActionMetadata>>)[action];
