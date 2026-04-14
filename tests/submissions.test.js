const submissionRoutes = require('../routes/submissions');
const User = require('../models/User');
const Submission = require('../models/Submission');
const mongoose = require('mongoose');

const executeRoute = async (method, path, reqObj) => {
  // Handle parameterized routes by matching the Express pattern
  const routeLayer = submissionRoutes.stack.find(layer => {
    if (!layer.route || !layer.route.methods[method]) return false;
    const routePath = layer.route.path;
    // Exact match
    if (routePath === path) return true;
    // Parameterized match: /past-requests/:id → /past-requests/abc123
    const regex = new RegExp('^' + routePath.replace(/:[^/]+/g, '[^/]+') + '$');
    return regex.test(path);
  });
  if (!routeLayer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);

  // Extract params from path based on route pattern
  const params = {};
  const routeParts = routeLayer.route.path.split('/');
  const pathParts = path.split('/');
  routeParts.forEach((part, i) => {
    if (part.startsWith(':')) {
      params[part.slice(1)] = pathParts[i];
    }
  });

  const res = {
    render: jest.fn(),
    redirect: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    setHeader: jest.fn(),
    // Mock writable stream for PDF pipe
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn(),
    headersSent: false
  };

  const req = {
    session: {},
    body: {},
    query: {},
    params,
    ...reqObj,
    params: { ...params, ...(reqObj.params || {}) }
  };

  const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  await handler(req, res, jest.fn());
  return { req, res };
};

describe('Submissions Route Workflows', () => {
  let userId, user;

  beforeEach(async () => {
    const u = new User({
      email: 'submissionuser@sugar.com', password: 'password123',
      approvalId: 'M009', swsId: 'SWS-1', projectNumber: 'PROJ-1',
      undertakingName: 'Test Mill', plantName: 'Plant A', plantCode: 'PA-01',
      state: 'UP', capacity: '5000'
    });
    user = await u.save();
    userId = user._id;
  });

  describe('GET /past-requests', () => {
    test('renders past-requests view with empty submissions array when none exist', async () => {
      const { res } = await executeRoute('get', '/past-requests', { session: { userId } });
      expect(res.render).toHaveBeenCalledWith('past-requests', expect.objectContaining({
        user: expect.any(Object),
        submissions: []
      }));
    });

    test('renders past-requests view with submissions sorted by most recent first', async () => {
      // Create two submissions with different timestamps
      await Submission.create({
        userId, formData: { month: 'October' }, p2Json: [{ data: 'first' }],
        apiResponse: { status: '200' }, statusCode: 200,
        sugarSeason: '2025-26', month: 'October'
      });
      await Submission.create({
        userId, formData: { month: 'November' }, p2Json: [{ data: 'second' }],
        apiResponse: { status: '200' }, statusCode: 200,
        sugarSeason: '2025-26', month: 'November'
      });

      const { res } = await executeRoute('get', '/past-requests', { session: { userId } });
      expect(res.render).toHaveBeenCalledWith('past-requests', expect.objectContaining({
        submissions: expect.any(Array)
      }));

      const submissions = res.render.mock.calls[0][1].submissions;
      expect(submissions).toHaveLength(2);
      // Most recent first
      expect(submissions[0].month).toBe('November');
      expect(submissions[1].month).toBe('October');
    });

    test('only returns submissions for the logged-in user, not other users', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      await Submission.create({
        userId: otherUserId, formData: { month: 'March' }, p2Json: [{}],
        apiResponse: { ok: true }, statusCode: 200, month: 'March'
      });
      await Submission.create({
        userId, formData: { month: 'April' }, p2Json: [{}],
        apiResponse: { ok: true }, statusCode: 200, month: 'April'
      });

      const { res } = await executeRoute('get', '/past-requests', { session: { userId } });
      const submissions = res.render.mock.calls[0][1].submissions;
      expect(submissions).toHaveLength(1);
      expect(submissions[0].month).toBe('April');
    });
  });

  describe('GET /past-requests/:id', () => {
    test('renders detail view with the correct submission data', async () => {
      const sub = await Submission.create({
        userId, formData: { month: 'January', sugarSeason: '2024-25' },
        p2Json: [{ approvalId: 'M009' }],
        apiResponse: { status: '200', message: 'OK' },
        statusCode: 200, sugarSeason: '2024-25', month: 'January'
      });

      const { res } = await executeRoute('get', `/past-requests/${sub._id}`, { session: { userId } });
      expect(res.render).toHaveBeenCalledWith('past-request-detail', expect.objectContaining({
        user: expect.any(Object),
        submission: expect.objectContaining({
          month: 'January',
          sugarSeason: '2024-25',
          statusCode: 200
        })
      }));
    });

    test('redirects to /past-requests when submission belongs to another user', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const sub = await Submission.create({
        userId: otherUserId, formData: {}, p2Json: [{}],
        apiResponse: {}, statusCode: 200
      });

      const { res } = await executeRoute('get', `/past-requests/${sub._id}`, { session: { userId } });
      expect(res.redirect).toHaveBeenCalledWith('/past-requests');
      expect(res.render).not.toHaveBeenCalled();
    });

    test('redirects to /past-requests when submission id does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const { res } = await executeRoute('get', `/past-requests/${fakeId}`, { session: { userId } });
      expect(res.redirect).toHaveBeenCalledWith('/past-requests');
    });
  });

  describe('GET /past-requests/:id/pdf', () => {
    test('returns 404 when submission does not exist', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const { res } = await executeRoute('get', `/past-requests/${fakeId}/pdf`, { session: { userId } });
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    });

    test('returns 404 when submission belongs to another user', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      const sub = await Submission.create({
        userId: otherUserId, formData: {}, p2Json: [{}],
        apiResponse: {}, statusCode: 200
      });

      const { res } = await executeRoute('get', `/past-requests/${sub._id}/pdf`, { session: { userId } });
      expect(res.status).toHaveBeenCalledWith(404);
    });

    test('sets correct PDF headers and pipes document for valid submission', async () => {
      const sub = await Submission.create({
        userId, formData: { month: 'October', sugarSeason: '2025-26' },
        p2Json: [{ approvalId: 'M009', forms: [] }],
        apiResponse: { status: '200', message: 'Saved' },
        statusCode: 200, sugarSeason: '2025-26', month: 'October'
      });

      const { res } = await executeRoute('get', `/past-requests/${sub._id}/pdf`, { session: { userId } });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('attachment; filename=')
      );
      // Verify filename contains season and month
      const dispositionCall = res.setHeader.mock.calls.find(c => c[0] === 'Content-Disposition');
      expect(dispositionCall[1]).toContain('2025-26');
      expect(dispositionCall[1]).toContain('October');
    });
  });
});
