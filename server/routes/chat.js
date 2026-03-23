const express = require("express");
const router = express.Router();
const Message = require("../models/Message");

// Lấy lịch sử chat của group
router.get("/:groupId", async (req, res) => {
  try {
    const messages = await Message.find({
      groupId: req.params.groupId,
    })
      .populate("senderId", "name avatar")
      .sort({ createdAt: 1 });

    res.json(messages);
  } catch (err) {
    res.status(500).json({ message: "Không lấy được lịch sử chat" });
  }
});

module.exports = router;
