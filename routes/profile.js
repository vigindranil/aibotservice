const express = require('express');
const router  = express.Router();
const { saveProfile } = require('../controllers/profileController');

router.post('/', saveProfile);

module.exports = router;
