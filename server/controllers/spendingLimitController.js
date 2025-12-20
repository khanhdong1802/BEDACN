const express = require("express");
const SpendingLimit = require("../models/SpendingLimit");

class SpendingLimitController {
  // Create a new spending limit
  async createSpendingLimit(req, res) {
    const { user_id, amount, months, note } = req.body;

    if (!user_id || !amount) {
      return res.status(400).json({ message: "Thiếu user_id hoặc amount" });
    }

    try {
      // Deactivate old active spending limits if any
      await SpendingLimit.updateMany(
        { user_id, active: true },
        { $set: { active: false } }
      );

      const startDate = new Date();
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + (months || 1)); // default to 1 month

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
  }

  // Get current active spending limit for a user
  async getCurrentSpendingLimit(req, res) {
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
  }

  // Get spending limit history for a user
  async getSpendingLimitHistory(req, res) {
    const { userId } = req.params;
    try {
      const history = await SpendingLimit.find({ user_id: userId }).sort({
        start_date: -1,
      });
      res.json(history);
    } catch (err) {
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = new SpendingLimitController();
