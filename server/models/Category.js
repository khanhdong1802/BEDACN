const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const CategorySchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  icon: {
    type: String,
    default: "",
  },
  parent_category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
    default: null,
  },
});

module.exports = mongoose.model("Category", CategorySchema);
