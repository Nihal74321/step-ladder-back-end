const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  uuid: { type: String, required: true, unique: true },
  tag: { type: String, required: true },
  username: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  total_steps: { type: Number, default: 0 },
  step_counter: {
    type: Map,
    of: [Number],
    default: new Map()
  },
  createdAt: { type: Date, default: Date.now }
});

const HistorySchema = new mongoose.Schema({
  uuid: { type: String, required: true },
  user_uuid: { type: String, required: true },
  date: { type: Date, required: true },
  steps: { type: Number, required: true },
  week: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

// Leaderboard Schema
const LeaderboardSchema = new mongoose.Schema({
  week: { type: Number, required: true },
  uuid: { type: String, required: true },
  username: { type: String, required: true },
  tag: { type: String, required: true },
  total_steps: { type: Number, required: true },
  positions: [{ type: Number }],
  rank: { type: Number, required: true },
  trend: { type: Number, default: 0 },
  daily_breakdown: {
    type: Map,
    of: Number,
    default: new Map()
  }
});

HistorySchema.index({ user_uuid: 1, date: 1 });
HistorySchema.index({ week: 1 });
LeaderboardSchema.index({ week: 1, rank: 1 });

module.exports = {
  User: mongoose.model('User', UserSchema),
  History: mongoose.model('History', HistorySchema),
  Leaderboard: mongoose.model('Leaderboard', LeaderboardSchema)
};