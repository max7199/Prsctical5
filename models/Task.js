// =============================================================================
// Practical 5: MongoDB Integration and Schema Design with Mongoose
// File: models/Task.js
// Description: Mongoose Schema and Model definition for Task documents
// =============================================================================

const mongoose = require('mongoose');

// Define Task Schema with field specifications, constraints, and defaults
const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Path `title` is required.'],
    trim: true,
    validate: {
      validator: function (value) {
        return typeof value === 'string' && value.trim().length > 0;
      },
      message: 'Title cannot be blank or empty whitespace.'
    }
  },
  description: {
    type: String,
    default: ''
  },
  completed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high'],
      message: '`{VALUE}` is not a valid priority. Allowed values are: low, medium, high.'
    },
    default: 'medium'
  }
}, {
  // Exclude __v in toJSON transform if desired, or keep default
  versionKey: false
});

// Pre-save document middleware (hook) to trim whitespace from title
// Demonstrates Mongoose application-level middleware
taskSchema.pre('save', function (next) {
  if (this.title && typeof this.title === 'string') {
    this.title = this.title.trim();
  }
  if (typeof next === 'function') {
    next();
  }
});

// Create and export the Task model
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
