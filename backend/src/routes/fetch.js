const express = require('express');
const router = express.Router();
const { fetchController } = require('../controllers/fetchController');

router.post('/', fetchController);

module.exports = router;
