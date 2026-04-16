// routes/ProjectRoutes.js

const express = require('express');
const router  = express.Router();
const {
  createProject,
  getProject,
  getUserProjects,
  createTest,
  getTests,
  getTestById,
} = require('../controllers/ProjectControl');

// Pond routes
router.post('/project/create',          createProject);
router.get('/project/:pondId',          getProject);
router.get('/project/user/:userId',     getUserProjects);

// Test routes
router.post('/test/create',             createTest);
router.get('/project/tests/:pondId',    getTests);
router.get('/test/:pondId/:testId',     getTestById);

module.exports = router;
