// routes/userRoutes.js

const express = require('express');
const router  = express.Router();
const { registerUser, loginUser, getUser, getAllUsers } = require('../controllers/UserControl');

router.post('/user/register', registerUser);
router.post('/user/login',    loginUser);
router.get('/user/all',       getAllUsers);
router.get('/user/:userId',   getUser);

module.exports = router;
