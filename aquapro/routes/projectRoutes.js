const express = require('express');
const router = express.Router();
const {
  getProjects,
  getProject,
  createProject,
  deleteProject,
  updateProject,
  addTest,
  updateTest,
  deleteTest,
  getTest,
  checkUser,
  createTestWithAmmonia
} = require('../controllers/projectController');
const { validateProject, validateTest } = require('../middleware/validation');

// Project routes
router.route('/')
  .get(getProjects)
  .post(validateProject, createProject);

router.route('/:id')
  .get(getProject)
  .put(updateProject)
  .delete(deleteProject);

// Test routes (nested)
router.route('/:id/tests')
  .post(validateTest, addTest);

router.route('/:id/tests/:testId')
  .get(getTest)
  .put(updateTest)
  .delete(deleteTest);

// Quick-create test routes
router.post('/check-user', checkUser);
router.post('/create-test', createTestWithAmmonia);

module.exports = router;
