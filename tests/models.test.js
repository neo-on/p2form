const mongoose = require('mongoose');
const User = require('../models/User');
const Draft = require('../models/Draft');
const Submission = require('../models/Submission');

describe('Database Models Simulation', () => {
  test('User Model explicitly encrypts the password cleanly upon save', async () => {
    const fakeUser = new User({
      email: 'testauth@sugar.com',
      password: 'cleartextpassword123',
      approvalId: '12',
      swsId: '12',
      projectNumber: '12',
      undertakingName: 'A',
      plantName: 'A',
      plantCode: 'A',
      state: 'A',
      capacity: 'A'
    });

    const savedUser = await fakeUser.save();
    
    // Ensure the database specifically does NOT store plaintext!
    expect(savedUser.password).not.toBe('cleartextpassword123');
    // Ensure bcrypt hashing structure holds ($2a/b$ indicates bcrypt)
    expect(savedUser.password).toMatch(/^\$2[aby]\$\d{2}\$/);
    
    // Evaluate compare logic natively wrapper method
    const isValid = await savedUser.comparePassword('cleartextpassword123');
    expect(isValid).toBe(true);
    
    const isInvalid = await savedUser.comparePassword('wrongpassword');
    expect(isInvalid).toBe(false);
  });

  test('User enforces explicitly unique emails natively', async () => {
    const user1 = new User({
      email: 'unique@sugar.com', password: '123',
      approvalId: '1', swsId: '1', projectNumber: '1',
      undertakingName: '1', plantName: '1', plantCode: '1', state: '1', capacity: '1'
    });
    await user1.save();

    const user2 = new User({
      email: 'unique@sugar.com', password: '123',
      approvalId: '1', swsId: '1', projectNumber: '1',
      undertakingName: '1', plantName: '1', plantCode: '1', state: '1', capacity: '1'
    });

    let error = null;
    try {
      await user2.save();
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    // Unique indexing structurally throws a code 11000 in MongoDB
    expect(error.code).toBe(11000);
  });

  test('Draft seamlessly saves mapped data referencing proper User Context', async () => {
    const draft = new Draft({
      userId: new mongoose.Types.ObjectId(),
      name: 'Mock Test Draft',
      month: 'December',
      sugarSeason: '2025-26',
      formData: { check1: true },
      p2Json: [{ data: "payload" }]
    });

    const savedDraft = await draft.save();
    expect(savedDraft.month).toBe('December');
    expect(savedDraft.p2Json[0].data).toBe('payload');
  });

  test('Submission model persists all fields including request and response data', async () => {
    const userId = new mongoose.Types.ObjectId();
    const submission = new Submission({
      userId,
      formData: { sugarSeason: '2025-26', month: 'October', caneCrushedMonth: '1000' },
      p2Json: [{ approvalId: 'M009_D001_A076', forms: [] }],
      apiResponse: { status: '200', message: 'Success', data: { id: 'ABC123' } },
      statusCode: 200,
      sugarSeason: '2025-26',
      month: 'October'
    });

    const saved = await submission.save();

    expect(saved._id).toBeDefined();
    expect(saved.userId.toString()).toBe(userId.toString());
    expect(saved.statusCode).toBe(200);
    expect(saved.sugarSeason).toBe('2025-26');
    expect(saved.month).toBe('October');
    expect(saved.p2Json[0].approvalId).toBe('M009_D001_A076');
    expect(saved.apiResponse.message).toBe('Success');
    expect(saved.formData.caneCrushedMonth).toBe('1000');
    expect(saved.createdAt).toBeDefined();
    expect(saved.updatedAt).toBeDefined();
  });

  test('Submission enforces required fields userId, formData, p2Json, apiResponse, statusCode', async () => {
    const incomplete = new Submission({
      formData: { month: 'January' }
    });

    let error = null;
    try {
      await incomplete.save();
    } catch (err) {
      error = err;
    }

    expect(error).not.toBeNull();
    expect(error.name).toBe('ValidationError');
    expect(error.errors.userId).toBeDefined();
    expect(error.errors.apiResponse).toBeDefined();
    expect(error.errors.statusCode).toBeDefined();
  });

  test('Submission defaults sugarSeason and month to empty strings', async () => {
    const submission = new Submission({
      userId: new mongoose.Types.ObjectId(),
      formData: { key: 'value' },
      p2Json: [{ data: 'test' }],
      apiResponse: { ok: true },
      statusCode: 200
    });

    const saved = await submission.save();
    expect(saved.sugarSeason).toBe('');
    expect(saved.month).toBe('');
  });
});
