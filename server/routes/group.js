const express = require("express");
const router = express.Router();
const Income = require("../models/Income");
const User = require("../models/User");
const Group = require("../models/Group");
const GroupMember = require("../models/GroupMember");
const GroupContribution = require("../models/GroupContribution");
const GroupExpense = require("../models/GroupExpense");
const GroupFund = require("../models/GroupFund");
const TransactionHistory = require("../models/TransactionHistory");
const mongoose = require("mongoose");
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}
// POST /api/groups/createAdd commentMore actions
router.post("/create", async (req, res) => {
  try {
    const { name, description, created_by, memberEmail } = req.body;

    if (!name || !created_by) {
      return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
    }

    // Tìm user từ email nếu có
    let member = null;
    if (memberEmail) {
      member = await User.findOne({ email: memberEmail });
    }

    // Tạo nhóm
    const newGroup = await Group.create({
      name,
      description,
      created_by,
    });

    // Danh sách thành viên (gồm admin + thành viên từ email nếu có)
    const groupMembers = [
      {
        group_id: newGroup._id,
        user_id: created_by,
        role: "admin",
        status: "active",
      },
    ];

    if (member) {
      groupMembers.push({
        group_id: newGroup._id,
        user_id: member._id,
        role: "member",
        status: "active",
      });
    }

    await GroupMember.insertMany(groupMembers);

    return res
      .status(201)
      .json({ message: "Tạo nhóm thành công", group: newGroup });
  } catch (err) {
    console.error("Lỗi tạo nhóm:", err);
    return res.status(500).json({ message: "Đã có lỗi xảy ra khi tạo nhóm" });
  }
});

// GET /api/auth/groups?userId=...
//Lấy danh sách nhóm mà user là thành viên
router.get("/groups", async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ message: "Thiếu userId" });
    }

    // Lấy các group mà user là thành viên
    const groupMembers = await GroupMember.find({ user_id: userId });
    const groupIds = groupMembers.map((gm) => gm.group_id);

    const groups = await Group.find({ _id: { $in: groupIds } });

    return res.json({ groups });
  } catch (err) {
    console.error("Lỗi lấy danh sách nhóm:", err);
    return res.status(500).json({ message: "Đã có lỗi xảy ra khi lấy nhóm" });
  }
});

//tìm kiếm người dùng theo email
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ message: "Thiếu từ khóa tìm kiếm" });

    const users = await User.find({
      email: { $regex: q, $options: "i" },
    }).limit(5); // Giới hạn số gợi ý

    res.json(users);
  } catch (err) {
    console.error("Lỗi tìm kiếm người dùng:", err);
    res.status(500).json({ message: "Lỗi server khi tìm người dùng" });
  }
});
/* =========================================================
   GROUP CONTRIBUTION
========================================================= */
// POST /api/auth/group-contributions  ==> nộp tiền vào quỹ nhóm (tạo quỹ nếu chưa có)
router.post("/group-contributions", async (req, res) => {
  try {
    const {
      group_id, // ID nhóm
      fund_name, // Tên quỹ nhập tay từ FE
      amount,
      payment_method = "cash",
      member_id, // ID người nộp tiền
      description = "", // Mô tả quỹ (tùy chọn)
      end_date = null, // Ngày kết thúc quỹ (tùy chọn)
      purpose = "", // Mục đích quỹ (tùy chọn)
    } = req.body;

    // Validate
    if (
      !isValidId(group_id) ||
      !isValidId(member_id) ||
      !fund_name ||
      !amount ||
      amount <= 0
    ) {
      return res.status(400).json({ error: "Thiếu hoặc sai thông tin" });
    }

    // 1. Tìm hoặc tạo quỹ nhóm theo tên (fund_name) và group_id
    let fund = await GroupFund.findOne({ group_id, name: fund_name });
    if (!fund) {
      fund = await GroupFund.create({
        group_id,
        name: fund_name,
        description,
        end_date,
        purpose,
      });
    }

    // 2. Lưu contribution vào quỹ vừa tìm/đã tạo
    const contribution = await GroupContribution.create({
      fund_id: fund._id,
      member_id,
      amount,
      payment_method,
    });

    // Trừ số dư cá nhân: tạo bản ghi âm trong Income
    await Income.create({
      user_id: member_id,
      amount: -amount,
      source: "group_contribution",
      received_date: new Date(),
      note: `Nạp vào quỹ nhóm "${fund.name}"`,
      status: "pending",
    });
    // Thêm vào lịch sử giao dịch
    await TransactionHistory.create({
      transaction_type: "contribution",
      amount,
      transaction_date: new Date(),
      description: `Nạp vào quỹ nhóm "${fund.name}"`,
      user_id: member_id,
      group_id: group_id,
      status: "completed",
    });
    res.status(201).json({ contribution, fund });
  } catch (err) {
    console.error("❌ Lỗi tạo contribution:", err);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

// PATCH /api/auth/group-contributions/:id/status  ==> xác nhận / từ chối
router.patch("/group-contributions/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status = "confirmed" } = req.body; // confirmed | rejected

    if (!isValidId(id) || !["confirmed", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Tham số không hợp lệ" });
    }

    const updated = await GroupContribution.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Không tìm thấy" });

    res.json(updated);
  } catch (err) {
    console.error("❌ Lỗi cập nhật contribution:", err);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

/* =========================================================
   GROUP EXPENSE
========================================================= */
// POST /api/auth/group-expenses
router.post("/group-expenses", async (req, res) => {
  try {
    const {
      fund_id, // ID của quỹ dùng để phân loại (ví dụ: quỹ chung của nhóm)
      amount,
      user_making_expense_id, // User ID của người dùng đang đăng nhập thực hiện hành động
      date = new Date(),
      description = "",
      category_id,
      receipt_image = "",
    } = req.body;

    const numericAmount = Number(amount);
    console.log(
      "amount nhận từ FE:",
      amount,
      "→ numericAmount:",
      numericAmount
    );

    // --- VALIDATION ---
    if (
      !isValidId(fund_id) ||
      !isValidId(user_making_expense_id) ||
      (category_id && !isValidId(category_id))
    ) {
      return res.status(400).json({
        success: false,
        message: "ID không hợp lệ (quỹ, người dùng, hoặc danh mục).",
      });
    }
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Số tiền không hợp lệ." });
    }

    // --- LẤY GROUP ID TỪ FUND ID ---
    const fundObjectId = new mongoose.Types.ObjectId(fund_id);
    const groupFundDoc = await GroupFund.findById(fundObjectId);
    if (!groupFundDoc) {
      return res
        .status(404)
        .json({ success: false, message: "Quỹ không tồn tại." });
    }
    const groupIdForBalanceCheck = groupFundDoc.group_id;

    // --- KIỂM TRA SỐ DƯ TỔNG CỦA NHÓM ---
    const fundsInGroup = await GroupFund.find({
      group_id: groupIdForBalanceCheck,
    }).select("_id");
    const fundIdsInGroup = fundsInGroup.map((fund) => fund._id);

    let actualGroupBalance = 0;
    if (fundIdsInGroup.length > 0) {
      const contributionData = await GroupContribution.aggregate([
        { $match: { fund_id: { $in: fundIdsInGroup }, status: "pending" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const totalContributions = contributionData[0]?.total || 0;

      const expenseData = await GroupExpense.aggregate([
        {
          $match: {
            fund_id: { $in: fundIdsInGroup },
            approval_status: "approved",
          },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]);
      const totalExpenses = expenseData[0]?.total || 0;
      actualGroupBalance = totalContributions - totalExpenses;
    } else if (numericAmount > 0) {
      return res.status(400).json({
        success: false,
        message: "Nhóm này không có quỹ nào để ghi nhận chi tiêu.",
      });
    }

    // --- THÊM ĐOẠN CODE KIỂM TRA SỐ DƯ BẠN CUNG CẤP VÀO ĐÂY ---
    if (actualGroupBalance < numericAmount) {
      return res.status(400).json({
        success: false,
        message: `Số dư tài khoản nhóm không đủ. Hiện có: ${actualGroupBalance.toLocaleString()} đ`,
      });
    }
    // --- KẾT THÚC KIỂM TRA SỐ DƯ NHÓM ---

    // --- TÌM GROUPMEMBER ID CHO BẢN GHI GROUPEXPENSE ---
    const groupMemberEntry = await GroupMember.findOne({
      group_id: groupIdForBalanceCheck,
      user_id: new mongoose.Types.ObjectId(user_making_expense_id),
    });

    if (!groupMemberEntry) {
      return res.status(403).json({
        success: false,
        message:
          "Người dùng không phải là thành viên của nhóm này hoặc thông tin không chính xác.",
      });
    }
    const memberIdForExpenseRecord = groupMemberEntry._id;

    // --- TẠO BẢN GHI GROUPEXPENSE MỚI ---
    const newGroupExpense = new GroupExpense({
      fund_id: fundObjectId,
      member_id: memberIdForExpenseRecord,
      amount: numericAmount,
      date: date,
      description: description,
      category_id: category_id
        ? new mongoose.Types.ObjectId(category_id)
        : undefined,
      receipt_image: receipt_image,
      approval_status: "approved", // Hoặc "pending" nếu bạn có quy trình duyệt
    });

    await newGroupExpense.save();

    // Ghi vào lịch sử giao dịch nhóm
    const now = new Date();
    await TransactionHistory.create({
      transaction_type: "expense",
      amount: numericAmount,
      transaction_date: now,
      description: description || "Chi tiêu nhóm",
      user_id: user_making_expense_id,
      group_id: groupIdForBalanceCheck,
      status: "completed",
    });

    // Quan trọng: Đảm bảo không có code tạo Income âm cho user_making_expense_id ở đây
    // để không trừ tiền cá nhân khi chi từ tài khoản nhóm.

    res.status(201).json({
      success: true,
      message: "Chi tiêu nhóm đã được tạo và trừ vào tài khoản nhóm",
      expense: newGroupExpense,
    });
  } catch (err) {
    console.error("❌ Lỗi tạo chi tiêu nhóm:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi máy chủ khi tạo chi tiêu nhóm." });
  }
});

// PATCH /api/auth/group-expenses/:id/approve  ==> duyệt / từ chối chi tiêu
router.patch("/group-expenses/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    const { status = "approved" } = req.body; // approved | rejected
    const approver = req.user?._id;

    if (!isValidId(id) || !["approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Tham số không hợp lệ" });
    }

    const updated = await GroupExpense.findByIdAndUpdate(
      id,
      { approval_status: status, approved_by: approver },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: "Không tìm thấy" });

    res.json(updated);
  } catch (err) {
    console.error("❌ Lỗi duyệt expense:", err);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

router.post("/group-funds", async (req, res) => {
  try {
    const {
      group_id,
      name,
      description = "",
      end_date = null,
      purpose = "",
    } = req.body;

    if (!isValidId(group_id) || !name) {
      return res.status(400).json({ error: "Thông tin không hợp lệ" });
    }

    const newFund = await GroupFund.create({
      group_id,
      name,
      description,
      end_date,
      purpose,
    });

    res.status(201).json(newFund);
  } catch (err) {
    console.error("❌ Lỗi tạo quỹ:", err);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

router.get("/group-funds", async (req, res) => {
  try {
    const { groupId } = req.query;
    if (!isValidId(groupId)) {
      return res.status(400).json({ error: "ID không hợp lệ" });
    }

    const funds = await GroupFund.find({ group_id: groupId }).sort({
      created_at: -1,
    });
    res.json({ funds });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách quỹ:", err);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

router.get("/group-funds", async (req, res) => {
  try {
    const { groupId } = req.query;
    if (!isValidId(groupId)) {
      return res.status(400).json({ error: "ID không hợp lệ" });
    }

    const funds = await GroupFund.find({ group_id: groupId }).sort({
      created_at: -1,
    });
    res.json({ funds });
  } catch (err) {
    console.error("❌ Lỗi lấy danh sách quỹ:", err);
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

// GET /api/auth/groups/:groupId/balance
router.get("/groups/:groupId/balance", async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!isValidId(groupId)) {
      return res.status(400).json({ error: "ID không hợp lệ" });
    }
    // Lấy tất cả fund_id của nhóm
    const funds = await GroupFund.find({ group_id: groupId }).select("_id");
    const fundIds = funds.map((f) => f._id);
    const result = await GroupContribution.aggregate([
      { $match: { fund_id: { $in: fundIds } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const balance = result[0]?.total || 0;
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: "Lỗi máy chủ" });
  }
});

// GET /api/groups/:id
router.get("/:id", async (req, res) => {
  try {
    const group = await Group.findById(req.params.id);
    if (!group) return res.status(404).json({ message: "Không tìm thấy nhóm" });
    res.json(group);
  } catch (err) {
    console.error("Lỗi lấy nhóm:", err);
    res.status(500).json({ message: "Đã có lỗi xảy ra khi lấy nhóm" });
  }
});

// GET /groups/:groupId/actual-balance
// Lấy số dư thực tế có thể chi tiêu của một quỹ cụ thể
router.get("/groups/:groupId/actual-balance", async (req, res) => {
  try {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return res
        .status(400)
        .json({ success: false, message: "ID nhóm không hợp lệ." });
    }
    const groupObjectId = new mongoose.Types.ObjectId(groupId);

    // Lấy tất cả các fund_id thuộc nhóm này
    const fundsInGroup = await GroupFund.find({
      group_id: groupObjectId,
    }).select("_id");
    const fundIdsInGroup = fundsInGroup.map((fund) => fund._id);

    if (fundIdsInGroup.length === 0) {
      // Nếu nhóm không có quỹ nào, số dư là 0 (hoặc bạn có thể cho phép đóng góp trực tiếp vào nhóm mà không cần quỹ)
      return res.json({ success: true, balance: 0 });
    }

    // Tính tổng đóng góp đã xác nhận cho tất cả các quỹ trong nhóm
    const contributionData = await GroupContribution.aggregate([
      {
        $match: {
          fund_id: { $in: fundIdsInGroup },
          status: "pending",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalContributions = contributionData[0]?.total || 0;

    // Tính tổng chi tiêu đã duyệt cho tất cả các quỹ trong nhóm
    const expenseData = await GroupExpense.aggregate([
      {
        $match: {
          fund_id: { $in: fundIdsInGroup },
          approval_status: "approved",
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalExpenses = expenseData[0]?.total || 0;

    const actualGroupBalance = totalContributions - totalExpenses;
    res.json({
      success: true,
      balance: actualGroupBalance,
      totalSpent: totalExpenses,
    });
  } catch (err) {
    console.error("Lỗi khi lấy số dư tổng của nhóm:", err);
    res
      .status(500)
      .json({ success: false, message: "Lỗi máy chủ khi tính số dư nhóm." });
  }
});
module.exports = router;