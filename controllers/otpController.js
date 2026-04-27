const pool = require('../db/connection');

const verifyOTP = async (req, res) => {
  const { mobile, otp } = req.body;

  // Input validation
  if (!mobile || !otp) {
    return res.status(400).json({ success: false, error: 'Mobile and OTP are required.' });
  }

  const mobileTrimmed = String(mobile).trim();
  const otpTrimmed    = String(otp).trim();

  // Mobile: 10-15 digits (international friendly)
  if (!/^\+?\d{10,15}$/.test(mobileTrimmed)) {
    return res.status(400).json({ success: false, error: 'Please enter a valid mobile number.' });
  }

  // OTP must be exactly 6 digits
  if (!/^\d{6}$/.test(otpTrimmed)) {
    return res.status(400).json({ success: false, error: 'OTP must be exactly 6 digits.' });
  }

  // Accept any 6-digit OTP (dummy verification)
  try {
    await pool.execute(
      'INSERT INTO otp_logs (mobile, otp, verified) VALUES (?, ?, ?)',
      [mobileTrimmed, otpTrimmed, true]
    );
  } catch (dbErr) {
    // Log but don't fail — DB might not be set up yet
    console.error('OTP log DB error (non-fatal):', dbErr.message);
  }

  return res.json({
    success: true,
    message: 'OTP verified successfully.',
    mobile:  mobileTrimmed
  });
};

module.exports = { verifyOTP };
