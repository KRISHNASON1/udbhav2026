import { ScheduleConfig } from '../models/ScheduleConfig.js';
import { connectDB } from '../lib/mongodb.js';

function requireAdmin(req, res) {
  const secret = req.headers['x-admin-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!secret || secret !== process.env.ADMIN_SECRET) {
    res.status(401).json({ success: false, error: 'unauthorized' });
    return false;
  }
  return true;
}

export async function getScheduleHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    await connectDB();
    let config = await ScheduleConfig.findOne({ _id: 'singleton' });
    if (!config) {
      config = await ScheduleConfig.create({ _id: 'singleton' });
    }
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateScheduleHandler(req, res) {
  if (!requireAdmin(req, res)) return;
  try {
    const { links, timelineStages, targetDate } = req.body;
    await connectDB();
    const config = await ScheduleConfig.findOneAndUpdate(
      { _id: 'singleton' },
      { links, timelineStages, targetDate },
      { upsert: true, new: true }
    );
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
