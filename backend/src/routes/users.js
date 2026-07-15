const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const auth = require('../middleware/auth');
const { authorizeAccountPermission } = require('../middleware/rbac');
const { validate } = require('../middleware/validate');

const createUserSchema = {
  body: {
    username: { type: 'string', required: true, minLength: 2 },
    email: { type: 'string', required: true, email: true },
    password: { type: 'string', required: true, minLength: 6 },
    role: { type: 'string' }
  }
};

const updateUserSchema = {
  body: {
    username: { type: 'string', minLength: 2 },
    email: { type: 'string', email: true },
    password: { type: 'string', minLength: 6 },
    role: { type: 'string' }
  }
};

// All routes require authentication and admin role
router.use(auth);
// Legacy system-user administration remains restricted to the global admin
// account role. Workspace Owners manage only their own team via /api/teams.
router.use(authorizeAccountPermission('manageUsers'));

// GET /api/users
router.get('/', userController.getAllUsers);

// GET /api/users/:id
router.get('/:id', userController.getUserById);

// POST /api/users
router.post('/', validate(createUserSchema), userController.createUser);

// PUT /api/users/:id
router.put('/:id', validate(updateUserSchema), userController.updateUser);

// DELETE /api/users/:id
router.delete('/:id', userController.deleteUser);

module.exports = router;
