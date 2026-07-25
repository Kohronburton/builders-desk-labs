import type { RetrievalResult, SourceRecord } from "./types";

const tokenize = (value: string) =>
  new Set(value.toLowerCase().replace(/[^a-z0-9-\s]/g, "").split(/\s+/).filter(Boolean));

export function retrieve(query: string, records: SourceRecord[], limit = 3): RetrievalResult[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.size) return [];

  return records
    .filter((record) => record.state !== "blocked")
    .map((record) => {
      const corpus = tokenize([record.title, record.summary, ...record.tags].join(" "));
      const overlap = [...queryTokens].filter((token) => corpus.has(token)).length;
      const partial = [...queryTokens].filter((token) =>
        [...corpus].some((word) => word.includes(token) || token.includes(word)),
      ).length;
      const raw = (overlap * 1.5 + partial * 0.35) / Math.max(queryTokens.size, 1);
      return {
        sourceId: record.id,
        title: record.title,
        excerpt: record.summary,
        score: Math.min(0.99, 0.58 + raw * 0.18),
      };
    })
    .filter((result) => result.score > 0.6)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function groundedAnswer(query: string, results: RetrievalResult[]): string {
  if (!results.length) {
    return `I could not find enough verified workspace evidence for “${query}.” Add a source or broaden the request.`;
  }

  const facts = results.map((result) => result.excerpt.replace(/\.$/, "")).join("; ");
  return `${facts}. This response is grounded in ${results.length} source${results.length === 1 ? "" : "s"} and does not replace the original records.`;
}
