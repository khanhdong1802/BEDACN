const express = require("express");
const router = express.Router();
const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Income = require("../models/Income");
const Withdraw = require("../models/Withdraw");
const Expense = require("../models/Expense");
const User = require("../models/User");
const Category = require("../models/Category");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const SpendingLimit = require("../models/SpendingLimit");
const GroupContribution = require("../models/GroupContribution");
const GroupExpense = require("../models/GroupExpense");
const GroupFund = require("../models/GroupFund");
const TransactionHistory = require("../models/TransactionHistory");
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

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
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Vui lòng điền đầy đủ thông tin" });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Email không đúng" });
    }

    const passwordValid = await argon2.verify(user.password, password);
    if (!passwordValid) {
      return res
        .status(400)
        .json({ success: false, message: "Mật khẩu không đúng" });
    }

    const accessToken = jwt.sign(
      { userId: user._id },
      process.env.ACCESS_TOKEN_SECRET
    );

    // Lưu thông tin người dùng (name, email) vào localStorage trong frontend
    res.status(200).json({
      success: true,
      message: "Đăng nhập thành công",
      accessToken,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Lỗi máy chủ" });
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

module.exports = router;
