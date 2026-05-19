const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const seedAdmin = require("./utils/seedAdmin");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:3002",
      process.env.CLIENT_URL,
    ].filter(Boolean),
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/otp", require("./routes/otp"));
app.use("/api/employee", require("./routes/employee"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/super-admin", require("./routes/superAdmin"));

app.get("/api/health", (req, res) => res.json({ status: "OK" }));

app.use((req, res) =>
  res.status(404).json({ success: false, message: "Route not found" }),
);
app.use((err, req, res, next) => {
  console.error("❌", err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("✅ MongoDB Connected");
    await seedAdmin();
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

  })
  .catch((err) => console.error("❌ MongoDB Error:", err));





