import {
  FindNaturalLanguageDataSchema,
  GetPageTextDataSchema,
  type AgentElement,
  type FindNaturalLanguageData,
  type FindNaturalLanguageParameters,
  type GetPageTextData,
  type GetPageTextParameters,
  type PageSnapshot,
} from "@invictum/protocol";

type SnapshotReader = (parameters: {
  tabId: number;
  detail: "interactive" | "semantic";
  includeHidden: boolean;
  maxElements: number;
  maxDepth: number;
  maxTextLength: number;
  scope?: {
    documentId: string;
    domRevision: number;
    elementId: string;
  };
}) => Promise<PageSnapshot>;

const normalize = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "button",
  "control",
  "element",
  "field",
  "find",
  "for",
  "input",
  "link",
  "me",
  "the",
  "this",
  "to",
]);

const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  btn: ["button"],
  checkbox: ["check", "checkbox"],
  dropdown: ["combobox", "select"],
  edit: ["change", "modify", "update"],
  login: ["log in", "sign in", "signin"],
  logout: ["log out", "sign out", "signout"],
  save: ["apply", "publish", "submit", "update"],
  search: ["find", "lookup"],
  textbox: ["input", "textarea"],
};

const queryTerms = (query: string): string[] => {
  const normalized = normalize(query);
  const initial = normalized.split(" ").filter((term) => term.length > 0 && !STOP_WORDS.has(term));
  const expanded = new Set(initial.length > 0 ? initial : normalized.split(" ").filter(Boolean));
  for (const term of [...expanded]) {
    for (const synonym of SYNONYMS[term] ?? []) {
      for (const part of normalize(synonym).split(" ").filter(Boolean)) expanded.add(part);
    }
  }
  return [...expanded].slice(0, 64);
};

const scoreElement = (
  element: AgentElement,
  query: string,
  terms: readonly string[],
): { score: number; matchedTerms: string[]; reasons: string[] } | undefined => {
  const name = normalize(element.name);
  const role = normalize(element.role);
  const text = normalize(element.text ?? "");
  const tag = normalize(element.tag);
  const selector = normalize(
    [element.selectors.css ?? "", element.selectors.aria ?? ""].filter(Boolean).join(" "),
  );
  const exactQuery = normalize(query);
  const matchedTerms = terms.filter((term) =>
    [name, role, text, tag, selector].some((candidate) => candidate.includes(term)),
  );
  if (matchedTerms.length === 0) return undefined;

  const reasons = new Set<string>();
  let score = matchedTerms.length * 80;
  if (name === exactQuery && name.length > 0) {
    score += 500;
    reasons.add("exact_name");
  } else if (terms.some((term) => name.includes(term))) {
    score += 220;
    reasons.add("name");
  }
  if (terms.some((term) => role.includes(term))) {
    score += 150;
    reasons.add("role");
  }
  if (terms.some((term) => text.includes(term))) {
    score += 100;
    reasons.add("text");
  }
  if (terms.some((term) => tag.includes(term))) {
    score += 60;
    reasons.add("tag");
  }
  if (terms.some((term) => selector.includes(term))) {
    score += 40;
    reasons.add("selector");
  }
  if (element.clickable === true || element.editable === true) {
    score += 25;
    reasons.add("state");
  }
  return {
    score: Math.min(1_000, score),
    matchedTerms,
    reasons: [...reasons],
  };
};

export class ChromePageToolsAdapter {
  public constructor(private readonly readSnapshot: SnapshotReader) {}

  public async getPageText(parameters: GetPageTextParameters): Promise<GetPageTextData> {
    const snapshot = await this.readSnapshot({
      tabId: parameters.tabId,
      detail: "semantic",
      includeHidden: false,
      maxElements: 5_000,
      maxDepth: 64,
      maxTextLength: parameters.maxChars,
      ...(parameters.scope === undefined ? {} : { scope: parameters.scope }),
    });
    const blocks = snapshot.textBlocks
      .map((block) => {
        const text = block.text.trim();
        if (parameters.format !== "markdown" || text.length === 0) return text;
        if (block.kind === "heading") return `${"#".repeat(block.level ?? 2)} ${text}`;
        if (block.kind === "label") return `**${text}**`;
        if (block.kind === "navigation") return `- ${text}`;
        return text;
      })
      .filter(Boolean);
    let text = "";
    let includedBlocks = 0;
    let truncated = snapshot.metadata.truncated;
    for (const block of blocks) {
      const next = text.length === 0 ? block : `${text}\n\n${block}`;
      if (next.length > parameters.maxChars) {
        const separator = text.length === 0 ? "" : "\n\n";
        const remaining = Math.max(0, parameters.maxChars - text.length - separator.length);
        text = `${text}${separator}${block.slice(0, remaining)}`;
        truncated = true;
        break;
      }
      text = next;
      includedBlocks += 1;
    }
    return GetPageTextDataSchema.parse({
      page: {
        url: snapshot.page.url,
        title: snapshot.page.title,
        origin: snapshot.page.origin,
      },
      documentId: snapshot.metadata.documentId,
      domRevision: snapshot.metadata.domRevision,
      format: parameters.format,
      text,
      characterCount: text.length,
      blockCount: includedBlocks,
      truncated,
      ...(parameters.scope === undefined ? {} : { scopeElementId: parameters.scope.elementId }),
    });
  }

  public async findNaturalLanguage(
    parameters: FindNaturalLanguageParameters,
  ): Promise<FindNaturalLanguageData> {
    const snapshot = await this.readSnapshot({
      tabId: parameters.tabId,
      detail: "interactive",
      includeHidden: parameters.includeHidden,
      maxElements: 5_000,
      maxDepth: 64,
      maxTextLength: 50_000,
    });
    const terms = queryTerms(parameters.query);
    const allMatches = snapshot.elements
      .filter((element) => parameters.includeHidden || element.visible !== false)
      .map((element) => {
        const match = scoreElement(element, parameters.query, terms);
        return match === undefined ? undefined : { element, ...match };
      })
      .filter((match): match is NonNullable<typeof match> => match !== undefined)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.element.name.localeCompare(right.element.name) ||
          left.element.elementId.localeCompare(right.element.elementId),
      );
    const matches = allMatches.slice(0, parameters.maxResults);
    return FindNaturalLanguageDataSchema.parse({
      page: { url: snapshot.page.url, origin: snapshot.page.origin },
      documentId: snapshot.metadata.documentId,
      domRevision: snapshot.metadata.domRevision,
      query: parameters.query,
      matches,
      count: matches.length,
      truncated: allMatches.length > matches.length || snapshot.metadata.truncated,
    });
  }
}
