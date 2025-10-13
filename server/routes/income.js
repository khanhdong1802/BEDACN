const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Income = require("../models/Income");
const TransactionHistory = require("../models/TransactionHistory");
// Hàm kiểm tra ObjectId hợp lệ
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ========================
// POST /api/income
// ========================
router.post("/", async (req, res) => {
  const { user_id, amount, source, note, status } = req.body;

  if (!user_id || !amount || !source) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
  }

  try {
    // Lấy thời điểm thực tế tại server
    const now = new Date();

    const income = new Income({
      user_id,
      amount,
      source,
      received_date: now, // Lưu thời điểm thực tế
      note,
      status: status || "pending",
    });

    await income.save();

    // Thêm vào lịch sử giao dịch
    await TransactionHistory.create({
      transaction_type: "income",
      amount,
      transaction_date: now, // Lưu thời điểm thực tế
      description: note || source,
      user_id,
      status: status || "completed",
    });

    res.status(201).json({ message: "Thu nhập đã được lưu", income });
  } catch (err) {
    console.error("❌ Lỗi khi lưu thu nhập:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

// ========================
// GET /api/income/total/:userId
// ========================
router.get("/total/:userId", async (req, res) => {
  const rawUserId = req.params.userId;
  const userId = rawUserId.trim(); // loại bỏ \n, khoảng trắng thừa

  console.log("📌 Cleaned userId:", userId);

  try {
    const total = await Income.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          status: "pending",
        },
      },
      { $group: { _id: null, totalAmount: { $sum: "$amount" } } },
    ]);

    res.json({ total: total[0]?.totalAmount || 0 });
  } catch (err) {
    console.error("❌ Lỗi tính tổng thu nhập:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});
module.exports = router;
