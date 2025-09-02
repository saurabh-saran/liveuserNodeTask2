const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
require("dotenv").config();


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  // Render/Railway पर भी WebSocket सुरक्षित रहे
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public"))); // ✅ public serve

// ---------- MongoDB ----------
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/nodetask"; // local fallback

mongoose
  .connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 })
  .then(() => console.log("✅ MongoDB Connected:", MONGODB_URI))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

// ---------- User Schema ----------
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    username: String,
    email: { type: String, required: true, unique: true },
    mobile: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    country: { type: String, required: true },
    userId: { type: String, required: true, unique: true }, // unique login identifier
    password: { type: String, required: true },
    isOnline: { type: Boolean, default: true } // Live list right-side status
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);

// ---------- Routes ----------
app.post("/register", async (req, res) => {
  try {
    const { name, username, email, mobile, city, state, country, userId, password } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "User ID is required" });
    }

    const newUser = new User({
      name,
      username,
      email,
      mobile,
      city,
      state,
      country,
      userId,
      password,
      isOnline: true
    });

    await newUser.save();

    // Live update for viewers
    io.to("live_users").emit("newUser", {
      name: newUser.name,
      email: newUser.email,
      isOnline: true
    });

    res.status(201).send("User Registered Successfully");
  } catch (err) {
    console.error("❌ Error saving user:", err);
    if (err.code === 11000) {
      // unique constraint (email/userId) violation
      return res.status(409).send("Duplicate email or userId");
    }
    res.status(500).send("Error: " + (err.message || "Unknown error"));
  }
});

app.get("/users", async (_req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 });
    res.json(users);
  } catch {
    res.status(500).send("Error fetching users");
  }
});

app.get("/user/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email });
    if (user) return res.json(user);
    res.status(404).send("User not found");
  } catch {
    res.status(500).send("Error fetching user details");
  }
});

// Health check (Render/Railway)
app.get("/healthz", (_req, res) => res.send("ok"));

// ---------- Socket.io ----------
io.on("connection", (socket) => {
  console.log("⚡ New client connected:", socket.id);
  socket.join("live_users");

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

// ---------- Start ----------
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
