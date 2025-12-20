const User = require("../../models/User");
const bcrypt = require("bcryptjs");

class UserController {
  // Lấy tất cả người dùng
  async getAllUsers(req, res) {
    try {
      const users = await User.find().sort({ name: 1 });
      // Kiểm tra và in ra trạng thái người dùng
      //console.log(users); // In để kiểm tra trạng thái
      res.json(users);
    } catch (err) {
      console.error("Error fetching users:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Lấy thông tin người dùng theo ID
  async getUserById(req, res) {
    const { id } = req.params;
    try {
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(user);
    } catch (err) {
      console.error("Error fetching user:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Cập nhật thông tin người dùng
  async updateUser(req, res) {
    const { id } = req.params;
    const updateData = req.body;

    // Nếu có mật khẩu mới thì mã hóa mật khẩu
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    try {
      const updatedUser = await User.findByIdAndUpdate(id, updateData, {
        new: true,
      });
      if (!updatedUser) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json(updatedUser);
    } catch (err) {
      console.error("Error updating user:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Khóa tài khoản người dùng
  async lockUser(req, res) {
    const { id } = req.params;

    try {
      const user = await User.findByIdAndUpdate(
        id,
        { locked: true },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User account locked", user });
    } catch (err) {
      console.error("Error locking user:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Mở khóa tài khoản người dùng
  async unlockUser(req, res) {
    const { id } = req.params;

    try {
      const user = await User.findByIdAndUpdate(
        id,
        { locked: false },
        { new: true }
      );
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({ message: "User account unlocked", user });
    } catch (err) {
      console.error("Error unlocking user:", err);
      res.status(500).json({ message: "Server error" });
    }
  }

  // Tìm kiếm người dùng theo email
  async searchUser(req, res) {
    const { q } = req.query;
    try {
      const users = await User.find({
        email: { $regex: q, $options: "i" },
      }).limit(5);
      res.json(users);
    } catch (err) {
      console.error("Error searching user:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
  // Hàm xóa người dùng
  async deleteUser(req, res) {
    const { id } = req.params;

    try {
      // Kiểm tra nếu người dùng đang là admin (tránh xóa tài khoản admin)
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.role === "admin") {
        return res.status(400).json({ message: "Cannot delete an admin user" });
      }

      // Tiến hành xóa người dùng
      await User.findByIdAndDelete(id);

      res.json({ message: "User deleted successfully" });
    } catch (err) {
      console.error("Error deleting user:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
}

module.exports = new UserController();
