const express = require("express");
const router = express.Router();
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const Income = require("../models/Income");
const Expense = require("../models/Expense");
const User = require("../models/User");
const TransactionHistory = require("../models/TransactionHistory");
const { OAuth2Client } = require("google-auth-library");
const client = new OAuth2Client(
  "41306821288-t244srfpqp5dnp6d9i9skap2u4p89ccm.apps.googleusercontent.com"
);

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
//-------------------------------------------
router.post("/google", async (req, res) => {
  try {
    const { token } = req.body;

    const ticket = await client.verifyIdToken({
      idToken: token,
      audience:
        "41306821288-t244srfpqp5dnp6d9i9skap2u4p89ccm.apps.googleusercontent.com",
    });

    const payload = ticket.getPayload();
    const { email, name, picture, sub: googleId } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        name,
        avatar: picture,
        googleId,
        provider: "google",
      });
    }
    const accessToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Google login success",
      accessToken,
      user,
    });
  } catch (error) {
    console.error("Google auth error:", error.message, error.stack);
    if (error.response?.data) {
      console.error("Google response data:", error.response.data);
    }
    return res
      .status(401)
      .json({ message: error.message || "Invalid Google Token" });
  }
});
// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Publiczz
router.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  // Kiểm tra đầu vào
  if (!name || !email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng điền đầy đủ thông tin" });
  }

  try {
    // Kiểm tra email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "Email đã được sử dụng" });
    }

    // Mã hóa mật khẩu với argon2
    const hashedPassword = await argon2.hash(password);

    // Tạo người dùng mới
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
    });

    await newUser.save();
    // Tạo token JWT
    const accessToken = jwt.sign(
      { userId: newUser._id },
      process.env.ACCESS_TOKEN_SECRET
    );
    res
      .status(201)
      .json({ success: true, message: "Đăng ký thành công", accessToken });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Lỗi máy chủ" });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
// Xử lý đăng nhập với kiểm tra quyền admin và khóa tài khoản
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Kiểm tra thiếu email/password
  if (!email || !password) {
    console.log("LOGIN ERROR: missing email/password", { email, password });
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng điền đầy đủ thông tin" });
  }

  try {
    const user = await User.findOne({ email });

    // Không tìm thấy user
    if (!user) {
      console.log("LOGIN ERROR: user not found", email);
      return res
        .status(400)
        .json({ success: false, message: "Email không đúng" });
    }

    // Nếu tài khoản dùng Google → không cho đăng nhập bằng mật khẩu
    if (user.provider === "google") {
      console.log("LOGIN ERROR: Google account cannot login with password");
      return res.status(400).json({
        success: false,
        message: "Tài khoản này đăng nhập bằng Google, không dùng mật khẩu",
      });
    }

    // Tài khoản bị khóa
    if (user.locked) {
      console.log("LOGIN ERROR: user locked", user._id);
      return res
        .status(400)
        .json({ success: false, message: "Tài khoản bị khóa" });
    }

    // Kiểm tra mật khẩu
    const passwordValid = await argon2.verify(user.password, password);

    if (!passwordValid) {
      console.log("LOGIN ERROR: wrong password", email);
      return res
        .status(400)
        .json({ success: false, message: "Mật khẩu không đúng" });
    }

    // Tạo token sau khi đăng nhập thành công
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.ACCESS_TOKEN_SECRET
    );

    return res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      accessToken,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        locked: user.locked,
      },
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ" });
  }
});

// ========================
// POST /api/income
// ========================
router.post("/Income", async (req, res) => {
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
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId; // Lấy ObjectId từ mongoose

router.get("/income/total/:userId", async (req, res) => {
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

// ========================
router.get("/balance/:userId", async (req, res) => {
  const userId = req.params.userId.trim();

  console.log("userId nhận được:", userId);

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

// ========================
// PUT /api/auth/update/:id
// ========================
router.put("/update/:id", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const updateData = { name, email };
    // Nếu có mật khẩu mới thì mã hóa rồi cập nhật
    if (password && password.trim() !== "") {
      updateData.password = await argon2.hash(password);
    }

    // Kiểm tra email đã tồn tại cho user khác chưa (nếu đổi email)
    if (email) {
      const existing = await User.findOne({
        email,
        _id: { $ne: req.params.id },
      });
      if (existing) {
        return res
          .status(400)
          .json({ message: "Email đã được sử dụng bởi tài khoản khác" });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    res.json({
      message: "Cập nhật thành công",
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
      },
    });
  } catch (err) {
    console.error("❌ Lỗi cập nhật user:", err);
    res.status(500).json({ message: "Có lỗi xảy ra khi cập nhật" });
  }
});

// === API MỚI: LẤY SỐ DƯ CÁ NHÂN THỰC TẾ (THU - CHI) ===
// GET /api/auth/balance/:userId
router.get("/balance/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!isValidId(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID người dùng không hợp lệ." });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // 1. Tính tổng thu nhập dương đã được xác nhận
    const incomeData = await Income.aggregate([
      {
        $match: {
          user_id: userObjectId,
          amount: { $gte: 0 }, // Chỉ lấy các khoản thu nhập (dương hoặc bằng 0)
          status: "confirmed", // Chỉ tính các khoản đã xác nhận
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalPositiveIncome = incomeData[0]?.total || 0;

    // 2. Tính tổng các khoản chi tiêu cá nhân trực tiếp (từ bảng Expense)
    // Giả định Expense luôn là số dương và thể hiện một khoản chi
    const personalExpensesData = await Expense.aggregate([
      { $match: { user_id: userObjectId } }, // Không cần status nếu mọi Expense đều là đã chi
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalPersonalExpenses = personalExpensesData[0]?.total || 0;

    // 3. Tính tổng các khoản tiền cá nhân đã dùng để nạp vào quỹ nhóm
    // (Đây là các bản ghi Income âm, với source là "group_contribution" và status là "completed" hoặc "confirmed_debit")
    const contributionsToGroupData = await Income.aggregate([
      {
        $match: {
          user_id: userObjectId,
          source: "group_contribution", // Hoặc một định danh khác bạn dùng khi nạp tiền vào nhóm
          amount: { $lt: 0 }, // Chỉ lấy các khoản âm
          status: "completed", // Hoặc "confirmed_debit" - trạng thái cho khoản trừ này
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } }, // total này sẽ là số âm
    ]);
    // totalContributionsToGroup sẽ là tổng các số âm, ví dụ -50000, -20000.
    // Hoặc bạn có thể lấy Math.abs() nếu muốn cộng dồn các khoản chi.
    // Để tính số dư, chúng ta cần giá trị âm này.
    const totalNegativeAdjustmentsFromGroupContributions =
      contributionsToGroupData[0]?.total || 0;

    // Tính số dư cuối cùng
    // Số dư = Tổng thu nhập dương - Tổng chi tiêu cá nhân trực tiếp - Tổng (giá trị tuyệt đối của) các khoản tiền cá nhân nạp vào nhóm
    // Hoặc: Số dư = Tổng thu nhập dương + (Tổng các khoản Income âm đã completed/confirmed_debit) - Tổng chi tiêu Expense
    const currentBalance =
      totalPositiveIncome +
      totalNegativeAdjustmentsFromGroupContributions -
      totalPersonalExpenses;

    console.log(
      `BALANCE API for ${userId}: PositiveIncome ${totalPositiveIncome}, NegativeAdjustments ${totalNegativeAdjustmentsFromGroupContributions}, PersonalExpenses ${totalPersonalExpenses}, FinalBalance ${currentBalance}`
    );

    res.json({ success: true, balance: currentBalance });
  } catch (err) {
    console.error("❌ Lỗi khi tính balance cá nhân:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi máy chủ khi tính balance cá nhân.",
    });
  }
});

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

// ========================

router.get("/stats/overview/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID người dùng không hợp lệ." });
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const fmt2 = (n) => Math.round(n * 100) / 100; // 2 decimals

    // helper percent change (returns numeric rounded to 2 decimals)
    const percentChangeValue = (current, previous) => {
      const c = Number(current) || 0;
      const p = Number(previous) || 0;
      if (p === 0) return c === 0 ? 0 : 100;
      const raw = ((c - p) / Math.abs(p)) * 100;
      return fmt2(raw);
    };
    const percentChangeString = (current, previous) => {
      const v = percentChangeValue(current, previous);
      return `${v > 0 ? "+" : ""}${v}%`;
    };

    // --- Spending today (from TransactionHistory) ---
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date();
    endToday.setHours(23, 59, 59, 999);

    const startYesterday = new Date(startToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    const endYesterday = new Date(startYesterday);
    endYesterday.setHours(23, 59, 59, 999);

    const todayAgg = await TransactionHistory.aggregate([
      {
        $match: {
          user_id: userObjectId,
          transaction_type: "expense",
          transaction_date: { $gte: startToday, $lte: endToday },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const yesterdayAgg = await TransactionHistory.aggregate([
      {
        $match: {
          user_id: userObjectId,
          transaction_type: "expense",
          transaction_date: { $gte: startYesterday, $lte: endYesterday },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const spendingToday = todayAgg[0]?.total || 0;
    const spendingYesterday = yesterdayAgg[0]?.total || 0;

    // --- Total balance (all incomes - all expenses) ---
    const totalIncomeAgg = await Income.aggregate([
      {
        $match: {
          user_id: userObjectId,
          amount: { $gte: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalExpenseAgg = await Expense.aggregate([
      { $match: { user_id: userObjectId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalIncomeAll = totalIncomeAgg[0]?.total || 0;
    const totalExpenseAll = totalExpenseAgg[0]?.total || 0;
    const balance = totalIncomeAll - totalExpenseAll;

    // Spending today percent relative to balance (2 decimals). If balance <=0 => null
    let spendingTodayPercent = null;
    if (balance > 0) {
      spendingTodayPercent = fmt2((spendingToday / balance) * 100);
    } else {
      spendingTodayPercent = null;
    }

    // --- Savings this month and last month ---
    const now = new Date();
    const startThisMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      0,
      0,
      0,
      0
    );
    const startNextMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      1,
      0,
      0,
      0,
      0
    );
    const startLastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1,
      0,
      0,
      0,
      0
    );

    const incomeThisMonthAgg = await Income.aggregate([
      {
        $match: {
          user_id: userObjectId,
          received_date: { $gte: startThisMonth, $lt: startNextMonth },
          amount: { $gte: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const expenseThisMonthAgg = await Expense.aggregate([
      {
        $match: {
          user_id: userObjectId,
          date: { $gte: startThisMonth, $lt: startNextMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const incomeThisMonth = incomeThisMonthAgg[0]?.total || 0;
    const expenseThisMonth = expenseThisMonthAgg[0]?.total || 0;
    const savingsThisMonth = incomeThisMonth - expenseThisMonth;

    const incomeLastMonthAgg = await Income.aggregate([
      {
        $match: {
          user_id: userObjectId,
          received_date: { $gte: startLastMonth, $lt: startThisMonth },
          amount: { $gte: 0 },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const expenseLastMonthAgg = await Expense.aggregate([
      {
        $match: {
          user_id: userObjectId,
          date: { $gte: startLastMonth, $lt: startThisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const incomeLastMonth = incomeLastMonthAgg[0]?.total || 0;
    const expenseLastMonth = expenseLastMonthAgg[0]?.total || 0;
    const savingsLastMonth = incomeLastMonth - expenseLastMonth;

    // Savings percent change vs last month (string with +/-, 2 decimals)
    const savingsChangeValue = percentChangeValue(
      savingsThisMonth,
      savingsLastMonth
    );
    const savingsChange = `${
      savingsChangeValue > 0 ? "+" : ""
    }${savingsChangeValue}%`;
    const savingsTrendUp = savingsThisMonth >= savingsLastMonth;

    // Spending change vs yesterday (keep existing behavior)
    const spendingChangeValue = percentChangeValue(
      spendingToday,
      spendingYesterday
    );
    const spendingChange = `${
      spendingChangeValue > 0 ? "+" : ""
    }${spendingChangeValue}%`;
    const spendingTrendUp = spendingToday <= spendingYesterday; // chi tiêu giảm => tốt

    // budgetRemaining percent of this month's income (0..100 or null)
    let budgetPercent = null;
    let budgetRemaining = 0; // Khởi tạo biến cho ngân sách còn lại
    if (incomeThisMonth > 0) {
      const pct = Math.round((balance / incomeThisMonth) * 100);
      budgetPercent = Math.max(0, Math.min(100, pct)); // Tính phần trăm ngân sách còn lại
      budgetRemaining = fmt2(balance); // Cập nhật ngân sách còn lại
    } else {
      budgetPercent = null; // Nếu không có thu nhập, phần trăm là null
    }

    const result = {
      spendingToday: {
        label: "Chi tiêu hôm nay",
        value: spendingToday,
        percentOfBalance: spendingTodayPercent, // số (2 decimals) hoặc null
        trend: spendingChange,
        trendUp: spendingTrendUp,
      },
      savings: {
        label: "Tiết kiệm được",
        value: savingsThisMonth,
        trend: savingsChange, // so sánh với tháng trước
        trendUp: savingsTrendUp,
      },
      budgetRemaining: {
        label: "Ngân sách còn lại",
        value: budgetRemaining, // Ngân sách còn lại (số tiền)
        percentRemaining: budgetPercent, // Phần trăm ngân sách còn lại
      },
    };

    res.status(200).json({ success: true, stats: result });
  } catch (err) {
    console.error("❌ Lỗi khi lấy stats overview:", err);
    res.status(500).json({ success: false, message: "Lỗi máy chủ" });
  }
});

module.exports = router;
