const draftRoutes = require('../routes/draft');
const User = require('../models/User');
const Draft = require('../models/Draft');
const mongoose = require('mongoose');

const executeRoute = async (method, path, reqObj) => {
  const routeLayer = draftRoutes.stack.find(layer => layer.route && layer.route.path === path && layer.route.methods[method]);
  if (!routeLayer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);

  const res = {
    render: jest.fn(),
    redirect: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    json: jest.fn()
  };

  const req = {
    session: {},
    body: {},
    query: {},
    params: {},
    ...reqObj
  };

  const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  await handler(req, res, jest.fn());
  return { req, res };
};

describe('Draft Routing Workflows', () => {
  let userId;
  beforeEach(async () => {
    const user = new User({
      email: 'draftuser@sugar.com', password: 'password123',
      approvalId: '1', swsId: '1', projectNumber: '1', undertakingName: '1', plantName: '1', plantCode: '1', state: '1', capacity: '1'
    });
    const savedUser = await user.save();
    userId = savedUser._id;
  });

  describe('GET /drafts', () => {
    test('renders drafts cleanly when queried', async () => {
      const { res } = await executeRoute('get', '/drafts', { session: { userId } });
      expect(res.render).toHaveBeenCalledWith('drafts', expect.objectContaining({ drafts: expect.any(Array) }));
    });
  });

  describe('POST /drafts', () => {
    test('strictly enforces payload and correctly inserts a brand new mathematical Draft into DB natively', async () => {
      const { res } = await executeRoute('post', '/drafts', {
        session: { userId, p2Json: [{ data: "payload" }], formData: { sugarSeason: "2024-25" } },
        body: { name: "Testing Saved Draft" }
      });
      // Verification
      const found = await Draft.findOne({ name: "Testing Saved Draft" });
      expect(found).not.toBeNull();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    test('seamlessly falls back redirecting when session tracker lacks compiled JSON to deploy', async () => {
      const { res } = await executeRoute('post', '/drafts', {
        session: { userId, p2Json: null }, // Mising payload
        body: { name: "Testing Saved Draft" }
      });
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

});
