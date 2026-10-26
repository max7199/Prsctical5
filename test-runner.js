// =============================================================================
// Practical 5: Automated Test Runner for MongoDB & Mongoose Task Management API
// Executes all required test cases and asserts status codes, schemas, and outputs
// =============================================================================

require('dotenv').config();
const http = require('http');
const mongoose = require('mongoose');
const app = require('./server');

const TEST_PORT = 5001; // Use separate port for running test suite

function request(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: TEST_PORT,
      path,
      method,
      headers
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, data: json, headers: res.headers });
      });
    });

    req.on('error', reject);

    if (body !== null) {
      if (typeof body === 'object') {
        req.write(JSON.stringify(body));
      } else {
        req.write(body);
      }
    }
    req.end();
  });
}

async function runTests() {
  console.log(`\n========================================================`);
  console.log(` Connecting to MongoDB for Practical 5 Test Suite...`);
  console.log(`========================================================\n`);

  try {
    await app.connectDB();
  } catch (err) {
    console.error('Cannot run tests: Local MongoDB is not reachable.');
    console.error('Error detail:', err.message);
    process.exit(1);
  }

  const server = app.listen(TEST_PORT);
  console.log(`Test server running on http://localhost:${TEST_PORT}\n`);

  let passedCount = 0;
  const totalCount = 15;

  const runTestCase = async (testNumber, description, fn) => {
    try {
      await fn();
      console.log(`[PASS] Test ${String(testNumber).padStart(2, ' ')}: ${description}`);
      passedCount++;
    } catch (err) {
      console.error(`[FAIL] Test ${String(testNumber).padStart(2, ' ')}: ${description}`);
      console.error(`        Error: ${err.message}`);
    }
  };

  let validCreatedId = null;
  let defaultCreatedId = null;

  try {
    // 1. GET all tasks
    await runTestCase(1, 'GET /tasks - Retrieve all tasks (Expected 200 OK)', async () => {
      const res = await request('GET', '/tasks');
      if (res.status !== 200) throw new Error(`Status was ${res.status}, expected 200`);
      if (!Array.isArray(res.data)) throw new Error('Expected JSON array of task documents');
    });

    // 2. POST a valid task with full fields
    await runTestCase(2, 'POST /tasks - Create a valid task (Expected 201 Created)', async () => {
      const payload = {
        title: 'Complete Practical 5',
        description: 'Integrate MongoDB with Express and Mongoose',
        completed: false,
        priority: 'high'
      };
      const res = await request('POST', '/tasks', { 'Content-Type': 'application/json' }, payload);
      if (res.status !== 201) throw new Error(`Status was ${res.status}, expected 201`);
      if (!res.data._id) throw new Error('Missing _id in created document');
      if (res.data.title !== payload.title) throw new Error(`Expected title "${payload.title}", got "${res.data.title}"`);
      if (res.data.priority !== 'high') throw new Error(`Expected priority "high", got "${res.data.priority}"`);
      validCreatedId = res.data._id;
    });

    // 3. POST /tasks without a title
    await runTestCase(3, 'POST /tasks without a title (Expected 400 Bad Request with validation error)', async () => {
      const payload = { description: 'Missing title', completed: false, priority: 'medium' };
      const res = await request('POST', '/tasks', { 'Content-Type': 'application/json' }, payload);
      if (res.status !== 400) throw new Error(`Status was ${res.status}, expected 400`);
      if (!res.data.error || res.data.error !== 'Validation failed') {
        throw new Error(`Expected structured validation error, got: ${JSON.stringify(res.data)}`);
      }
    });

    // 4. POST /tasks with a blank/whitespace-only title
    await runTestCase(4, 'POST /tasks with blank title (Expected 400 Bad Request)', async () => {
      const payload = { title: '    ', description: 'Blank title task' };
      const res = await request('POST', '/tasks', { 'Content-Type': 'application/json' }, payload);
      if (res.status !== 400) throw new Error(`Status was ${res.status}, expected 400`);
      if (!res.data.error) throw new Error('Expected error response for blank title');
    });

    // 5. POST /tasks with invalid priority "urgent"
    await runTestCase(5, 'POST /tasks with priority "urgent" (Expected 400 Bad Request - Enum validation)', async () => {
      const payload = { title: 'Urgent Task', priority: 'urgent' };
      const res = await request('POST', '/tasks', { 'Content-Type': 'application/json' }, payload);
      if (res.status !== 400) throw new Error(`Status was ${res.status}, expected 400`);
      if (!res.data.error || !JSON.stringify(res.data).includes('priority')) {
        throw new Error(`Expected priority validation error, got: ${JSON.stringify(res.data)}`);
      }
    });

    // 6. POST /tasks without completed or priority (test schema defaults)
    await runTestCase(6, 'POST /tasks without completed/priority (Expected 201 Created with defaults)', async () => {
      const payload = { title: 'Default Schema Task', description: 'Testing defaults' };
      const res = await request('POST', '/tasks', { 'Content-Type': 'application/json' }, payload);
      if (res.status !== 201) throw new Error(`Status was ${res.status}, expected 201`);
      if (res.data.completed !== false) throw new Error(`Expected completed=false, got ${res.data.completed}`);
      if (res.data.priority !== 'medium') throw new Error(`Expected priority="medium", got ${res.data.priority}`);
      defaultCreatedId = res.data._id;
    });

    // 7. GET /tasks/:id using existing ObjectId
    await runTestCase(7, 'GET /tasks/:id with existing ObjectId (Expected 200 OK)', async () => {
      const res = await request('GET', `/tasks/${validCreatedId}`);
      if (res.status !== 200) throw new Error(`Status was ${res.status}, expected 200`);
      if (res.data._id !== validCreatedId) throw new Error('Retrieved document ID does not match');
    });

    // 8. GET /tasks/:id with nonexistent valid-format ObjectId
    await runTestCase(8, 'GET /tasks/:id with nonexistent ObjectId (Expected 404 Not Found)', async () => {
      const res = await request('GET', '/tasks/507f1f77bcf86cd799439011');
      if (res.status !== 404) throw new Error(`Status was ${res.status}, expected 404`);
      if (!res.data.error || res.data.error !== 'Task Not Found') throw new Error('Expected 404 Task Not Found payload');
    });

    // 9. PUT /tasks/:id using actual MongoDB ObjectId
    await runTestCase(9, 'PUT /tasks/:id with existing ObjectId (Expected 200 OK)', async () => {
      const updatePayload = {
        completed: true,
        priority: 'low',
        description: 'Updated MongoDB task description'
      };
      const res = await request('PUT', `/tasks/${validCreatedId}`, { 'Content-Type': 'application/json' }, updatePayload);
      if (res.status !== 200) throw new Error(`Status was ${res.status}, expected 200`);
      if (res.data.completed !== true) throw new Error('Field completed was not updated');
      if (res.data.priority !== 'low') throw new Error('Field priority was not updated');
      if (res.data.title !== 'Complete Practical 5') throw new Error('Existing title was not preserved');
    });

    // 10. PUT /tasks/:id using nonexistent valid ObjectId
    await runTestCase(10, 'PUT /tasks/:id with nonexistent ObjectId (Expected 404 Not Found)', async () => {
      const res = await request('PUT', '/tasks/507f1f77bcf86cd799439011', { 'Content-Type': 'application/json' }, { title: 'Unknown' });
      if (res.status !== 404) throw new Error(`Status was ${res.status}, expected 404`);
    });

    // 11. PUT /tasks/invalid-id with malformed ObjectId
    await runTestCase(11, 'PUT /tasks/invalid-id (Expected 400 Bad Request)', async () => {
      const res = await request('PUT', '/tasks/invalid-id', { 'Content-Type': 'application/json' }, { title: 'Test' });
      if (res.status !== 400) throw new Error(`Status was ${res.status}, expected 400`);
      if (!res.data.error || !res.data.error.includes('Invalid Task ID')) {
        throw new Error(`Expected Invalid Task ID error, got: ${JSON.stringify(res.data)}`);
      }
    });

    // 12. DELETE /tasks/:id using existing ObjectId
    await runTestCase(12, 'DELETE /tasks/:id with existing ObjectId (Expected 200 OK)', async () => {
      const res = await request('DELETE', `/tasks/${validCreatedId}`);
      if (res.status !== 200) throw new Error(`Status was ${res.status}, expected 200`);
      if (!res.data.message || !res.data.message.includes('deleted successfully')) {
        throw new Error('Expected deletion success message');
      }
    });

    // 13. DELETE /tasks/:id using nonexistent valid ObjectId
    await runTestCase(13, 'DELETE /tasks/:id with nonexistent ObjectId (Expected 404 Not Found)', async () => {
      const res = await request('DELETE', '/tasks/507f1f77bcf86cd799439011');
      if (res.status !== 404) throw new Error(`Status was ${res.status}, expected 404`);
    });

    // 14. Send POST request without application/json Content-Type
    await runTestCase(14, 'POST /tasks without application/json Content-Type (Expected 400 Bad Request)', async () => {
      const res = await request('POST', '/tasks', { 'Content-Type': 'text/plain' }, 'plain text data');
      if (res.status !== 400) throw new Error(`Status was ${res.status}, expected 400`);
      if (!res.data.error || !res.data.error.includes('Content-Type')) {
        throw new Error(`Expected Content-Type error, got: ${JSON.stringify(res.data)}`);
      }
    });

    // 15. Request an undefined endpoint
    await runTestCase(15, 'Request an undefined route (Expected 404 Not Found)', async () => {
      const res = await request('GET', '/unknown/route/not/found');
      if (res.status !== 404) throw new Error(`Status was ${res.status}, expected 404`);
      if (res.data.error !== 'Route not found') throw new Error('Expected custom 404 handler payload');
    });

  } finally {
    // Clean up created default test task if still present
    if (defaultCreatedId) {
      await request('DELETE', `/tasks/${defaultCreatedId}`);
    }
    server.close();
    await mongoose.connection.close();
  }

  console.log(`\n========================================================`);
  console.log(` Test Summary: ${passedCount}/${totalCount} Passed (${passedCount === totalCount ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'})`);
  console.log(`========================================================\n`);

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
