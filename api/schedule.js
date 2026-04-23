import { ScheduleConfig } from './models/ScheduleConfig.js';
import { connectDB } from './lib/mongodb.js';

export default async function handler(req, res) {
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
