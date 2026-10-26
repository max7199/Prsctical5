// =============================================================================
// Practical 5: MongoDB Integration and Schema Design with Mongoose
// File: server.js
// Description: RESTful Task Management API using Express, MongoDB, and Mongoose
// =============================================================================

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const Task = require('./models/Task');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/task_manager';

// =============================================================================
// Database Connection
// =============================================================================
/**
 * Connects to MongoDB using Mongoose.
 * Logs success only after connection is established.
 * Throws on failure to prevent starting server without a working database.
 */
async function connectDB(uri = MONGO_URI) {
  try {
    const conn = await mongoose.connect(uri);
    const host = conn.connection.host;
    const port = conn.connection.port || '27017';
    const dbName = conn.connection.name;
    console.log(`Successfully connected to MongoDB at ${host}:${port}/${dbName}`);
    return conn;
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    throw err;
  }
}

// =============================================================================
// Middleware Pipeline (Registered in sequential execution order)
// =============================================================================

// 1. JSON Middleware: Parses incoming requests with JSON payloads
app.use(express.json());

// 2. Global Request Logging Middleware: Logs HTTP method, URL, and ISO timestamp
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${req.method} ${req.url} - ${timestamp}`);
  next(); // Pass control to the next middleware in the pipeline
});

// 3. Content-Type Validation Middleware:
// Applies to POST and PUT requests to ensure clients send application/json.
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

// 4. Route-Specific Middleware: Validate MongoDB ObjectId
// Validates that :id parameter is a 24-character hexadecimal string before querying
const validateObjectId = (req, res, next) => {
  const rawId = req.params.id ? String(req.params.id).trim() : '';

  if (!rawId || !mongoose.Types.ObjectId.isValid(rawId)) {
    return res.status(400).json({
      error: 'Invalid Task ID',
      message: `The provided ID '${rawId}' is not a valid MongoDB ObjectId`
    });
  }

  next();
};

// Helper: Async error wrapper to safely catch async exceptions and forward to global error handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// =============================================================================
// API CRUD Routes (MongoDB-backed via Mongoose Task model)
// =============================================================================

// 1. GET /tasks - Retrieve all tasks from MongoDB (also supports /task alias)
app.get(['/tasks', '/task'], asyncHandler(async (req, res) => {
  const tasks = await Task.find();
  return res.status(200).json(tasks);
}));

// 5. GET /tasks/:id - Retrieve a specific task by MongoDB ObjectId (Supplementary endpoint)
app.get(['/tasks/:id', '/task/:id'], validateObjectId, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const task = await Task.findById(id);

  if (!task) {
    return res.status(404).json({
      error: 'Task Not Found',
      message: `Task with ID ${id} does not exist`
    });
  }

  return res.status(200).json(task);
}));

// 2. POST /tasks - Create a new task in MongoDB (also supports /task alias)
app.post(['/tasks', '/task'], asyncHandler(async (req, res) => {
  const { title, description, completed, priority } = req.body;

  // Build document payload from client request
  const taskData = {};
  if (title !== undefined) taskData.title = typeof title === 'string' ? title.trim() : title;
  if (description !== undefined) taskData.description = description;
  if (completed !== undefined) taskData.completed = completed;
  if (priority !== undefined) taskData.priority = priority;

  // Create new task instance to trigger pre-save hook and schema validation
  const newTask = new Task(taskData);
  const savedTask = await newTask.save();

  return res.status(201).json(savedTask);
}));

// 3. PUT /tasks/:id - Update an existing task in MongoDB by ObjectId
app.put(['/tasks/:id', '/task/:id'], validateObjectId, asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Whitelist modifiable fields - prevent modifying immutable/server-managed fields (_id, createdAt)
  const allowedFields = ['title', 'description', 'completed', 'priority'];
  const updatePayload = {};

  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      updatePayload[field] = req.body[field];
    }
  }

  // If title was provided in the update, trim whitespace
  if (typeof updatePayload.title === 'string') {
    updatePayload.title = updatePayload.title.trim();
  }

  // Find and update document with runValidators enabled to enforce schema constraints
  const updatedTask = await Task.findByIdAndUpdate(
    id,
    updatePayload,
    { returnDocument: 'after', runValidators: true }
  );

  if (!updatedTask) {
    return res.status(404).json({
      error: 'Task Not Found',
      message: `Task with ID ${id} does not exist`
    });
  }

  return res.status(200).json(updatedTask);
}));

// 4. DELETE /tasks/:id - Delete an existing task from MongoDB by ObjectId
app.delete(['/tasks/:id', '/task/:id'], validateObjectId, asyncHandler(async (req, res) => {
  const { id } = req.params;
  const deletedTask = await Task.findByIdAndDelete(id);

  if (!deletedTask) {
    return res.status(404).json({
      error: 'Task Not Found',
      message: `Task with ID ${id} does not exist`
    });
  }

  return res.status(200).json({
    message: 'Task deleted successfully',
    task: deletedTask
  });
}));

// =============================================================================
// 404 Handler for Undefined Routes (Must be registered after all API routes)
// =============================================================================
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist'
  });
});

// =============================================================================
// Global Error-Handling Middleware (Must have 4 arguments: err, req, res, next)
// =============================================================================
app.use((err, req, res, next) => {
  // Log detailed error on the server console for debugging
  console.error('[Server Error]', err.stack || err);

  // 1. Catch malformed JSON body errors thrown by express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Malformed JSON',
      message: 'The request body contains invalid JSON syntax'
    });
  }

  // 2. Catch Mongoose schema validation errors
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      error: 'Validation failed',
      details: details
    });
  }

  // 3. Catch Mongoose CastError (invalid ObjectId or type casting failure)
  if (err.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID or Data Type',
      message: `Invalid value '${err.value}' for field '${err.path}'`
    });
  }

  // 4. Catch MongoDB duplicate-key errors (Error code 11000)
  if (err.code === 11000) {
    return res.status(400).json({
      error: 'Duplicate Key Error',
      message: 'A record with that unique field value already exists'
    });
  }

  // 5. Generic 500 response - never expose stack trace or database internals to clients
  return res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred on the server'
  });
});

// =============================================================================
// Server Initialization
// =============================================================================
/**
 * Starts the HTTP server only AFTER the database connection succeeds.
 * Exits with failure code if database connection fails.
 */
async function startServer(port = PORT, uri = MONGO_URI) {
  try {
    await connectDB(uri);
    return new Promise((resolve) => {
      const server = app.listen(port, () => {
        console.log(`Task Management API server running on http://localhost:${port}`);
        resolve(server);
      });
    });
  } catch (err) {
    console.error('Server startup aborted due to database connection failure.');
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

app.connectDB = connectDB;
app.startServer = startServer;
module.exports = app;
