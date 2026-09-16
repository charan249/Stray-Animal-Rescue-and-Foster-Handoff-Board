// seed.js — populates the database with realistic demo data covering every
// stage of the workflow, so the judge can see the full board without having
// to manually create test data first. Run with: node seed.js
require('dotenv').config();
const pool = require('./db');

async function seed() {
  await pool.query('DELETE FROM daily_checkins');
  await pool.query('DELETE FROM handoffs');
  await pool.query('DELETE FROM rescue_calls');

  // 1. Open emergency, unclaimed, urgent
  await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status)
     VALUES ($1,$2,$3,$4)`,
    ['Near City Bus Depot', 'Dog hit by a two-wheeler, unable to stand, bleeding from front leg', 'urgent', 'reported']
  );

  // 2. Open emergency, unclaimed, normal urgency
  await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status)
     VALUES ($1,$2,$3,$4)`,
    ['Behind Sai Baba Temple', 'Litter of 4 kittens, mother not seen for 2 days', 'normal', 'reported']
  );

  // 3. Claimed, waiting for pickup
  await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by)
     VALUES ($1,$2,$3,$4,$5)`,
    ['MG Road flyover underpass', 'Adult dog, skin infection, very thin', 'urgent', 'claimed', 'Arjun (driver)']
  );

  // 4. In transit
  const r4 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    ['Lakeview Park', 'Kitten stuck in storm drain, freed but shaken and limping', 'urgent', 'picked_up', 'Priya (driver)']
  );
  await pool.query(
    `INSERT INTO handoffs (call_id, stage, recorded_by) VALUES ($1,'picked_up',$2)`,
    [r4.rows[0].id, 'Priya (driver)']
  );

  // 5. At clinic
  const r5 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    ['Ashoka Nagar Main Road', 'Dog with suspected fracture in hind leg', 'urgent', 'at_clinic', 'Deepak (driver)']
  );
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by) VALUES ($1,'picked_up',$2)`, [r5.rows[0].id, 'Deepak (driver)']);
  await pool.query(
    `INSERT INTO handoffs (call_id, stage, medical_notes, recorded_by) VALUES ($1,'at_clinic',$2,$3)`,
    [r5.rows[0].id, 'X-ray shows hairline fracture, splinted, needs cage rest 3 weeks, painkillers 2x daily', 'Dr. Nandini']
  );

  // 6. At foster, with diet/meds set, and a check-in logged (worsening flag true, on purpose — edge case)
  const r6 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by, dietary_needs, medication_schedule)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    ['Green Valley Colony', 'Senior dog, recovering from mild dehydration', 'normal', 'at_foster', 'Kavya (driver)',
     'Soft food only, small portions 3x/day', 'Electrolyte supplement mixed with water, 2x daily for 5 days']
  );
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by) VALUES ($1,'picked_up',$2)`, [r6.rows[0].id, 'Kavya (driver)']);
  await pool.query(`INSERT INTO handoffs (call_id, stage, medical_notes, recorded_by) VALUES ($1,'at_clinic',$2,$3)`,
    [r6.rows[0].id, 'Mild dehydration, given IV fluids, cleared for foster', 'Dr. Nandini']);
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by) VALUES ($1,'at_foster',$2)`, [r6.rows[0].id, 'Foster: Meena']);
  await pool.query(
    `INSERT INTO daily_checkins (call_id, medication_given, condition_worsening, notes, recorded_by, checkin_date)
     VALUES ($1,$2,$3,$4,$5, CURRENT_DATE - 1)`,
    [r6.rows[0].id, true, false, 'Ate well, active in the evening', 'Foster: Meena']
  );

  // 7. Resolved (for completeness, doesn't show on any active tab)
  const r7 = await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status, claimed_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    ['Rajiv Gandhi Nagar', 'Cat with minor cut on paw', 'low', 'resolved', 'Arjun (driver)']
  );
  await pool.query(`INSERT INTO handoffs (call_id, stage, recorded_by) VALUES ($1,'resolved',$2)`, [r7.rows[0].id, 'Foster: Ramesh']);

  // 8. Cancelled (edge case)
  await pool.query(
    `INSERT INTO rescue_calls (location, description, urgency, status)
     VALUES ($1,$2,$3,$4)`,
    ['Station Road', 'Reported injured pigeon — turned out to be a false alarm', 'low', 'cancelled']
  );

  console.log('Seed data inserted.');
  await pool.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
