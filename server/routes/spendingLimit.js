const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const SpendingLimit = require("../models/SpendingLimit");
const TransactionHistory = require("../models/TransactionHistory");
// Hàm kiểm tra ObjectId hợp lệ
function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/* =====================================================
   POST /api/auth/spending-limits
   Tạo hạn mức mới
=====================================================*/
router.post("/spending-limits", async (req, res) => {
  const {
    user_id,
    amount,
    months = 1,
    note = "",
    category_id = null,
    alert_percent = 80,
  } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({
      message: "Thiếu user_id hoặc amount",
    });
  }

  if (!isValidId(user_id)) {
    return res.status(400).json({
      message: "user_id không hợp lệ",
    });
  }

  if (category_id && !isValidId(category_id)) {
    return res.status(400).json({
      message: "category_id không hợp lệ",
    });
  }

  if (Number(amount) <= 0) {
    return res.status(400).json({
      message: "Số tiền hạn mức phải lớn hơn 0",
    });
  }

  try {
    /*
      Nếu category_id = null => hạn mức tổng
      Nếu category_id có giá trị => hạn mức theo danh mục

      Chỉ vô hiệu hóa hạn mức cũ cùng user + cùng category.
      Không tắt toàn bộ hạn mức của user nữa.
    */
    await SpendingLimit.updateMany(
      {
        user_id,
        category_id: category_id || null,
        active: true,
      },
      {
        $set: { active: false },
      }
    );

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + Number(months || 1));

    const limit = new SpendingLimit({
      user_id,
      category_id: category_id || null,
      amount,
      months,
      note,
      alert_percent,
      start_date: startDate,
      end_date: endDate,
      active: true,
    });

    await limit.save();

    res.status(201).json({
      success: true,
      message: "Tạo hạn mức chi tiêu thành công",
      data: limit,
    });
  } catch (err) {
    console.error("❌ Lỗi tạo SpendingLimit:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi tạo hạn mức",
    });
  }
});
/* =====================================================
   GET /api/spending-limit/spending-limits/:userId/summary
   Tính tiến độ hạn mức chi tiêu
=====================================================*/
router.get("/spending-limits/:userId/summary", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "userId không hợp lệ",
      });
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    const limits = await SpendingLimit.find({
      user_id: userObjectId,
      active: true,
    })
      .populate("category_id")
      .sort({ start_date: -1 });

    const result = [];

    for (const limit of limits) {
      const match = {
        user_id: userObjectId,
        transaction_type: "expense",
        status: "completed",
        transaction_date: {
          $gte: limit.start_date,
          $lte: limit.end_date || new Date(),
        },
      };

      // Nếu limit có category thì chỉ tính chi tiêu của category đó
      // Nếu category_id = null thì tính tổng tất cả chi tiêu
      if (limit.category_id) {
        match.category_id = limit.category_id._id;
      }

      const total = await TransactionHistory.aggregate([
        {
          $match: match,
        },
        {
          $group: {
            _id: null,
            total_spent: {
              $sum: "$amount",
            },
          },
        },
      ]);

      const spent = total.length > 0 ? total[0].total_spent : 0;
      const remaining = limit.amount - spent;

      const percent =
        limit.amount > 0 ? Math.round((spent / limit.amount) * 100) : 0;

      let status = "safe";
      let message = "Chi tiêu vẫn trong hạn mức";

      if (percent >= 100) {
        status = "exceeded";
        message = "Bạn đã vượt hạn mức chi tiêu";
      } else if (percent >= limit.alert_percent) {
        status = "warning";
        message = "Bạn sắp chạm hạn mức chi tiêu";
      }

      result.push({
        limit_id: limit._id,
        category: limit.category_id,
        amount: limit.amount,
        spent,
        remaining,
        percent,
        status,
        message,
        note: limit.note,
        months: limit.months,
        start_date: limit.start_date,
        end_date: limit.end_date,
        alert_percent: limit.alert_percent,
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    console.error("❌ Lỗi summary SpendingLimit:", err);

    return res.status(500).json({
      success: false,
      message: "Lỗi server khi tính summary hạn mức",
      error: err.message,
    });
  }
});
/* =====================================================
   GET /api/auth/spending-limits/:userId/current
   Lấy các hạn mức đang active của user
=====================================================*/
router.get("/spending-limits/:userId/current", async (req, res) => {
  const { userId } = req.params;

  if (!isValidId(userId)) {
    return res.status(400).json({
      success: false,
      message: "userId không hợp lệ",
    });
  }

  try {
    const currentLimits = await SpendingLimit.find({
      user_id: userId,
      active: true,
    })
      .populate("category_id")
      .sort({ start_date: -1 });

    res.json({
      success: true,
      data: currentLimits,
    });
  } catch (err) {
    console.error("❌ Lỗi lấy current SpendingLimit:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy hạn mức hiện tại",
    });
  }
});

/* =====================================================
   GET /api/auth/spending-limits/:userId/history
   Lấy lịch sử hạn mức
=====================================================*/
router.get("/spending-limits/:userId/history", async (req, res) => {
  const { userId } = req.params;

  if (!isValidId(userId)) {
    return res.status(400).json({
      success: false,
      message: "userId không hợp lệ",
    });
  }

  try {
    const history = await SpendingLimit.find({
      user_id: userId,
    })
      .populate("category_id")
      .sort({ start_date: -1 });

    res.json({
      success: true,
      data: history,
    });
  } catch (err) {
    console.error("❌ Lỗi lấy history SpendingLimit:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi server khi lấy lịch sử hạn mức",
    });
  }
});

module.exports = router;