const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const User = require("../../models/User");
const Group = require("../../models/Group");
const TransactionHistory = require("../../models/TransactionHistory");

// GET /api/admin/stats/overview
router.get("/stats/overview", async (req, res) => {
  try {
    // Totals
    const totalUsers = await User.countDocuments();
    const totalGroups = await Group.countDocuments();
    const totalTransactions = await TransactionHistory.countDocuments();

    // Month ranges
    const now = new Date();
    const startCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    // New users counts
    const newUsersThisMonth = await User.countDocuments({
      createdAt: { $gte: startCurrentMonth },
    });
    const newUsersLastMonth = await User.countDocuments({
      createdAt: { $gte: startPrevMonth, $lt: startCurrentMonth },
    });

    // Growth calculation
    let userGrowthPercent = null;
    if (newUsersLastMonth > 0) {
      userGrowthPercent =
        ((newUsersThisMonth - newUsersLastMonth) / newUsersLastMonth) * 100;
    } else if (newUsersThisMonth > 0 && newUsersLastMonth === 0) {
      // from 0 -> some users: treat as 100% (or you can set null)
      userGrowthPercent = 100;
    } else {
      userGrowthPercent = 0;
    }
    // Round to 2 decimals
    userGrowthPercent = Math.round(userGrowthPercent * 100) / 100;

    return res.json({
      totalUsers,
      totalGroups,
      totalTransactions,
      newUsersThisMonth,
      newUsersLastMonth,
      userGrowthPercent,
    });
  } catch (err) {
    console.error("Error /stats/overview:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
