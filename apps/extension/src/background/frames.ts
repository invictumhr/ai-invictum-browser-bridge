/**
 * Tab-scoped commands must be answered by the page the agent is targeting.
 *
 * `chrome.tabs.sendMessage` without a frame delivers to every frame that has a
 * listener and resolves with whichever one replies first. A small helper iframe
 * therefore wins the race against the real page and returns its own, usually
 * empty, document. Element references also live in the top frame's content
 * script, which walks same-origin child frames itself, so the top frame is the
 * only correct recipient.
 */
export const TOP_FRAME_ID = 0;
