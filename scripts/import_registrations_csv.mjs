import fs from 'fs';
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

const Registration = mongoose.models.Registration || mongoose.model('Registration', RegistrationSchema);

function parseCSVLine(text) {
  let p = '', row = [''], i = 0, r = 0, s = !0, l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if (',' === l && s) l = row[++i] = '';
    else row[i] += l;
    p = l;
  }
  return row;
}

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const csvContent = fs.readFileSync(path.resolve(__dirname, '../final_remaining_teams (2).csv'), 'utf8');
    const lines = csvContent.split('\n').filter(line => line.trim().length > 0);
    const headers = parseCSVLine(lines[0]);
    
    // We expect headers: Team ID,Team Name,Candidate's Name,Candidate's Email,Candidate's Mobile,Candidate's Location,User Type,Domain,Course,Course Specialization,Course Type,Course Duration (years),Year of Graduation,Candidate's Organisation,Differently Abled,Status,Candidate's Report,Q1: Submit your PPT here,Payment,Amount
    
    const teamsMap = new Map();

    for (let i = 1; i < lines.length; i++) {
        const row = parseCSVLine(lines[i]);
        if (!row || row.length < 5) continue;

        const code = row[0]?.trim();
        const teamName = row[1]?.trim();
        const name = row[2]?.trim();
        const email = row[3]?.trim();
        // Remove '91' country code if present from mobile
        let phone = row[4]?.trim() || '';
        if (phone.startsWith('91') && phone.length === 12) {
          phone = phone.slice(2);
        }
        const userType = row[6]?.trim();
        const org = row[13]?.trim() || 'N/A';
        const dept = row[9]?.trim() || 'N/A';
        
        if (!code) continue;

        if (!teamsMap.has(code)) {
            teamsMap.set(code, {
                teamCode: code,
                teamName: teamName,
                collegeName: org,
                branch: dept,
                leader: { name: '', email: '', phone: '' },
                members: [],
                paymentStatus: 'paid',
                totalAmount: 800,
                registrationCompleted: true
            });
        }

        const teamData = teamsMap.get(code);

        if (userType && (userType.toLowerCase() === 'team leader' || userType.toLowerCase() === 'lead')) {
            teamData.leader = { name, email, phone };
        } else {
            teamData.members.push({ name, email: email || 'nomail@test.com', phone: phone || '0000000000' });
        }
    }

    for (const [code, team] of teamsMap) {
        if (!team.leader.name && team.members.length > 0) {
           const l = team.members.shift();
           team.leader = l;
        }

        // Check if exists
        const existing = await Registration.findOne({ teamCode: code });
        if (existing) {
            console.log(`Team ${code} (${team.teamName}) already exists in Registration.`);
        } else {
            console.log(`Adding Team ${code} (${team.teamName}) to Registration...`);
            await Registration.create(team);
            console.log(`Added ${code}`);
        }
    }

    console.log('Done checking and adding to Registration.');
    process.exit(0);

  } catch (err) {
    console.error('Error importing:', err);
    process.exit(1);
  }
}

run();
