// =============================================================================
// Automated Test Runner for Practical 4 REST API
// Executes all 10 required test cases and asserts status codes and outputs
// =============================================================================

const http = require('http');
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
  const server = app.listen(TEST_PORT);
  console.log(`\n========================================================`);
  console.log(` Starting Practical 4 API Verification Suite on port ${TEST_PORT}`);
  console.log(`========================================================\n`);

  let passedCount = 0;
  let totalCount = 10;

  const runTestCase = async (testNumber, description, fn) => {
    try {
      await fn();
      console.log(`[PASS] Test ${testNumber}: ${description}`);
      passedCount++;
    } catch (err) {
      console.error(`[FAIL] Test ${testNumber}: ${description}`);
      console.error(`       Error: ${err.message}`);
    }
  };

  try {
    // 1. GET all tasks
    await runTestCase(1, 'GET all tasks (Expected 200)', async () => {
      const res = await request('GET', '/tasks');
      if (res.status !== 200) throw new Error(`Status was ${res.status}`);
      if (!Array.isArray(res.data) || res.data.length < 2) throw new Error('Expected array of at least 2 tasks');
    });

    // 2. POST a valid task
    let createdTaskId;
    await runTestCase(2, 'POST a valid task (Expected 201)', async () => {
      const payload = {
        title: 'New Automated Task',
        description: 'Created by verification script',
        completed: false
      };
      const res = await request('POST', '/tasks', { 'Content-Type': 'application/json' }, payload);
      if (res.status !== 201) throw new Error(`Status was ${res.status}`);
      if (!res.data.id || res.data.title !== payload.title) throw new Error('Task body mismatch');
      createdTaskId = res.data.id;
    });

    // 3. POST without a title
    await runTestCase(3, 'POST without a title (Expected 400)', async () => {
      const payload = { description: 'Missing title', completed: false };
      const res = await request('POST', '/tasks', { 'Content-Type': 'application/json' }, payload);
      if (res.status !== 400) throw new Error(`Status was ${res.status}`);
      if (!res.data.error) throw new Error('Expected error message in response');
    });

    // 4. POST without application/json Content-Type
    await runTestCase(4, 'POST without application/json Content-Type (Expected 400)', async () => {
      const res = await request('POST', '/tasks', { 'Content-Type': 'text/plain' }, 'plain text data');
      if (res.status !== 400) throw new Error(`Status was ${res.status}`);
      if (!res.data.error || !res.data.error.includes('Content-Type')) {
        throw new Error(`Expected Content-Type error, got: ${JSON.stringify(res.data)}`);
      }
    });

    // 5. PUT an existing task
    await runTestCase(5, 'PUT an existing task (Expected 200)', async () => {
      const updatePayload = {
        completed: true,
        description: 'Updated description for task 1'
      };
      const res = await request('PUT', '/tasks/1', { 'Content-Type': 'application/json' }, updatePayload);
      if (res.status !== 200) throw new Error(`Status was ${res.status}`);
      if (res.data.id !== 1 || res.data.completed !== true) throw new Error('Task was not updated properly');
      if (res.data.title !== 'Complete Practical 4') throw new Error('Title was not preserved');
    });

    // 6. PUT a nonexistent task
    await runTestCase(6, 'PUT a nonexistent task (Expected 404)', async () => {
      const res = await request('PUT', '/tasks/99999', { 'Content-Type': 'application/json' }, { title: 'Unknown' });
      if (res.status !== 404) throw new Error(`Status was ${res.status}`);
      if (!res.data.error) throw new Error('Expected 404 error payload');
    });

    // 7. PUT with an invalid ID
    await runTestCase(7, 'PUT with an invalid ID (Expected 400)', async () => {
      const res = await request('PUT', '/tasks/invalid_id', { 'Content-Type': 'application/json' }, { title: 'Test' });
      if (res.status !== 400) throw new Error(`Status was ${res.status}`);
      if (!res.data.error || !res.data.error.includes('Task ID')) {
        throw new Error(`Expected Invalid Task ID error, got: ${JSON.stringify(res.data)}`);
      }
    });

    // 8. DELETE an existing task
    await runTestCase(8, 'DELETE an existing task (Expected 200)', async () => {
      const res = await request('DELETE', `/tasks/${createdTaskId}`);
      if (res.status !== 200) throw new Error(`Status was ${res.status}`);
      if (!res.data.message || !res.data.message.includes('deleted')) throw new Error('Expected deletion message');
    });

    // 9. DELETE a nonexistent task
    await runTestCase(9, 'DELETE a nonexistent task (Expected 404)', async () => {
      const res = await request('DELETE', '/tasks/99999');
      if (res.status !== 404) throw new Error(`Status was ${res.status}`);
    });

    // 10. Request an undefined route
    await runTestCase(10, 'Request an undefined route (Expected 404)', async () => {
      const res = await request('GET', '/unknown/route/not/found');
      if (res.status !== 404) throw new Error(`Status was ${res.status}`);
      if (res.data.error !== 'Route not found') throw new Error('Expected custom 404 handler payload');
    });

  } finally {
    server.close();
  }

  console.log(`\n========================================================`);
  console.log(` Test Summary: ${passedCount}/${totalCount} Passed (${passedCount === totalCount ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'})`);
  console.log(`========================================================\n`);

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
