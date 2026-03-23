const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const TransactionHistory = require("../models/TransactionHistory");
const User = require("../models/User");

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function buildUtcDayRange(dateStr) {
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date value");
  }

  return { start, end };
}

function buildUtcMonthRange(year, month) {
  const y = parseInt(year, 10);
  const m = parseInt(month, 10);

  if (isNaN(y) || isNaN(m) || m < 1 || m > 12) {
    throw new Error("Invalid month/year");
  }

  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  return { start, end };
}

function buildUtcYearRange(year) {
  const y = parseInt(year, 10);

  if (isNaN(y)) {
    throw new Error("Invalid year");
  }

  const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));

  return { start, end };
}

// GET /api/transactions/user/:userId
// Supported query:
// ?date=YYYY-MM-DD
// ?from=YYYY-MM-DD&to=YYYY-MM-DD
// ?month=MM&year=YYYY
// ?year=YYYY
router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;
  const { date, from, to, month, year } = req.query;
  const filter = {};

  // convert userId safely
  if (mongoose.Types.ObjectId.isValid(userId)) {
    filter.user_id = new mongoose.Types.ObjectId(userId);
  } else {
    filter.user_id = userId;
  }

  try {
    // 1) Lọc theo đúng 1 ngày
    if (date) {
      if (!isValidDateString(date)) {
        return res
          .status(400)
          .json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }

      const { start, end } = buildUtcDayRange(date);
      filter.transaction_date = { $gte: start, $lte: end };
    }

    // 2) Lọc theo khoảng thời gian from -> to
    else if (from || to) {
      if (!from || !to) {
        return res.status(400).json({
          message: "Both 'from' and 'to' are required. Use YYYY-MM-DD",
        });
      }

      if (!isValidDateString(from) || !isValidDateString(to)) {
        return res.status(400).json({
          message: "Invalid from/to format. Use YYYY-MM-DD",
        });
      }

      const fromRange = buildUtcDayRange(from);
      const toRange = buildUtcDayRange(to);

      if (fromRange.start > toRange.end) {
        return res.status(400).json({
          message: "'from' must be less than or equal to 'to'",
        });
      }

      filter.transaction_date = {
        $gte: fromRange.start,
        $lte: toRange.end,
      };
    }

    // 3) Lọc theo tháng/năm
    else if (month && year) {
      const { start, end } = buildUtcMonthRange(year, month);
      filter.transaction_date = { $gte: start, $lte: end };
    }

    // 4) Lọc theo năm
    else if (year) {
      const { start, end } = buildUtcYearRange(year);
      filter.transaction_date = { $gte: start, $lte: end };
    }

    const history = await TransactionHistory.find(filter)
      .populate("user_id", "name email")
      .populate("category_id", "name")
      .sort({ transaction_date: -1 });

    return res.json(history);
  } catch (err) {
    console.error("Error fetching transaction history:", err);

    if (
      err.message === "Invalid date value" ||
      err.message === "Invalid month/year" ||
      err.message === "Invalid year"
    ) {
      return res.status(400).json({ message: err.message });
    }

    return res
      .status(500)
      .json({ message: "Server error fetching transaction history" });
  }
});

// Lấy toàn bộ lịch sử giao dịch của 1 nhóm (mới nhất trước)
// GET /api/transactions/group/:groupId
// Supported query:
// ?date=YYYY-MM-DD
// ?from=YYYY-MM-DD&to=YYYY-MM-DD
// ?month=MM&year=YYYY
// ?year=YYYY
router.get("/group/:groupId", async (req, res) => {
  const { groupId } = req.params;
  const { date, from, to, month, year } = req.query;
  const filter = {};

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    return res.status(400).json({ message: "ID nhóm không hợp lệ" });
  }

  filter.group_id = new mongoose.Types.ObjectId(groupId);

  try {
    // 1) Lọc theo đúng 1 ngày
    if (date) {
      if (!isValidDateString(date)) {
        return res
          .status(400)
          .json({ message: "Invalid date format. Use YYYY-MM-DD" });
      }

      const { start, end } = buildUtcDayRange(date);
      filter.transaction_date = { $gte: start, $lte: end };
    }

    // 2) Lọc theo khoảng thời gian
    else if (from || to) {
      if (!from || !to) {
        return res.status(400).json({
          message: "Both 'from' and 'to' are required. Use YYYY-MM-DD",
        });
      }

      if (!isValidDateString(from) || !isValidDateString(to)) {
        return res.status(400).json({
          message: "Invalid from/to format. Use YYYY-MM-DD",
        });
      }

      const fromRange = buildUtcDayRange(from);
      const toRange = buildUtcDayRange(to);

      if (fromRange.start > toRange.end) {
        return res.status(400).json({
          message: "'from' must be less than or equal to 'to'",
        });
      }

      filter.transaction_date = {
        $gte: fromRange.start,
        $lte: toRange.end,
      };
    }

    // 3) Lọc theo tháng/năm
    else if (month && year) {
      const { start, end } = buildUtcMonthRange(year, month);
      filter.transaction_date = { $gte: start, $lte: end };
    }

    // 4) Lọc theo năm
    else if (year) {
      const { start, end } = buildUtcYearRange(year);
      filter.transaction_date = { $gte: start, $lte: end };
    }

    const history = await TransactionHistory.find(filter)
      .populate("user_id", "name email")
      .populate("category_id", "name")
      .sort({ transaction_date: -1 });

    return res.json(history);
  } catch (err) {
    console.error("Error fetching group transaction history:", err);

    if (
      err.message === "Invalid date value" ||
      err.message === "Invalid month/year" ||
      err.message === "Invalid year"
    ) {
      return res.status(400).json({ message: err.message });
    }

    return res.status(500).json({
      message: "Lỗi máy chủ khi lấy lịch sử giao dịch nhóm",
    });
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