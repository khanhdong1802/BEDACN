const express = require("express");
const router = express.Router();

const Income = require("../models/Income");
const Withdraw = require("../models/Withdraw");
const Expense = require("../models/Expense");
const TransactionHistory = require("../models/TransactionHistory");
const mongoose = require("mongoose");

// Hàm kiểm tra ObjectId hợp lệ
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// POST /api/withdraw
router.post("/", async (req, res) => {
  const { user_id, amount, source, note, category_id } = req.body;

  if (!user_id || !amount || !source) {
    return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
  }
  if (!isValidId(user_id)) {
    return res.status(400).json({ message: "user_id không hợp lệ" });
  }

  const amountNum = Number(amount);
  if (isNaN(amountNum) || amountNum <= 0) {
    return res.status(400).json({ message: "Số tiền không hợp lệ" });
  }

  try {
    // Kiểm tra số dư tài khoản trước khi rút
    const totalIncomeArr = await Income.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(user_id),
          status: "pending",
        },
      },
      {
        $group: { _id: null, total: { $sum: "$amount" } },
      },
    ]);
    const totalExpenseArr = await Expense.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(user_id),
        },
      },
      {
        $group: { _id: null, total: { $sum: "$amount" } },
      },
    ]);

    const income = totalIncomeArr[0]?.total || 0;
    const expense = totalExpenseArr[0]?.total || 0;
    const currentBalance = income - expense;

    if (currentBalance < amountNum) {
      return res.status(400).json({ message: "Số dư không đủ để rút" });
    }

    // 1. TẠO BẢN GHI TRONG COLLECTION "Withdraws"
    const withdraw = new Withdraw({
      user_id,
      amount: amountNum,
      source,
      note,
      category_id: category_id
        ? new mongoose.Types.ObjectId(category_id)
        : undefined,
    });

    await withdraw.save();

    // 2. TẠO BẢN GHI TRONG COLLECTION "Expenses"
    const newExpense = new Expense({
      user_id,
      amount: amountNum,
      source,
      note,
      created_at: new Date(),
      date: new Date(),
      category_id: category_id
        ? new mongoose.Types.ObjectId(category_id)
        : undefined,
    });

    await newExpense.save();

    // Ghi vào lịch sử giao dịch
    await TransactionHistory.create({
      transaction_type: "expense",
      amount: amountNum,
      transaction_date: new Date(),
      description: note || source || "Rút tiền",
      user_id,
      status: "completed",
      category_id: category_id
        ? new mongoose.Types.ObjectId(category_id)
        : null,
    });

    res.status(201).json({ message: "Rút tiền thành công", withdraw });
  } catch (err) {
    console.error("❌ Lỗi khi rút tiền:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

// GET /api/withdraw/balance/:userId
router.get("/balance/:userId", async (req, res) => {
  const userId = req.params.userId.trim();

  if (!isValidId(userId)) {
    return res.status(400).json({ message: "ID người dùng không hợp lệ" });
  }

  try {
    const totalIncome = await Income.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          status: "pending",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const totalExpense = await Expense.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    const income = totalIncome[0]?.total || 0;
    const expense = totalExpense[0]?.total || 0;

    res.json({ balance: income - expense });
  } catch (err) {
    console.error("❌ Lỗi khi tính balance:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

module.exports = router;
