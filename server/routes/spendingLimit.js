const express = require("express");
const router = express.Router();
const SpendingLimit = require("../models/SpendingLimit");
// Hàm kiểm tra ObjectId hợp lệ
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
/* =====================================================
   POST /api/auth/spending-limits
   Tạo hạn mức mới
=====================================================*/
router.post("/spending-limits", async (req, res) => {
  const { user_id, amount, months, note } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({ message: "Thiếu user_id hoặc amount" });
  }

  try {
    // khi tạo mới → vô hiệu hoá hạn mức active cũ (nếu có)
    await SpendingLimit.updateMany(
      { user_id, active: true },
      { $set: { active: false } }
    );

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + (months || 1)); // mặc định 1 tháng

    const limit = new SpendingLimit({
      user_id,
      amount,
      months: months || 1,
      note,
      start_date: startDate,
      end_date: endDate,
      active: true,
    });

    await limit.save();
    res.status(201).json(limit);
  } catch (err) {
    console.error("❌ Lỗi tạo SpendingLimit:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
});

/* =====================================================
   GET /api/auth/spending-limits/:userId/current
   Lấy hạn mức đang active của user
=====================================================*/
router.get("/spending-limits/:userId/current", async (req, res) => {
  const { userId } = req.params;
  try {
    const current = await SpendingLimit.findOne({
      user_id: userId,
      active: true,
    });
    res.json(current || { message: "Chưa thiết lập hạn mức" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

/* (tuỳ chọn) Lấy history */
router.get("/spending-limits/:userId/history", async (req, res) => {
  const { userId } = req.params;
  try {
    const history = await SpendingLimit.find({ user_id: userId }).sort({
      start_date: -1,
    });
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
});
module.exports = router;