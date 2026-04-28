import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const app = express();
const PORT = process.env.PORT || 3001;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://my-app-frontend-neon.vercel.app/"
  ],
  credentials: true
}));
app.use(express.json());

// Initialize Neon PostgreSQL client
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Neon
});

// Connect to database
client.connect((err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Connected to Neon PostgreSQL');
    syncAllAuth0Users();
  }
});

// Sync all Auth0 users to Neon (runs on startup)
async function syncAllAuth0Users() {
  try {
    console.log('Syncing Auth0 users to database...');

    const tokenRes = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.AUTH0_M2M_CLIENT_ID,
        client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
        audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials'
      })
    });

    if (!tokenRes.ok) {
      console.error('Failed to get Auth0 token:', await tokenRes.json());
      return;
    }

    const { access_token } = await tokenRes.json();

    const usersRes = await fetch(`https://${process.env.AUTH0_DOMAIN}/api/v2/users?per_page=100&page=0`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!usersRes.ok) {
      console.error('Failed to fetch Auth0 users:', await usersRes.json());
      return;
    }

    const auth0Users = await usersRes.json();

    for (const u of auth0Users) {
      await client.query(
        `INSERT INTO users (auth0_id, name, email)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET auth0_id = EXCLUDED.auth0_id,
               name = EXCLUDED.name,
               updated_at = CURRENT_TIMESTAMP`,
        [u.user_id, u.name || u.nickname || u.email, u.email]
      );
    }

    console.log(`Synced ${auth0Users.length} Auth0 user(s) to database`);
  } catch (error) {
    console.error('Error syncing Auth0 users on startup:', error.message);
  }
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Backend is running' });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await client.query('SELECT NOW()');
    res.json({
      status: 'Database connected',
      timestamp: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Database error',
      error: error.message
    });
  }
});

// Initialize database (runs init-db.sql)
app.post('/api/init-db', async (req, res) => {
  try {
    const sqlFile = path.join(__dirname, 'init-db.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    await client.query(sql);
    res.json({ status: 'Database initialized successfully' });
  } catch (error) {
    res.status(500).json({
      status: 'Database initialization error',
      error: error.message
    });
  }
});

// ===== USER ENDPOINTS =====

// Sync all Auth0 users into Neon database (run once to backfill)
app.post('/api/auth/sync-all-users', async (req, res) => {
  try {
    // Step 1: Get a Management API token
    const tokenRes = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: process.env.AUTH0_M2M_CLIENT_ID,
        client_secret: process.env.AUTH0_M2M_CLIENT_SECRET,
        audience: `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
        grant_type: 'client_credentials'
      })
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.json();
      return res.status(500).json({ error: 'Failed to get Auth0 token', details: err });
    }

    const { access_token } = await tokenRes.json();

    // Step 2: Fetch all users from Auth0
    const usersRes = await fetch(`https://${process.env.AUTH0_DOMAIN}/api/v2/users?per_page=100&page=0`, {
      headers: { Authorization: `Bearer ${access_token}` }
    });

    if (!usersRes.ok) {
      const err = await usersRes.json();
      return res.status(500).json({ error: 'Failed to fetch Auth0 users', details: err });
    }

    const auth0Users = await usersRes.json();

    // Step 3: Upsert each user into Neon
    const results = [];
    for (const u of auth0Users) {
      const result = await client.query(
        `INSERT INTO users (auth0_id, name, email)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE
           SET auth0_id = EXCLUDED.auth0_id,
               name = EXCLUDED.name,
               updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [u.user_id, u.name || u.nickname || u.email, u.email]
      );
      results.push(result.rows[0]);
    }

    res.json({
      status: 'All users synced',
      count: results.length,
      users: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Sync or create user from Auth0 (called after login)
app.post('/api/auth/sync-user', async (req, res) => {
  try {
    const { auth0_id, name, email } = req.body;

    if (!auth0_id || !email) {
      return res.status(400).json({ error: 'auth0_id and email are required' });
    }

    // Upsert user by email
    const result = await client.query(
      `INSERT INTO users (auth0_id, name, email)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
         SET auth0_id = EXCLUDED.auth0_id,
             name = EXCLUDED.name,
             updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [auth0_id, name, email]
    );

    res.status(201).json({
      status: 'User synced',
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error syncing user',
      error: error.message
    });
  }
});

// Create a new user
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const result = await client.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, password || '']
    );

    res.status(201).json({
      status: 'User created',
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error creating user',
      error: error.message
    });
  }
});

// Get a specific user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.query('SELECT * FROM users WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      status: 'User retrieved',
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error retrieving user',
      error: error.message
    });
  }
});

// Get user by auth0_id
app.get('/api/users/auth0/:auth0_id', async (req, res) => {
  try {
    const { auth0_id } = req.params;
    const result = await client.query('SELECT id, auth0_id, name, email, created_at FROM users WHERE auth0_id = $1', [auth0_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      status: 'User retrieved',
      user: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error retrieving user',
      error: error.message
    });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const result = await client.query('SELECT id, name, email, created_at FROM users ORDER BY created_at DESC');
    res.json({
      status: 'Users retrieved',
      users: result.rows
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error retrieving users',
      error: error.message
    });
  }
});

// ===== TASK ENDPOINTS =====

// Create a new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { user_id, title, description, status, due_date } = req.body;

    if (!user_id || !title) {
      return res.status(400).json({ error: 'user_id and title are required' });
    }

    const result = await client.query(
      'INSERT INTO tasks (user_id, title, description, status, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user_id, title, description || '', status || 'pending', due_date || null]
    );

    res.status(201).json({
      status: 'Task created',
      task: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error creating task',
      error: error.message
    });
  }
});

// Get all tasks (including tasks created by other users)
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await client.query(
      `SELECT tasks.*, users.name AS user_name
       FROM tasks
       JOIN users ON tasks.user_id = users.id
       ORDER BY tasks.created_at DESC`
    );

    res.json({
      status: 'Tasks retrieved',
      tasks: result.rows
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error retrieving tasks',
      error: error.message
    });
  }
});

// Get all tasks for a specific user
app.get('/api/tasks/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await client.query(
      'SELECT * FROM tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json({
      status: 'Tasks retrieved',
      tasks: result.rows
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error retrieving tasks',
      error: error.message
    });
  }
});

// Get a specific task by ID
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.query('SELECT * FROM tasks WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      status: 'Task retrieved',
      task: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error retrieving task',
      error: error.message
    });
  }
});

// Update a task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, due_date } = req.body;

    const result = await client.query(
      'UPDATE tasks SET title = COALESCE($1, title), description = COALESCE($2, description), status = COALESCE($3, status), due_date = COALESCE($4, due_date), updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
      [title, description, status, due_date, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      status: 'Task updated',
      task: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error updating task',
      error: error.message
    });
  }
});

// Delete a task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await client.query('DELETE FROM tasks WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json({
      status: 'Task deleted',
      task: result.rows[0]
    });
  } catch (error) {
    res.status(500).json({
      status: 'Error deleting task',
      error: error.message
    });
  }
});

// ===== GEMINI ENDPOINTS =====

// Generate task suggestions using Gemini
app.post('/api/gemini/generate-tasks', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const fullPrompt = `Generate 3-5 task suggestions based on this description: "${prompt}". 
    Return them as a JSON array of objects with "title" and "description" fields. 
    Make the tasks actionable and specific.`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    const text = response.text();

    // Try to parse the response as JSON
    try {
      const suggestions = JSON.parse(text);
      res.json({
        status: 'Task suggestions generated',
        suggestions: suggestions
      });
    } catch (parseError) {
      // If not valid JSON, return the text
      res.json({
        status: 'Task suggestions generated',
        suggestions: text
      });
    }
  } catch (error) {
    console.error('Gemini API error:', error);
    
    // Check if it's a quota exceeded error - multiple ways Google API can report this
    const errorStr = error.toString().toLowerCase();
    const errorMsg = (error.message || '').toLowerCase();
    
    // Check for rate limit or quota errors
    if (
      errorStr.includes('429') || 
      errorMsg.includes('429') ||
      errorStr.includes('quota') || 
      errorMsg.includes('quota') ||
      errorStr.includes('rate limit') ||
      errorMsg.includes('rate limit') ||
      errorStr.includes('too many requests') ||
      errorMsg.includes('too many requests')
    ) {
      return res.status(429).json({
        status: 'Quota exceeded',
        error: 'AI service quota exceeded. Please try again later or upgrade your API plan.',
        retryAfter: 60 // seconds
      });
    }
    
    res.status(500).json({
      status: 'Error generating task suggestions',
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend ready on http://localhost:${PORT}`);
});
