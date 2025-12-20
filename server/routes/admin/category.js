const express = require("express");
const mongoose = require("mongoose");
const Category = require("../../models/Category");

const router = express.Router();

// ------------------------
// Lấy toàn bộ danh mục
// ------------------------
router.get("/", async (req, res) => {
  try {
    const categories = await Category.find().sort({ name: 1 }); // Sắp xếp A-Z
    res.json(categories);
  } catch (err) {
    console.error("❌ Lấy categories lỗi:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

// ------------------------
// Tạo mới một danh mục
// ------------------------
router.post("/", async (req, res) => {
  const { name, description, icon, parent_category_id } = req.body;
  if (!name) return res.status(400).json({ message: "Thiếu name" });

  try {
    const newCat = new Category({
      name,
      description,
      icon,
      parent_category_id: parent_category_id
        ? new mongoose.Types.ObjectId(parent_category_id)
        : null,
    });

    await newCat.save();
    res.status(201).json(newCat);
  } catch (err) {
    console.error("❌ Tạo category lỗi:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

// ------------------------
// Cập nhật một danh mục
// ------------------------
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description, icon, parent_category_id } = req.body;

  try {
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      { name, description, icon, parent_category_id },
      { new: true }
    );

    if (!updatedCategory) {
      return res.status(404).json({ message: "Danh mục không tồn tại" });
    }

    res.json(updatedCategory);
  } catch (err) {
    console.error("❌ Cập nhật category lỗi:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

// ------------------------
// Xóa một danh mục
// ------------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedCategory = await Category.findByIdAndDelete(id);

    if (!deletedCategory) {
      return res.status(404).json({ message: "Danh mục không tồn tại" });
    }

    res.json({ message: "Danh mục đã bị xóa thành công" });
  } catch (err) {
    console.error("❌ Xóa category lỗi:", err);
    res.status(500).json({ message: "Lỗi máy chủ" });
  }
});

module.exports = router;
