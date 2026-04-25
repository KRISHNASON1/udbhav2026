import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const MemberSchema = new mongoose.Schema({
  name:  { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  phone: { type: String, required: true, trim: true },
});

const RegistrationSchema = new mongoose.Schema(
  {
    teamName:    { type: String, required: true, trim: true },
    collegeName: { type: String, required: false, trim: true, default: '' },
    branch:      { type: String, required: false, trim: true, default: '' },
    yearOfStudy: { type: String, required: false, default: 'N/A' },
    leader: { type: MemberSchema, required: true },
    members: { type: [MemberSchema] },
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    teamCode: { type: String, default: null, unique: true, sparse: true, uppercase: true, trim: true },
    registrationCompleted: { type: Boolean, default: false },
  },
  { timestamps: true, collection: 'registrations' }
);

const TeamSchema = new mongoose.Schema(
  {
    code: { type: String, default: null, uppercase: true, trim: true },
    codeGenerated: { type: Boolean, default: false },
    teamName: { type: String, required: true, trim: true },
    collegeName: { type: String, required: true, trim: true },
    branch: { type: String, required: true, trim: true },
    memberCount: { type: Number, required: true, min: 1, max: 4, default: 1 },
    leader: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, required: true, trim: true },
    },
    members: [
      {
        name: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        email: { type: String, default: '', trim: true }
      }
    ],
    paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
    totalAmount: { type: Number, default: 800 },
  },
  { timestamps: true, collection: 'teams' }
);

const Registration = mongoose.models.Registration || mongoose.model('Registration', RegistrationSchema);
const Team = mongoose.models.Team || mongoose.model('Team', TeamSchema);

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clean up old TEAM* entries
    await Team.deleteMany({ code: { $regex: /^TEAM/ } });
    await Registration.deleteMany({ teamCode: { $regex: /^TEAM/ } });
    console.log('Cleaned up old TEAM prefixed dummy entries.');

    for (let i = 16; i <= 25; i++) {
      const code = `UDB-DUM${i}`;
      const teamName = `Dummy Team ${i}`;
      
      const leader = {
        name: `Leader ${i}`,
        email: `leader${i}@dummy.com`,
        phone: `99999999${i.toString().padStart(2, '0')}`
      };
      
      const members = [
        {
          name: `Member 1 of ${code}`,
          email: `member1_${i}@dummy.com`,
          phone: `88888888${i.toString().padStart(2, '0')}`
        },
        {
          name: `Member 2 of ${code}`,
          email: `member2_${i}@dummy.com`,
          phone: `77777777${i.toString().padStart(2, '0')}`
        }
      ];

      const teamData = {
        code,
        codeGenerated: true,
        teamName,
        collegeName: 'Dummy University',
        branch: 'Computer Science',
        memberCount: 3, // Leader + 2 members
        leader,
        members,
        paymentStatus: 'paid',
        totalAmount: 800
      };

      const registrationData = {
        teamName,
        collegeName: 'Dummy University',
        branch: 'Computer Science',
        yearOfStudy: '3rd Year',
        leader,
        members,
        totalAmount: 800,
        paymentStatus: 'paid',
        teamCode: code,
        registrationCompleted: true
      };

      console.log(`Upserting ${code}...`);

      // Upsert Team
      await Team.findOneAndUpdate({ code }, teamData, { upsert: true, new: true });
      
      // Upsert Registration
      await Registration.findOneAndUpdate({ teamCode: code }, registrationData, { upsert: true, new: true });
    }

    console.log('Successfully inserted dummy teams 16 to 25 to Atlas!');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

run();
