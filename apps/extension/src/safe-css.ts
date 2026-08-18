const UNSAFE_CSS_CONSTRUCT =
  /(?:@import\b|\burl\s*\(|\bimage\s*\(|(?:-webkit-)?image-set\s*\(|\battr\s*\(|\[\s*value\b|(?:-[a-z]+-)?text-security\s*:|expression\s*\(|behavior\s*:|-moz-binding\b)/iu;

export const containsUnsafeCss = (css: string): boolean =>
  css.includes("\\") || css.includes("/*") || UNSAFE_CSS_CONSTRUCT.test(css);
