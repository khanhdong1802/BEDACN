const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const GroupSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  group_image: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "active", "closed"],
    default: "pending",
  },
});

module.exports = mongoose.model("Group", GroupSchema);
