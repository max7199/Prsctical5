// =============================================================================
// Practical 4: Building a RESTful API with Node.js and Express
// File: server.js
// Description: RESTful Task Management API using Express and In-Memory Storage
// =============================================================================

const express = require('express');
const app = express();
const PORT = process.env.PORT || 5000;

// =============================================================================
// In-Memory Data Store
// =============================================================================
// Tasks are stored in memory for the duration of server execution.
// Initial sample tasks provided as required.
let tasks = [
  {
    id: 1,
    title: "Complete Practical 4",
    description: "Build RESTful API using Express",
    completed: false
  },
  {
    id: 2,
    title: "Prepare for Viva Examination",
    description: "Review REST concepts and Express middleware lifecycle",
    completed: false
  }
];

// Counter for auto-generating unique numeric IDs
let nextTaskId = 3;

// =============================================================================
// Middleware Pipeline (Registered in sequential execution order)
// =============================================================================

// A. JSON Middleware: Parses incoming requests with JSON payloads
app.use(express.json());

// B. Global Request Logging Middleware: Logs method, URL, and ISO timestamp
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${req.method} ${req.url} - ${timestamp}`);
  next(); // Pass control to the next middleware in the pipeline
});

// C. Content-Type Validation Middleware:
// Applies only to POST and PUT requests to ensure clients send application/json.
// GET and DELETE requests proceed without body content-type restriction.
app.use((req, res, next) => {
  if (req.method === 'POST' || req.method === 'PUT') {
    const contentType = req.headers['content-type'];
    if (!contentType || !contentType.toLowerCase().includes('application/json')) {
      return res.status(400).json({
        error: 'Invalid Content-Type',
        message: 'Content-Type must be application/json for POST and PUT requests'
      });
    }
  }
  next();
});

// D. Task ID Validation Middleware:
// Route-specific middleware for routes with :id parameter (PUT, DELETE, and GET /tasks/:id).
// Validates that :id is a positive integer before controller execution.
const validateTaskId = (req, res, next) => {
  const rawId = req.params.id ? String(req.params.id).trim() : '';
  const parsedId = Number(rawId);

  if (!rawId || isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
    return res.status(400).json({
      error: 'Invalid Task ID',
      message: 'Task ID must be a valid positive integer'
    });
  }

  // Attach validated numeric ID to request object for route handlers
  req.taskId = parsedId;
  next();
};

// Helper: Async error wrapper to safely catch async exceptions and forward to global error handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =============================================================================
// API CRUD Routes (Defined BEFORE the 404 handler)
// =============================================================================

// 1. GET /tasks - Retrieve all tasks (also supports /task alias)
app.get(['/tasks', '/task'], asyncHandler(async (req, res) => {
  return res.status(200).json(tasks);
}));

// GET /tasks/:id - Retrieve a specific task by ID (helpful for testing & verification)
app.get(['/tasks/:id', '/task/:id'], validateTaskId, asyncHandler(async (req, res) => {
  const taskId = req.taskId !== undefined ? req.taskId : Number(req.params.id);
  const task = tasks.find(t => t.id === taskId);

  if (!task) {
    return res.status(404).json({
      error: 'Task Not Found',
      message: `Task with ID ${taskId} does not exist`
    });
  }

  return res.status(200).json(task);
}));

// 2. POST /tasks - Create a new task (also supports /task alias)
app.post(['/tasks', '/task'], asyncHandler(async (req, res) => {
  const { title, description, completed } = req.body;

  // Validation: title is required and cannot be empty
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json({
      error: 'Validation Error',
      message: 'Title is required and must be a non-empty string'
    });
  }

  const newTask = {
    id: nextTaskId++,
    title: title.trim(),
    description: typeof description === 'string' ? description.trim() : '',
    completed: Boolean(completed)
  };

  tasks.push(newTask);
  return res.status(201).json(newTask);
}));

// 3. PUT /tasks/:id - Update an existing task (uses route-specific validateTaskId middleware)
app.put(['/tasks/:id', '/task/:id'], validateTaskId, asyncHandler(async (req, res) => {
  const taskId = req.taskId !== undefined ? req.taskId : Number(req.params.id);
  const task = tasks.find(t => t.id === taskId);

  // Return 404 if the task doesn't exist
  if (!task) {
    return res.status(404).json({
      error: 'Task Not Found',
      message: `Task with ID ${taskId} does not exist`
    });
  }

  const { title, description, completed } = req.body;

  // If title was provided in the update, validate it is not empty
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Title must be a non-empty string'
      });
    }
    task.title = title.trim();
  }

  // Update description if provided, otherwise preserve existing
  if (description !== undefined) {
    task.description = typeof description === 'string' ? description.trim() : '';
  }

  // Update completed status if provided, otherwise preserve existing
  if (completed !== undefined) {
    task.completed = Boolean(completed);
  }

  return res.status(200).json(task);
}));

// 4. DELETE /tasks/:id - Delete an existing task (uses route-specific validateTaskId middleware)
app.delete(['/tasks/:id', '/task/:id'], validateTaskId, asyncHandler(async (req, res) => {
  const taskId = req.taskId !== undefined ? req.taskId : Number(req.params.id);
  const taskIndex = tasks.findIndex(t => t.id === taskId);

  // Return 404 if the task doesn't exist
  if (taskIndex === -1) {
    return res.status(404).json({
      error: 'Task Not Found',
      message: `Task with ID ${taskId} does not exist`
    });
  }

  const deletedTask = tasks.splice(taskIndex, 1)[0];

  return res.status(200).json({
    message: 'Task deleted successfully',
    task: deletedTask
  });
}));

// =============================================================================
// 404 Handler for Undefined Routes (Must be after all API routes)
// =============================================================================
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist'
  });
});

// =============================================================================
// Global Error-Handling Middleware (Must be registered LAST with 4 arguments)
// =============================================================================
app.use((err, req, res, next) => {
  // Log detailed error on the server console for debugging
  console.error('[Server Error]', err.stack || err);

  // Catch malformed JSON body errors thrown by express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Malformed JSON',
      message: 'The request body contains invalid JSON syntax'
    });
  }

  // Generic 500 response - never expose stack trace or sensitive info to clients
  return res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred on the server'
  });
});

// =============================================================================
// Server Initialization
// =============================================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Task Management API server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
