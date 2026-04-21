/**
 * scripts/migrate-mentorship-approval.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time migration: For all teams/registrations that paid ₹1100,
 * set mentorSession=true and mentorshipStatus='approved'.
 *
 * Only touches those two fields. Nothing else is changed.
 *
 * Run with:
 *   node --env-file=.env scripts/migrate-mentorship-approval.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set. Make sure you have a .env file.');
  process.exit(1);
}

await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB Atlas');

// ── Minimal schemas (just what we need) ─────────────────────────────────────
const teamSchema = new mongoose.Schema({}, { strict: false, collection: 'teams' });
const regSchema  = new mongoose.Schema({}, { strict: false, collection: 'registrations' });

const Team         = mongoose.model('Team',         teamSchema);
const Registration = mongoose.model('Registration', regSchema);

// ── Update Teams collection ─────────────────────────────────────────────────
const teamResult = await Team.updateMany(
  {
    totalAmount:      { $gte: 1100 },
    mentorshipStatus: { $ne: 'approved' }   // only update if not already approved
  },
  {
    $set: {
      mentorSession:    true,
      mentorshipStatus: 'approved'
    }
  }
);

console.log(`\n📦 Teams collection:`);
console.log(`   Matched : ${teamResult.matchedCount}`);
console.log(`   Updated : ${teamResult.modifiedCount}`);

// ── Update Registrations collection ─────────────────────────────────────────
const regResult = await Registration.updateMany(
  {
    totalAmount:      { $gte: 1100 },
    mentorshipStatus: { $ne: 'approved' }
  },
  {
    $set: {
      mentorSession:    true,
      mentorshipStatus: 'approved'
    }
  }
);

console.log(`\n📦 Registrations collection:`);
console.log(`   Matched : ${regResult.matchedCount}`);
console.log(`   Updated : ${regResult.modifiedCount}`);

console.log('\n✅ Migration complete. Only mentorSession and mentorshipStatus were updated.');

await mongoose.disconnect();
process.exit(0);
