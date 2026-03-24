const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  password: { type: String, required: true },

  // Access control — admin manually sets to true in MongoDB Atlas
  isApproved: { type: Boolean, default: false },

  // NSWS Constants
  approvalId: { type: String, required: true, default: 'M009_D001_A076' },
  swsId: { type: String, required: true },
  projectNumber: { type: String, required: true },

  // Sugar Mill Details
  undertakingName: { type: String, required: true },
  plantName: { type: String, required: true },
  plantCode: { type: String, required: true },
  state: { type: String, required: true },
  capacity: { type: String, required: true, default: '0' }
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
