import { HistoryService } from '../services/history.service.js';

export async function listHistory(req, res, next) {
  try {
    const items = await HistoryService.list(req.user.id);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function getHistoryItem(req, res, next) {
  try {
    const item = await HistoryService.get(req.user.id, req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
}

export async function deleteHistoryItem(req, res, next) {
  try {
    const removed = await HistoryService.remove(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
