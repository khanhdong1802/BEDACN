exports.updateUser = async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    const updateData = {
      name,
      email,
      phone,
    };

    if (password) {
      updateData.password = password;
    }

    if (req.file) {
      updateData.avatar = `/uploads/avatars/${req.file.filename}`;
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.json({
      message: "Update thành công",
      user,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};