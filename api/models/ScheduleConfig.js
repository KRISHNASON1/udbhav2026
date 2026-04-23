import mongoose from 'mongoose';

const ScheduleConfigSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'singleton' },
    
    // Visibility timings for dashboard links
    links: {
      resources: { type: Date, default: () => new Date('2026-04-25T11:00:00+05:30') },
      mentorship: { type: Date, default: () => new Date('2026-04-25T11:00:00+05:30') },
      githubSubmission: { type: Date, default: () => new Date('2026-04-26T01:00:00+05:30') },
      pptSubmission: { type: Date, default: () => new Date('2026-04-26T07:00:00+05:30') },
      projectSubmission: { type: Date, default: () => new Date('2026-04-26T07:00:00+05:30') },
    },

    // Timeline stages
    timelineStages: [
      {
        time: String,
        title: String,
        description: String,
        timestamp: Date,
      }
    ],

    // Target date for countdown
    targetDate: { type: Date, default: () => new Date('2026-04-25T08:00:00+05:30') }
  },
  {
    timestamps: true,
    collection: 'scheduleconfig',
  }
);

export const ScheduleConfig =
  mongoose.models.ScheduleConfig ||
  mongoose.model('ScheduleConfig', ScheduleConfigSchema);
