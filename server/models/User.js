const mongoose = require("mongoose");
const argon2 = require("argon2"); // dùng lại argon2, không đổi sang bcrypt
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  phone: {
    type: String,
  },
  avatar: {
    type: String,
    default: null,
  },

  // CHỈ required khi là tài khoản local (không phải Google)
  password: {
    type: String,
    required: function () {
      return this.provider === "local";
    },
  },

  googleId: {
    type: String,
    default: null,
  },

  provider: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },

  role: {
    type: String,
    enum: ["admin", "user"],
    default: "user",
  },
  locked: {
    type: Boolean,
    default: false,
  },
  registered_at: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("User", UserSchema);
