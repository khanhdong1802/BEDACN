require("dotenv").config();
const http = require("http");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");
const initSocket = require("./socket");

const chatRouter = require("./routes/chat");
const authRouter = require("./routes/auth");
const withdrawRouter = require("./routes/withdraw");
const adminStatsRouter = require("./routes/admin/stats");
const groupRouter = require("./routes/group");
const spendingLimitRouter = require("./routes/spendingLimit");
const adminCategoryRouter = require("./routes/admin/category");
const adminUserRouter = require("./routes/admin/user");
const transactionHistoryRouter = require("./routes/TransactionHistory");
const userRoutes = require("./routes/admin/userRoutes");
const chatbotRoutes = require("./routes/chatbot");

const app = express(); // 🔥 phải tạo app trước
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// 🔥 cho phép truy cập ảnh upload
app.use("/uploads", express.static("uploads"));

mongoose
  .connect(process.env.MONGO_URI || "")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

app.use("/api/auth", authRouter);
app.use("/api/withdraw", withdrawRouter);

app.use(
  "/api/group",
  (req, res, next) => {
    console.log(">>> /api/group middleware HIT:", req.method, req.url);
    next();
  },
  groupRouter
);

app.use("/api/message", chatRouter);
app.use("/api/spending-limit", spendingLimitRouter);
app.use("/api/admin/categories", adminCategoryRouter);
app.use("/api/admin/users", adminUserRouter);
app.use("/api/transactions", transactionHistoryRouter);
app.use("/api/admin", userRoutes);
app.use("/api/admin", adminStatsRouter);
app.use("/api/chatbot", chatbotRoutes);

const io = new Server(server, {
  cors: { origin: "*" },
});

initSocket(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server + Socket chạy tại http://localhost:${PORT}`);
});