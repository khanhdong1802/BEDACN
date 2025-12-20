const express = require("express");
const router = express.Router();
const TransactionHistory = require("../models/TransactionHistory");

// GET /api/transactions
router.get("/", async (req, res) => {
  try {
    const transactions = await TransactionHistory.find()
      .populate("user_id", "name email") // Populate user details
      .populate("category_id", "name") // Populate category details
      .sort({ transaction_date: -1 }); // Sort by date descending
    res.json(transactions);
  } catch (err) {
    console.error("Lỗi khi lấy danh sách giao dịch:", err);
    res
      .status(500)
      .json({ message: "Lỗi máy chủ khi lấy danh sách giao dịch" });
  }
});

// GET /api/transactions/:id
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const transaction = await TransactionHistory.findById(id)
      .populate("user_id", "name email")
      .populate("category_id", "name");
    if (!transaction) {
      return res.status(404).json({ message: "Không tìm thấy giao dịch" });
    }
    res.json(transaction);
  } catch (err) {
    console.error("Lỗi khi lấy chi tiết giao dịch:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi lấy chi tiết giao dịch" });
  }
});

// POST /api/transactions
router.post("/", async (req, res) => {
  const {
    transaction_type,
    amount,
    transaction_date,
    description,
    user_id,
    category_id,
  } = req.body;
  if (!transaction_type || !amount || !user_id) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
  }

  try {
    const newTransaction = new TransactionHistory({
      transaction_type,
      amount,
      transaction_date,
      description,
      user_id,
      category_id,
    });
    await newTransaction.save();
    res.status(201).json(newTransaction);
  } catch (err) {
    console.error("Lỗi khi thêm giao dịch:", err);
    res.status(500).json({ message: "Lỗi máy chủ khi thêm giao dịch" });
  }
});

module.exports = router;
