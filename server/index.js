require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const authRouter = require("./routes/auth");

const withdrawRouter = require("./routes/withdraw");
const adminStatsRouter = require("./routes/admin/stats");
const groupRouter = require("./routes/group");
const spendingLimitRouter = require("./routes/spendingLimit");
const adminCategoryRouter = require("./routes/admin/category");
const adminUserRouter = require("./routes/admin/user");
const transactionHistoryRouter = require("./routes/TransactionHistory");
const userRoutes = require("./routes/admin/userRoutes");
//const notificationRouter = require("./routes/notification");
const app = express();

// Đảm bảo bật CORS trước khi xử lý các middleware khác
app.use(cors());

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || "");
    console.log("✅ Kết nối MongoDB thành công");
  } catch (error) {
    console.error("❌ Lỗi kết nối MongoDB:", error);
    process.exit(1);
  }
};

connectDB();

app.use(express.json({ limit: '10mb' })); // ✅ để xử lý req.body với giới hạn 10MB

app.use("/api/auth", authRouter); // ✅ sử dụng route

app.use("/api/withdraw", withdrawRouter);

app.use("/api/group", groupRouter);
// THÊM MIDDLEWARE DEBUG Ở ĐÂY
app.use(
  "/api/group",
  (req, res, next) => {
    console.log(">>> /api/group middleware HIT:", req.method, req.url);
    next();
  },
  groupRouter
);

app.use("/api/spending-limit", spendingLimitRouter);
app.use("/api/admin/categories", adminCategoryRouter);
app.use("/api/admin/users", adminUserRouter);
app.use("/api/transactions", transactionHistoryRouter);
//
app.use("/api/admin", userRoutes); // Sử dụng userRoutes cho các route admin
//
app.use("/api/admin", adminStatsRouter);
//app.use("/api", notificationRouter);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});
