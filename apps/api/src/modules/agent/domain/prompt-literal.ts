/** Render an untrusted value as a JSON string literal so embedded newlines or
 * control text cannot break the surrounding prompt structure. */
export const toPromptLiteral = (value: string): string => JSON.stringify(value);
