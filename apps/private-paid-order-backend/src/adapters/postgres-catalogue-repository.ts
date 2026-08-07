import type { Pool } from "pg";
import type { CatalogueItem, CatalogueKind, CatalogueRepository } from "../catalogue/service.js";

export class PostgresCatalogueRepository implements CatalogueRepository {
  constructor(private readonly pool: Pool) {}

  async findActive(kind: CatalogueKind, code: string): Promise<CatalogueItem | null> {
    const result = await this.pool.query<{
      kind: CatalogueKind;
      code: string;
      label: string;
      public_metadata: unknown;
    }>(
      `SELECT kind,code,label,public_metadata
       FROM app.catalogue_items
       WHERE kind=$1 AND code=$2 AND active=true
       ORDER BY version DESC
       LIMIT 1`,
      [kind, code]
    );
    const row = result.rows[0];
    return row ? { kind: row.kind, code: row.code, label: row.label, publicMetadata: row.public_metadata } : null;
  }

  async readiness(): Promise<{ ok: boolean; detail?: string }> {
    const result = await this.pool.query<{
      kind: CatalogueKind;
      active_count: string;
      placeholder_count: string;
    }>(
      `SELECT kind,
              count(*) FILTER (WHERE active)::text AS active_count,
              count(*) FILTER (WHERE active AND COALESCE((public_metadata->>'placeholder')::boolean,false))::text AS placeholder_count
       FROM app.catalogue_items
       GROUP BY kind`
    );
    const expected: CatalogueKind[] = ["package", "template", "style", "voice", "product_branch"];
    const byKind = new Map(result.rows.map((row) => [row.kind, row]));
    for (const kind of expected) {
      const row = byKind.get(kind);
      if (!row || Number(row.active_count) < 1) return { ok: false, detail: `no active ${kind} catalogue records` };
      if (Number(row.placeholder_count) > 0) return { ok: false, detail: `active ${kind} catalogue contains placeholder records` };
    }
    return { ok: true };
  }
}
