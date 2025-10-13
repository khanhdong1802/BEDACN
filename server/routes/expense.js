const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Expense = require("../models/Expense");
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
// === API LẤY TỔNG CHI TIÊU CÁ NHÂN (Chỉ từ bảng Expense) ===
// GET /api/auth/expenses/personal/total/:userId
router.get("/expenses/personal/total/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID người dùng không hợp lệ." });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const expenseAggregation = await Expense.aggregate([
      { $match: { user_id: userObjectId } }, // Lấy tất cả chi tiêu cá nhân
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalUserExpenses = expenseAggregation[0]?.total || 0;
    res.json({ success: true, total: totalUserExpenses });
  } catch (err) {
    console.error("❌ Lỗi tính tổng chi tiêu cá nhân:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tính tổng chi tiêu cá nhân.",
    });
  }
});

// GET /api/expenses/personal/monthly-summary/:userId?month=YYYY-MM
router.get("/expenses/personal/monthly-summary/:userId", async (req, res) => {
  const { userId } = req.params;
  const { month } = req.query; // "2025-05"
  if (!userId || !month) {
    return res.status(400).json({ message: "Thiếu userId hoặc tháng" });
  }

  // Tính ngày đầu và cuối tháng
  const start = new Date(`${month}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);

  try {
    // Gom nhóm theo category
    const summary = await Expense.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          date: { $gte: start, $lt: end },
        },
      },
      {
        $group: {
          _id: "$category_id",
          total: { $sum: "$amount" },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: "$category",
      },
      {
        $project: {
          _id: 0,
          category_id: "$category._id",
          category_name: "$category.name",
          total: 1,
        },
      },
    ]);

    // Tổng chi tiêu tháng
    const total = summary.reduce((sum, item) => sum + item.total, 0);

    res.json({ total, summary });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Lỗi máy chủ khi tổng hợp chi tiêu tháng" });
  }
});
module.exports = router;