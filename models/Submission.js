const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // What was sent to the NSWS API
  formData: { type: mongoose.Schema.Types.Mixed, required: true },
  p2Json: { type: mongoose.Schema.Types.Mixed, required: true },

  // What came back from the NSWS API
  apiResponse: { type: mongoose.Schema.Types.Mixed, required: true },
  statusCode: { type: Number, required: true },

  // NSWS acknowledgement reference ("SWSID_PlantCode_Month_UnixEpochNumber").
  // Proof the filing was recorded - keep it for audit and for support queries.
  uniqueId: { type: String, default: '' },

  // Denormalized for display
  sugarSeason: { type: String, default: '' },
  month: { type: String, default: '' }
}, { timestamps: true });

// Efficient per-user queries sorted by most recent first
submissionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Submission', submissionSchema);
