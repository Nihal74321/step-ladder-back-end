const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { User, History, Leaderboard } = require('./models');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || '123456789'; //!!!CHANGETHIS!!!!!!

app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

mongoose.connect('mongodb+srv://30075680:Ironman0705@cluster0.i7xuzqv.mongodb.net/stepladder')
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Connection Error:', err));

const getCurrentWeek = () => {
  const startOfSeason = new Date('2025-10-10T00:00:00+13:00');
  const now = new Date();
  const diffTime = now.getTime() - startOfSeason.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const weeksPassed = Math.floor(diffDays / 7);
  
  return Math.min(Math.max(weeksPassed + 1, 1), 10);
};

const calculateTrend = (currentRank, previousRank) => {
  if (!previousRank) return 0;
  if (currentRank < previousRank) return 1;
  if (currentRank > previousRank) return -1;
  return 0;
};

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }
  
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

const generateTag = () => Math.random().toString(36).substring(2, 7);

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      uuid: uuidv4(),
      tag: generateTag(),
      username,
      email,
      password: hashedPassword
    });
    
    await user.save();
    const token = jwt.sign({ uuid: user.uuid }, JWT_SECRET);
    
    res.status(201).json({ 
      success: true, 
      data: { user: { ...user.toObject(), password: undefined }, token }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email });
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ uuid: user.uuid }, JWT_SECRET);
    res.json({ 
      success: true, 
      data: { user: { ...user.toObject(), password: undefined }, token }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

app.get('/api/leaderboard/:week', async (req, res) => {
  try {
    const week = parseInt(req.params.week);
    let leaderboard = await Leaderboard.find({ week }).sort({ rank: 1 });
    
    if (leaderboard.length === 0) {
      await generateLeaderboardForWeek(week);
      leaderboard = await Leaderboard.find({ week }).sort({ rank: 1 });
    }
    
    res.json({ success: true, data: leaderboard });
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/users/:uuid', async (req, res) => {
  try {
    const user = await User.findOne({ uuid: req.params.uuid }).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const currentWeek = getCurrentWeek();
    const history = await History.find({ 
      user_uuid: req.params.uuid, 
      week: currentWeek 
    }).sort({ date: 1 });
    
    const weeklyStats = {
      dailyAverage: history.length > 0 ? Math.round(history.reduce((sum, h) => sum + h.steps, 0) / history.length) : 0,
      totalDistance: Math.round(history.reduce((sum, h) => sum + h.steps, 0) * 0.0008), // Rough km conversion
      estimatedTime: Math.round(history.reduce((sum, h) => sum + h.steps, 0) * 0.01), // Rough minutes
      weeklyData: history.map(h => ({
        date: h.date,
        steps: h.steps
      }))
    };
    
    res.json({ 
      success: true, 
      data: { 
        ...user.toObject(), 
        weeklyStats,
        history: history.slice(-7)
      } 
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/admin/users', auth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json({ success: true, data: users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/admin/users', auth, async (req, res) => {
  try {
    const { username, email, password, total_steps = 0, step_history = [] } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      uuid: uuidv4(),
      tag: generateTag(),
      username,
      email,
      password: hashedPassword,
      total_steps
    });
    
    await user.save();
    
    if (step_history && step_history.length > 0) {
      const historyEntries = step_history.map(entry => ({
        uuid: uuidv4(),
        user_uuid: user.uuid,
        date: new Date(entry.date),
        steps: entry.steps,
        week: getCurrentWeek()
      }));
      
      await History.insertMany(historyEntries);
    }
    
    await updateLeaderboardForUser(user);
    
    res.status(201).json({ 
      success: true, 
      data: { ...user.toObject(), password: undefined } 
    });
  } catch (error) {
    console.error('Add user error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

app.delete('/api/admin/users/:uuid', auth, async (req, res) => {
  try {
    const result = await User.deleteOne({ uuid: req.params.uuid });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await History.deleteMany({ user_uuid: req.params.uuid });
    await Leaderboard.deleteMany({ uuid: req.params.uuid });
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

async function generateLeaderboardForWeek(week) {
  try {
    const users = await User.find();
    const previousWeek = week - 1;
    
    const previousLeaderboard = await Leaderboard.find({ week: previousWeek });
    const previousRankings = {};
    previousLeaderboard.forEach(entry => {
      previousRankings[entry.uuid] = entry.rank;
    });
    
    const leaderboardEntries = [];
    
    for (const user of users) {
      const weekHistory = await History.find({ user_uuid: user.uuid, week });
      const totalSteps = weekHistory.reduce((sum, h) => sum + h.steps, 0);
      
      const dailyBreakdown = new Map();
      weekHistory.forEach(h => {
        const dateKey = h.date.toISOString().split('T')[0];
        dailyBreakdown.set(dateKey, h.steps);
      });
      
      if (totalSteps > 0) { 
        leaderboardEntries.push({
          uuid: user.uuid,
          username: user.username,
          tag: user.tag,
          total_steps: totalSteps,
          daily_breakdown: dailyBreakdown
        });
      }
    }
    
    leaderboardEntries.sort((a, b) => b.total_steps - a.total_steps);
    
    for (let i = 0; i < leaderboardEntries.length; i++) {
      const entry = leaderboardEntries[i];
      const currentRank = i + 1;
      const previousRank = previousRankings[entry.uuid];
      
      const leaderboardEntry = new Leaderboard({
        week,
        uuid: entry.uuid,
        username: entry.username,
        tag: entry.tag,
        total_steps: entry.total_steps,
        positions: previousRank ? [previousRank, currentRank] : [currentRank],
        rank: currentRank,
        trend: calculateTrend(currentRank, previousRank),
        daily_breakdown: entry.daily_breakdown
      });
      
      await leaderboardEntry.save();
    }
  } catch (error) {
    console.error('Generate leaderboard error:', error);
  }
}

async function updateLeaderboardForUser(user) {
  const currentWeek = getCurrentWeek();
  await generateLeaderboardForWeek(currentWeek);
}

app.post('/api/admin/populate-sample', auth, async (req, res) => {
  try {
    const sampleUsers = [
      { username: 'John G', email: 'john@test.com', total_steps: 99999 },
      { username: 'Sarah M', email: 'sarah@test.com', total_steps: 95432 },
      { username: 'Mike R', email: 'mike@test.com', total_steps: 87654 }
    ];
    
    const currentWeek = getCurrentWeek();
    
    for (const [index, userData] of sampleUsers.entries()) {
      const existingUser = await User.findOne({ email: userData.email });
      if (existingUser) continue;
      
      const hashedPassword = await bcrypt.hash('password123', 10);
      const uuid = uuidv4();
      const tag = generateTag();
      
      const user = await new User({
        uuid,
        tag,
        username: userData.username,
        email: userData.email,
        password: hashedPassword,
        total_steps: userData.total_steps
      }).save();
      
      const weekHistory = [];
      for (let day = 0; day < 7; day++) {
        const date = new Date();
        date.setDate(date.getDate() - day);
        const steps = Math.floor(Math.random() * 5000) + 10000;
        
        weekHistory.push({
          uuid: uuidv4(),
          user_uuid: uuid,
          date,
          steps,
          week: currentWeek
        });
      }
      
      await History.insertMany(weekHistory);
    }
    
    await Leaderboard.deleteMany({ week: currentWeek });
    await generateLeaderboardForWeek(currentWeek);
    
    res.json({ success: true, message: 'Sample data populated' });
  } catch (error) {
    console.error('Populate sample error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`JWT_SECRET is ${JWT_SECRET ? 'defined' : 'NOT DEFINED'}`);
});