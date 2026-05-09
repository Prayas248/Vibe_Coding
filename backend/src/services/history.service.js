import { supabaseAdmin } from '../config/supabase.js';
import logger from '../config/logger.js';

const TABLE = 'analyses';

function summarize(result, fileName) {
  const features = result?.features || {};
  const readiness = result?.readinessScore || {};
  const topJournal = Array.isArray(result?.topJournals) ? result.topJournals[0] : null;
  const abstract = result?.features?.summary || '';

  return {
    file_name: fileName ?? null,
    domain: features.domain ?? null,
    abstract_preview: abstract ? abstract.slice(0, 280) : null,
    readiness_overall:
      typeof readiness.overall === 'number' ? readiness.overall : null,
    acceptance_level: readiness.acceptanceLevel ?? null,
    top_journal_name: topJournal?.name ?? null,
    keywords: Array.isArray(features.keywords)
      ? features.keywords.slice(0, 10)
      : null,
  };
}

export const HistoryService = {
  async save(userId, result, fileName) {
    if (!userId) throw new Error('userId required');
    const row = {
      user_id: userId,
      ...summarize(result, fileName),
      result,
    };
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .insert(row)
      .select('id, created_at')
      .single();
    if (error) {
      logger.error(`[HISTORY] insert failed: ${error.message}`);
      throw error;
    }
    return data;
  },

  async list(userId, { limit = 50 } = {}) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select(
        'id, file_name, domain, abstract_preview, readiness_overall, acceptance_level, top_journal_name, keywords, created_at'
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  },

  async get(userId, id) {
    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .select('id, file_name, result, created_at, user_id')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      throw error;
    }
    if (!data || data.user_id !== userId) return null;
    return data;
  },

  async remove(userId, id) {
    const { error, count } = await supabaseAdmin
      .from(TABLE)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;
    return count ?? 0;
  },
};
