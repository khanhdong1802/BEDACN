const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const TransactionHistory = require("../models/TransactionHistory");
const User = require("../models/User");

// GET /api/transactions/user/:userId?date=YYYY-MM-DD
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { date } = req.query;
  let filter = { user_id: userId };
  if (date) {
    const start = new Date(date + "T00:00:00.000Z");
    const end = new Date(date + "T23:59:59.999Z");
    filter.transaction_date = { $gte: start, $lte: end };
  }
  try {
    const history = await TransactionHistory.find({ user_id: userId })
      .populate("user_id", "name email") // Lấy tên người thực hiện
      .populate("category_id", "name") // Lấy tên danh mục (nếu có)
      .sort({ transaction_date: -1 });
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: "Lỗi máy chủ khi lấy lịch sử giao dịch" });
  }
});

// Lấy toàn bộ lịch sử giao dịch của 1 nhóm (mới nhất trước)
router.get("/group/:groupId", async (req, res) => {
  const { groupId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ message: "ID nhóm không hợp lệ" });
  }
  try {
    const history = await TransactionHistory.find({ group_id: groupId })
      .populate("user_id", "name email")
      .sort({ transaction_date: -1 });
    res.json(history);
  } catch (err) {
    res
      .status(500)
      .json({ message: "Lỗi máy chủ khi lấy lịch sử giao dịch nhóm" });
  }
});

// Lấy chi tiết 1 giao dịch theo transaction_id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "ID giao dịch không hợp lệ" });
  }
  try {
    const transaction = await TransactionHistory.findById(id).populate(
      "user_id",
      "name email"
    );
    if (!transaction)
      return res.status(404).json({ message: "Không tìm thấy giao dịch" });
    res.json(transaction);
  } catch (err) {
    res.status(500).json({ message: "Lỗi máy chủ khi lấy chi tiết giao dịch" });
  }
});

// Thêm mới một giao dịch vào lịch sử
router.post("/", async (req, res) => {
  try {
    const {
      transaction_type,
      amount,
      transaction_date,
      description,
      user_id,
      status,
    } = req.body;
    if (!transaction_type || !amount || !user_id) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }
    const newTransaction = new TransactionHistory({
      transaction_type,
      amount,
      transaction_date,
      description,
      user_id,
      status,
    });
    await newTransaction.save();
    res.status(201).json(newTransaction);
  } catch (err) {
    res.status(500).json({ message: "Lỗi máy chủ khi thêm giao dịch" });
  }
});

module.exports = router;
