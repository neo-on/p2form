const formRoutes = require('../routes/form');
const User = require('../models/User');

const executeRoute = async (method, path, reqObj) => {
  const routeLayer = formRoutes.stack.find(layer => layer.route && layer.route.path === path && layer.route.methods[method]);
  if (!routeLayer) throw new Error(`Route ${method.toUpperCase()} ${path} not found`);

  const res = {
    render: jest.fn(),
    redirect: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn()
  };

  const req = {
    session: {},
    body: {},
    query: {},
    ...reqObj
  };

  const handler = routeLayer.route.stack[routeLayer.route.stack.length - 1].handle;
  await handler(req, res, jest.fn());
  return { req, res };
};

describe('Core Form Routing Logic', () => {
  let userId;
  beforeEach(async () => {
    const user = new User({
      email: 'formuser@sugar.com', password: 'password123',
      approvalId: '1', swsId: '1', projectNumber: '1', undertakingName: '1', plantName: '1', plantCode: '1', state: '1', capacity: '1'
    });
    const savedUser = await user.save();
    userId = savedUser._id;
  });

  describe('GET /', () => {
    test('renders primary home natively ensuring prior draft variables aggressively zero-out', async () => {
      const reqState = { session: { userId, activeDraftId: "12345" } };
      const { res, req } = await executeRoute('get', '/', reqState);
      
      expect(res.render).toHaveBeenCalledWith('home', expect.objectContaining({ user: expect.any(Object) }));
      expect(req.session.activeDraftId).toBeNull();
    });
  });

  describe('POST /back-to-edit', () => {
    test('safely bridges old form payload mapping structures backwards structurally onto the screen', async () => {
      const storedForm = { month: 'March' };
      const { res } = await executeRoute('post', '/back-to-edit', { session: { userId, formData: storedForm } });
      expect(res.render).toHaveBeenCalledWith('home', expect.objectContaining({ formData: storedForm }));
    });
  });

});
