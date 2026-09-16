// seed.js — populates the database with high-quality, professional demo data.
// Run with: node seed.js
require('dotenv').config();
const pool = require('./db');

async function seed() {
  console.log('🧹 Cleaning database...');
  await pool.query('TRUNCATE TABLE daily_checkins, handoffs, rescue_calls RESTART IDENTITY CASCADE');

  console.log('🌱 Planting professional demo data...');

  // --- 1. REPORTED (Unclaimed, Urgent) ---
  await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, reported_by_name, reported_by_phone)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    ['Central Park Main Gate, Sector 4', 'Golden Retriever with a severe leg injury, unable to walk. Requires immediate transport.', 'urgent', 'reported', 'Sarah Jenkins', '9876543210']
  );

  // --- 2. REPORTED (Unclaimed, Normal) ---
  await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, reported_by_name, reported_by_phone)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    ['12th Cross, Jubilee Hills, House #45', 'Siamese cat trapped in a small attic space. Owner is unable to reach the animal.', 'normal', 'reported', 'Michael Chen', '9876543211']
  );

  // --- 3. CLAIMED (Waiting for Pickup) ---
  await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by_name, claimed_by_phone, reported_by_name, reported_by_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    ['Old Airport Road, near the Petrol Pump', 'Border Collie showing signs of severe malnutrition and skin infection.', 'urgent', 'claimed', 'David Miller', '9876543212', 'Anita Roy', '9876543213']
  );

  // --- 4. PICKED UP (In Transit) ---
  const r4 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by_name, claimed_by_phone, reported_by_name, reported_by_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    ['Victoria Gardens, East Wing', 'Maine Coon kitten found with respiratory distress. Stabilized but needs clinic checkup.', 'urgent', 'picked_up', 'Emily Watson', '9876543214', 'James Bond', '9876543215']
  );
  await pool.query(
    `INSERT INTO handoffs (call_id, stage, recorded_by, recorded_by_phone) VALUES ($1,'picked_up',$2,$3)`,
    [r4.rows[0].id, 'Emily Watson', '9876543214']
  );

  // --- 5. AT CLINIC (Under Medical Care) ---
  const r5 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by_name, claimed_by_phone, reported_by_name, reported_by_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    ['City Veterinary Hospital, Block B', 'Labrador with suspected fracture in hind leg. Currently under observation.', 'urgent', 'at_clinic', 'Mark Sloan', '9876543216', 'Lisa Ray', '9876543217']
  );
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by, recorded_by_phone) VALUES ($1,'picked_up',$2,$3)`, [r5.rows[0].id, 'Mark Sloan', '9876543216']);
  await pool.query(
    `INSERT INTO handoffs (call_id, stage, medical_notes, recorded_by, recorded_by_phone) VALUES ($1,'at_clinic',$2,$3,$4)`,
    [r5.rows[0].id, 'X-ray confirms hairline fracture. Leg splinted. Prescribed cage rest for 3 weeks and pain medication 2x daily.', 'Dr. Sarah', '9876543218']
  );

  // --- 6. AT FOSTER (Recovery Stage) ---
  const r6 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by_name, claimed_by_phone, reported_by_name, reported_by_phone, dietary_needs, medication_schedule)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    ['Sunny Meadows Villa, Plot 12', 'Beagle recovering from emergency soft-tissue surgery. Stable and happy.', 'normal', 'at_foster', 'Kevin Hart', '9876543219', 'Paula Dent', '9876543220',
     'High-protein wet food, small portions 4x per day', 'Antibiotics 1x daily at 8 AM, Vitamin B complex mixed with food']
  );
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by, recorded_by_phone) VALUES ($1,'picked_up',$2,$3)`, [r6.rows[0].id, 'Kevin Hart', '9876543219']);
  await pool.query(
    `INSERT INTO handoffs (call_id, stage, medical_//notes, recorded_by, recorded_by_phone) VALUES ($1,'at_clinic',$2,$3,$4)`,
    [r6.rows[0].id, 'Surgical site cleaned. No signs of infection. Cleared for foster care.', 'Dr. Sarah', '9876543218']
  );
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by, recorded_by_phone) VALUES ($1,'at_foster',$2,$3)`, [r6.rows[0].id, 'Foster: Meena', '9876543221']);
  await pool.query(
    `INSERT INTO daily_checkins (call_id, medication_given, condition_worsening, notes, recorded_by, recorded_by_phone, checkin_date)
     VALUES ($1,$2,$3,$4,$5,$6, CURRENT_DATE - 1)`,
    [r6.rows[0].id, true, false, 'Appetite returning, playful behavior observed in the afternoon.', 'Foster: Meena', '9876543221']
  );

  // --- 7. RESOLVED (Completed) ---
  const r7 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by_name, claimed_by_phone, reported_by_name, reported_by_phone)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    ['Rajiv Gandhi Nagar', 'Cat with minor paw cut. Successfully adopted by new family.', 'low', 'resolved', 'Arjun', '9876543222', 'Sonia', '9876543223']
  );
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by, recorded_by_phone) VALUES ($1,'resolved',$2,$3)`, [r7.rows[0].id, 'Adopted by Smith Family', '9876543224']);

  console.log('✅ Database successfully wiped and populated with professional demo data.');
  await pool.end();
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
