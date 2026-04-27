const pool = require('../db/connection');

const saveProfile = async (req, res) => {
  const {
    name, gender,
    problem_type, problem_details,
    country, state, city,
    mobile, session_id
  } = req.body;

  if (!mobile) {
    return res.status(400).json({ success: false, error: 'Mobile number is required.' });
  }

  const mobileTrimmed = String(mobile).trim();
  if (!/^\+?\d{10,15}$/.test(mobileTrimmed)) {
    return res.status(400).json({ success: false, error: 'Invalid mobile number format.' });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO users
         (name, gender, problem_type, problem_details, country, state, city, mobile, session_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name          ? String(name).trim().slice(0, 100)               : null,
        gender        ? String(gender).trim().slice(0, 20)              : null,
        problem_type  ? String(problem_type).trim().slice(0, 50)        : null,
        problem_details ? String(problem_details).trim().slice(0, 1000) : null,
        country       ? String(country).trim().slice(0, 100)            : null,
        state         ? String(state).trim().slice(0, 100)              : null,
        city          ? String(city).trim().slice(0, 100)               : null,
        mobileTrimmed,
        session_id    ? String(session_id).slice(0, 100)                : null
      ]
    );

    return res.json({
      success: true,
      message: 'Profile saved successfully.',
      userId:  result.insertId
    });

  } catch (err) {
    console.error('Save profile error:', err);
    return res.status(500).json({ success: false, error: 'Failed to save profile.' });
  }
};

module.exports = { saveProfile };
