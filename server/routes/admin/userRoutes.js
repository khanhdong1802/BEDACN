const express = require("express");
const router = express.Router();
const UserController = require("../../controllers/admin/userController");

// Lấy tất cả người dùng
router.get("/users", UserController.getAllUsers);

// Lấy thông tin người dùng theo ID
router.get("/users/:id", UserController.getUserById);

// Cập nhật thông tin người dùng
router.put("/users/:id", UserController.updateUser);

// Khóa tài khoản người dùng
router.patch("/users/:id/status/lock", UserController.lockUser);

// Mở khóa tài khoản người dùng
router.patch("/users/:id/status/unlock", UserController.unlockUser);

// Tìm kiếm người dùng theo email
router.get("/users/search", UserController.searchUser);
// Xóa người dùng
router.delete("/users/:id", UserController.deleteUser);

module.exports = router;
