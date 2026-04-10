const mongoose = require('mongoose');

const draftSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  formData: { type: mongoose.Schema.Types.Mixed, required: true },
  p2Json: { type: mongoose.Schema.Types.Mixed, required: true },

  // Denormalized for display without parsing formData
  sugarSeason: { type: String, default: '' },
  month: { type: String, default: '' }
}, { timestamps: true });

// Compound index for efficient per-user queries sorted by recency
draftSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('Draft', draftSchema);
