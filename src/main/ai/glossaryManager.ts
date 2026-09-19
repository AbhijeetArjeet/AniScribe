import { IDatabase } from '../storage/database';

export interface GlossaryTerm {
  id: string;
  titleId: string;
  sourceTerm: string;
  targetTerm: string;
  category: 'character' | 'term' | 'honorific' | 'custom';
  createdAt: number;
}

export class GlossaryManager {
  constructor(private db: IDatabase) {}

  public getTerms(titleId: string): GlossaryTerm[] {
    const rows = this.db.prepare(`
      SELECT id, title_id, source_term, target_term, category, created_at
      FROM title_glossaries
      WHERE title_id = ?
      ORDER BY created_at ASC
    `).all(titleId) as Array<{
      id: string;
      title_id: string;
      source_term: string;
      target_term: string;
      category: string;
      created_at: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      titleId: r.title_id,
      sourceTerm: r.source_term,
      targetTerm: r.target_term,
      category: r.category as GlossaryTerm['category'],
      createdAt: r.created_at,
    }));
  }

  public addTerm(titleId: string, sourceTerm: string, targetTerm: string, category: GlossaryTerm['category'] = 'term'): GlossaryTerm {
    const id = `glossary-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    this.db.prepare(`
      INSERT INTO title_glossaries (id, title_id, source_term, target_term, category, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, titleId, sourceTerm.trim(), targetTerm.trim(), category, now);

    return {
      id,
      titleId,
      sourceTerm: sourceTerm.trim(),
      targetTerm: targetTerm.trim(),
      category,
      createdAt: now,
    };
  }

  public deleteTerm(id: string): boolean {
    const info = this.db.prepare(`DELETE FROM title_glossaries WHERE id = ?`).run(id);
    return info.changes > 0;
  }

  /**
   * Applies glossary substitutions to translated text or source text
   */
  public applyGlossary(text: string, titleId: string): string {
    const terms = this.getTerms(titleId);
    if (terms.length === 0) return text;

    let result = text;
    for (const term of terms) {
      if (!term.sourceTerm || !term.targetTerm) continue;
      // Replace case-insensitively or exact match
      const escaped = term.sourceTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      result = result.replace(regex, term.targetTerm);
    }
    return result;
  }
}
