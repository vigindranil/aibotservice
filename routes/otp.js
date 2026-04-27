const express = require('express');
const router  = express.Router();
const { verifyOTP } = require('../controllers/otpController');

router.post('/', verifyOTP);

module.exports = router;
